import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency } from '../utils/formatters';
import { Trash2, Search, Calculator, Plus, Car, Home, FileText, Pencil, Filter, X, ShoppingBag, AlertTriangle, Loader, Percent } from 'lucide-react';
import { ProductType } from '../types';
import { calculateCurrentCreditValue } from '../services/calculationService';

const QuotaList = () => {
  const { quotas, deleteQuota, setCurrentQuota, administrators, companies, indices, allCreditUsages } = useConsortium();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Filter States - Lendo diretamente da URL para persistência
  const search = searchParams.get('q') || '';
  const filterAdmin = searchParams.get('admin') || '';
  const filterCompany = searchParams.get('company') || '';
  const filterStatus = searchParams.get('status') || '';

  // Função auxiliar para atualizar a URL mantendo os outros filtros
  const updateFilter = (key: string, value: string) => {
      setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          if (value) {
              newParams.set(key, value);
          } else {
              newParams.delete(key);
          }
          return newParams;
      }, { replace: true });
  };

  // Delete Modal State
  const [quotaToDelete, setQuotaToDelete] = useState<{ id: string, label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredQuotas = quotas.filter(q => {
    const matchesSearch = 
      (q.group || '').toLowerCase().includes(search.toLowerCase()) || 
      (q.quotaNumber || '').toLowerCase().includes(search.toLowerCase()) || 
      (q.contractNumber || '').toLowerCase().includes(search.toLowerCase());

    const matchesAdmin = !filterAdmin || q.administratorId === filterAdmin;
    const matchesCompany = !filterCompany || q.companyId === filterCompany;

    let matchesStatus = true;
    if (filterStatus === 'CONTEMPLATED') matchesStatus = q.isContemplated;
    if (filterStatus === 'ACTIVE') matchesStatus = !q.isContemplated;

    return matchesSearch && matchesAdmin && matchesCompany && matchesStatus;
  });

  const handleSimulate = (quota: any) => {
    setCurrentQuota(quota);
    navigate('/simulate');
  };

  const confirmDelete = async () => {
    if (!quotaToDelete) return;
    setIsDeleting(true);
    try {
      await deleteQuota(quotaToDelete.id);
      setQuotaToDelete(null);
    } catch (error) {
      console.error("Erro ao deletar cota:", error);
      alert('Erro ao excluir a cota. Verifique sua conexão com o banco de dados.');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const hasActiveFilters = search || filterAdmin || filterCompany || filterStatus;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Minhas Cotas</h1>
          <p className="text-slate-500">Gerencie suas cotas cadastradas no banco de dados</p>
        </div>
        <button 
          onClick={() => navigate('/new')}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium"
        >
          <Plus size={20} /> Nova Cota
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por Grupo, Cota ou Contrato..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
            value={search}
            onChange={(e) => updateFilter('q', e.target.value)}
          />
        </div>

        <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
                <select 
                    value={filterCompany} 
                    onChange={(e) => updateFilter('company', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Empresas</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <select 
                    value={filterAdmin} 
                    onChange={(e) => updateFilter('admin', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Administradoras</option>
                    {administrators.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <select 
                    value={filterStatus} 
                    onChange={(e) => updateFilter('status', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todos os Status</option>
                    <option value="CONTEMPLATED">Contempladas</option>
                    <option value="ACTIVE">Em Andamento</option>
                </select>
            </div>
            
            {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="px-4 py-2 text-slate-500 hover:text-red-500 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors flex items-center justify-center gap-1 text-sm font-medium whitespace-nowrap"
                >
                    <X size={16} /> Limpar
                </button>
            )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredQuotas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold">Produto</th>
                  <th className="p-4 font-semibold">Identificação</th>
                  <th className="p-4 font-semibold text-right">Valor Carta</th>
                  <th className="p-4 font-semibold text-right bg-emerald-50/50 text-emerald-800 border-l border-emerald-100">Vlr Atual</th>
                  <th className="p-4 font-semibold text-right bg-blue-50/50 text-blue-800 border-l border-blue-100">Taxas (TA/FR)</th>
                  <th className="p-4 font-semibold text-right bg-amber-50 text-amber-800 border-l border-emerald-100">Cred. Usado</th>
                  <th className="p-4 font-semibold text-center">Plano</th>
                  <th className="p-4 font-semibold text-center">Índice</th>
                  <th className="p-4 font-semibold text-center">Prazo</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQuotas.map((quota) => {
                  const currentValue = calculateCurrentCreditValue(quota, indices);
                  const usedCredit = allCreditUsages
                      .filter(u => u.quotaId === quota.id)
                      .reduce((acc, curr) => acc + curr.amount, 0);

                  const adminFeeValue = (quota.adminFeeRate / 100) * quota.creditValue;
                  const reserveFundValue = (quota.reserveFundRate / 100) * quota.creditValue;

                  return (
                  <tr key={quota.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700 font-medium">
                        {quota.productType === ProductType.VEHICLE ? <Car size={18} className="text-blue-500" /> : <Home size={18} className="text-orange-500" />}
                        <span className="text-sm">{quota.productType === ProductType.VEHICLE ? 'Veículo' : 'Imóvel'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-slate-800">Gp: {quota.group} / Cota: {quota.quotaNumber}</div>
                      {quota.contractNumber && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <FileText size={10} /> {quota.contractNumber}
                        </div>
                      )}
                      <div className="flex flex-col mt-1 gap-0.5">
                         {quota.administratorId && (
                             <span className="text-[10px] text-slate-400 uppercase">
                                 ADM: {administrators.find(a => a.id === quota.administratorId)?.name || '...'}
                             </span>
                         )}
                         {quota.companyId && (
                             <span className="text-[10px] text-slate-400 uppercase">
                                 EMP: {companies.find(c => c.id === quota.companyId)?.name || '...'}
                             </span>
                         )}
                      </div>
                    </td>
                    <td className="p-4 text-right text-slate-600 text-sm">
                      {formatCurrency(quota.creditValue)}
                    </td>
                    <td className="p-4 text-right font-bold text-emerald-700 bg-emerald-50/30 border-l border-emerald-50">
                      {formatCurrency(currentValue)}
                    </td>
                    <td className="p-4 text-right bg-blue-50/20 border-l border-blue-50">
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-blue-500 uppercase">TA:</span>
                          <span className="text-xs font-black text-blue-700">{quota.adminFeeRate.toFixed(2)}%</span>
                          <span className="text-[10px] text-blue-400">({formatCurrency(adminFeeValue)})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">FR:</span>
                          <span className="text-xs font-black text-indigo-700">{quota.reserveFundRate.toFixed(2)}%</span>
                          <span className="text-[10px] text-indigo-400">({formatCurrency(reserveFundValue)})</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium text-amber-700 bg-amber-50/30 border-l border-emerald-50">
                        {usedCredit > 0 ? formatCurrency(usedCredit) : '-'}
                    </td>
                    <td className="p-4 text-center text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        quota.paymentPlan === 'NORMAL' ? 'bg-slate-100 text-slate-600' : 
                        quota.paymentPlan === 'REDUZIDA' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {quota.paymentPlan}
                      </span>
                    </td>
                    <td className="p-4 text-center text-sm font-medium text-slate-600">
                       {quota.correctionIndex}
                    </td>
                    <td className="p-4 text-center text-slate-600">
                      {quota.termMonths} meses
                    </td>
                    <td className="p-4 text-center">
                      {quota.isContemplated ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Contemplada
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          Em andamento
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {quota.isContemplated && (
                            <button 
                              onClick={() => navigate(`/usage/${quota.id}`)}
                              className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors border border-transparent hover:border-violet-200"
                              title="Gestão de Uso do Crédito"
                            >
                              <ShoppingBag size={18} />
                            </button>
                        )}
                        <button 
                          onClick={() => navigate(`/edit/${quota.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button 
                          onClick={() => handleSimulate(quota)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                          title="Simular"
                        >
                          <Calculator size={18} />
                        </button>
                        <button 
                          onClick={() => setQuotaToDelete({ id: quota.id, label: `${quota.group}/${quota.quotaNumber}` })}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Search size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma cota encontrada</p>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {quotaToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Excluir Cota?</h3>
              <p className="text-slate-500 mb-6">
                Você está prestes a excluir a cota <span className="font-bold text-slate-800">{quotaToDelete.label}</span>. 
                Esta ação apagará permanentemente todos os pagamentos e históricos vinculados a ela.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader className="animate-spin" size={20} /> : <Trash2 size={20} />}
                  {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={() => setQuotaToDelete(null)}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Manter Cota
                </button>
              </div>
            </div>
            <div className="bg-slate-50 p-4 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
              Ação Irreversível
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotaList;