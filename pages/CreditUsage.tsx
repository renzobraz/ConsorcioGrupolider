
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { CreditUsageEntry } from '../types';
import { generateSchedule } from '../services/calculationService';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ArrowLeft, Plus, Trash2, ShoppingBag, DollarSign, Wallet, TrendingDown, Pencil, X, Gavel, TrendingUp, Loader } from 'lucide-react';

const CreditUsage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getQuotaById, indices, getCreditUsages, addCreditUsage, deleteCreditUsage } = useConsortium();
  
  const quota = getQuotaById(id || '');
  const [usages, setUsages] = useState<CreditUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    seller: ''
  });

  useEffect(() => {
    if (id) {
        loadData();
    }
  }, [id]);

  const loadData = async () => {
      if(!id) return;
      setLoading(true);
      try {
        const data = await getCreditUsages(id);
        setUsages(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
  };

  if (!quota) {
    return <div className="p-8 text-center text-slate-500">Cota não encontrada.</div>;
  }

  // Calculate Available Credit
  const schedule = generateSchedule(quota, indices);
  const todayStr = new Date().toISOString().split('T')[0];
  
  let currentCredit = quota.creditValue;
  if (schedule.length > 0) {
      // Use corrected credit logic from schedule
      const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= todayStr);
      if (pastOrPresent.length > 0) {
          currentCredit = pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue;
      } else {
          currentCredit = schedule[0].correctedCreditValue || quota.creditValue;
      }
  }

  const manualAdjustment = quota.creditManualAdjustment || 0;
  const embeddedBid = quota.bidEmbedded || 0;
  
  // Formula: (Carta + Atualização) - Embutido
  const grossTotal = currentCredit + manualAdjustment;
  const netAvailableCredit = grossTotal - embeddedBid; 

  const totalUsed = usages.reduce((acc, curr) => acc + curr.amount, 0);
  
  // Remaining Balance = Net Available - Total Used
  const remaining = netAvailableCredit - totalUsed;
  
  // Percent used based on Net Available Credit (Real purchasing power)
  const percentUsed = netAvailableCredit > 0 ? (totalUsed / netAvailableCredit) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.description || !form.amount || !id) return;

      const entry: CreditUsageEntry = {
          id: editingId || crypto.randomUUID(), // Use existing ID if editing
          quotaId: id,
          description: form.description,
          amount: parseFloat(form.amount),
          date: form.date,
          seller: form.seller
      };

      await addCreditUsage(entry);
      
      // Reset Form
      setEditingId(null);
      setForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0], seller: '' });
      
      loadData(); // Refresh list
  };

  const handleEdit = (u: CreditUsageEntry) => {
      setEditingId(u.id);
      setForm({
          description: u.description,
          amount: u.amount.toString(),
          date: u.date,
          seller: u.seller || ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
      setEditingId(null);
      setForm({ description: '', amount: '', date: new Date().toISOString().split('T')[0], seller: '' });
  };

  const handleDelete = async (usageId: string) => {
      if (window.confirm('Tem certeza que deseja excluir este lançamento?')) {
          setIsDeleting(usageId);
          try {
              // Wait for DB deletion first
              await deleteCreditUsage(usageId);
              // Then reload data to ensure sync
              await loadData();
          } catch (error) {
              console.error("Error deleting usage:", error);
              alert("Erro ao excluir. Verifique sua conexão.");
          } finally {
              setIsDeleting(null);
          }
      }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <button onClick={() => navigate('/quotas')} className="text-slate-400 hover:text-slate-600 transition-colors">
                <ArrowLeft size={24} />
            </button>
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <ShoppingBag className="text-emerald-600" /> Gestão de Uso do Crédito
                </h1>
                <p className="text-slate-500 text-sm">
                    Cota {quota.group}/{quota.quotaNumber} - Contemplada em {formatDate(quota.contemplationDate || '')}
                </p>
            </div>
        </div>
      </div>

      {/* DASHBOARD CARDS - Improved Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {/* Card 1: Valor Bruto */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <DollarSign size={48} className="text-slate-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                  Valor Carta (Base)
              </p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(currentCredit)}</p>
              <p className="text-[10px] text-slate-400">Automático (INCC/IPCA)</p>
          </div>

          {/* Card 2: Atualização */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={48} className="text-blue-600" />
              </div>
              <p className="text-[10px] font-bold text-blue-600 uppercase flex items-center gap-1 mb-1">
                  Atualização (+)
              </p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(manualAdjustment)}</p>
              <p className="text-[10px] text-slate-400">Ajuste Manual</p>
          </div>

          {/* Card 3: Lance Embutido */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-orange-300 transition-colors">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Gavel size={48} className="text-orange-600" />
              </div>
              <p className="text-[10px] font-bold text-orange-600 uppercase flex items-center gap-1 mb-1">
                  Lance Embutido (-)
              </p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(embeddedBid)}</p>
              <p className="text-[10px] text-slate-400">Descontado do Total</p>
          </div>

          {/* Card 4: Total Utilizado */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-colors">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ShoppingBag size={48} className="text-amber-600" />
              </div>
              <p className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1 mb-1">
                  Total Compras (-)
              </p>
              <p className="text-lg font-bold text-amber-600">{formatCurrency(totalUsed)}</p>
              <div className="w-full bg-slate-100 rounded-full h-1 mt-2 overflow-hidden">
                  <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${Math.min(percentUsed, 100)}%` }}></div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{percentUsed.toFixed(1)}% utilizado</p>
          </div>

          {/* Card 5: Saldo Remanescente */}
          <div className={`p-4 rounded-xl border shadow-sm relative overflow-hidden ${remaining >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="absolute top-0 right-0 p-2 opacity-10">
                  <Wallet size={48} className={remaining >= 0 ? 'text-emerald-700' : 'text-red-700'} />
              </div>
              <p className={`text-[10px] font-bold uppercase flex items-center gap-1 mb-1 ${remaining >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  Saldo Disponível (=)
              </p>
              <p className={`text-xl font-bold ${remaining >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                  {formatCurrency(remaining)}
              </p>
              <p className={`text-[10px] mt-1 ${remaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Livre para uso
              </p>
          </div>
      </div>

      {/* FORM */}
      <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingId ? 'border-blue-300 ring-2 ring-blue-50' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`text-lg font-bold flex items-center gap-2 ${editingId ? 'text-blue-700' : 'text-slate-800'}`}>
                {editingId ? <Pencil size={20} /> : <Plus size={20} className="text-emerald-600" />}
                {editingId ? 'Editar Lançamento' : 'Registrar Nova Despesa/Compra'}
            </h2>
            {editingId && (
                <button onClick={handleCancelEdit} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
                    <X size={14}/> Cancelar
                </button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Descrição do Bem/Serviço *</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="Ex: Apartamento, Reforma, Carro..." 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                  />
              </div>
              <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Fornecedor (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Loja ou Vendedor" 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.seller}
                    onChange={e => setForm({...form, seller: e.target.value})}
                  />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Data *</label>
                  <input 
                    required 
                    type="date" 
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.date}
                    onChange={e => setForm({...form, date: e.target.value})}
                  />
              </div>
              <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600 mb-1">Valor (R$) *</label>
                  <input 
                    required 
                    type="number" 
                    step="0.01"
                    placeholder="0,00"
                    className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                  />
              </div>
              <div className="md:col-span-1">
                  <button type="submit" className={`w-full h-[46px] text-white rounded-lg transition-colors flex items-center justify-center ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                      {editingId ? <Pencil size={20} /> : <Plus size={24} />}
                  </button>
              </div>
          </form>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 p-4 border-b border-slate-200 font-bold text-slate-700">
              Histórico de Utilização
          </div>
          {loading ? (
              <div className="p-8 text-center text-slate-400">Carregando...</div>
          ) : usages.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Nenhum registro de uso do crédito.</div>
          ) : (
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                          <tr>
                              <th className="px-6 py-3">Data</th>
                              <th className="px-6 py-3">Descrição</th>
                              <th className="px-6 py-3">Fornecedor</th>
                              <th className="px-6 py-3 text-right">Valor</th>
                              <th className="px-6 py-3 text-right">Ação</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {usages.map(u => (
                              <tr key={u.id} className={`hover:bg-slate-50 ${editingId === u.id ? 'bg-blue-50' : ''}`}>
                                  <td className="px-6 py-4 text-slate-600">{formatDate(u.date)}</td>
                                  <td className="px-6 py-4 font-medium text-slate-800">{u.description}</td>
                                  <td className="px-6 py-4 text-slate-500">{u.seller || '-'}</td>
                                  <td className="px-6 py-4 text-right font-bold text-amber-600">
                                      - {formatCurrency(u.amount)}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                          <button 
                                            disabled={isDeleting === u.id}
                                            onClick={() => handleEdit(u)} 
                                            className="text-blue-400 hover:text-blue-600 transition-colors disabled:opacity-30" 
                                            title="Editar"
                                          >
                                              <Pencil size={18} />
                                          </button>
                                          <button 
                                            disabled={isDeleting === u.id}
                                            onClick={() => handleDelete(u.id)} 
                                            className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30" 
                                            title="Excluir"
                                          >
                                              {isDeleting === u.id ? <Loader className="animate-spin" size={18} /> : <Trash2 size={18} />}
                                          </button>
                                      </div>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          )}
      </div>
    </div>
  );
};

export default CreditUsage;
