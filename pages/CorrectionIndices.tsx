
import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { CorrectionIndex, MonthlyIndex } from '../types';
import { Trash2, Plus, TrendingUp, Pencil, X, Filter, Calculator, Calendar, Info, Star } from 'lucide-react';

const CorrectionIndices = () => {
  const { indices, addIndex, updateIndex, deleteIndex } = useConsortium();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    month: new Date().toISOString().slice(0, 7),
    type: CorrectionIndex.INCC,
    rate: 0.5
  });

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateStr = `${form.month}-01`;
    if (indices.some(idx => idx.type === form.type && idx.date === dateStr && idx.id !== editingId)) {
      alert("Índice já cadastrado para este mês."); return;
    }
    const indexData: MonthlyIndex = { id: editingId || crypto.randomUUID(), type: form.type, date: dateStr, rate: Number(form.rate) };
    editingId ? updateIndex(indexData) : addIndex(indexData);
    setEditingId(null);
    setForm({ month: new Date().toISOString().slice(0, 7), type: form.type, rate: 0.5 });
  };

  const filteredIndices = [...indices].sort((a, b) => b.date.localeCompare(a.date)).filter(idx => {
    const m = idx.date.slice(0, 7);
    if (filterStart && m < filterStart) return false;
    if (filterEnd && m > filterEnd) return false;
    return true;
  });

  const getStats = (type: CorrectionIndex) => {
    const items = filteredIndices.filter(i => i.type === type);
    const simple = items.reduce((a, b) => a + b.rate, 0);
    const compound = (items.reduce((a, b) => a * (1 + b.rate/100), 1) - 1) * 100;
    return { simple, compound, count: items.length };
  };

  const Summary = ({ title, type, color }: any) => {
      const s = getStats(type);
      return (
          <div className={`bg-white p-4 rounded-xl border-l-4 ${color} shadow-sm flex-1`}>
              <p className="text-[10px] font-bold text-slate-400 uppercase">{title}</p>
              <div className="flex items-baseline gap-2">
                  <span className="text-lg font-black text-slate-800">{s.compound.toFixed(4)}%</span>
                  <span className="text-xs text-slate-400">(Soma: {s.simple.toFixed(2)}%)</span>
              </div>
              <p className="text-[9px] text-slate-400 mt-1">{s.count} meses selecionados</p>
          </div>
      );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800">Índices de Correção</h1>
          <div className="flex gap-2 print:hidden">
              <input type="month" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border rounded p-1 text-xs" />
              <input type="month" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border rounded p-1 text-xs" />
              {(filterStart || filterEnd) && <button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="text-red-500"><X size={16}/></button>}
          </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
          <Summary title="INCC Acumulado" type={CorrectionIndex.INCC} color="border-blue-500" />
          <Summary title="IPCA Acumulado" type={CorrectionIndex.IPCA} color="border-orange-500" />
          <Summary title="CDI Acumulado" type={CorrectionIndex.CDI} color="border-violet-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold mb-4 flex items-center gap-2">{editingId ? <Pencil size={18}/> : <Plus size={18}/>} {editingId ? 'Editar' : 'Novo Lançamento'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value as any})} className="w-full border rounded p-2 text-sm">
                      <optgroup label="Mensais"><option value={CorrectionIndex.INCC}>INCC (Mensal)</option><option value={CorrectionIndex.IPCA}>IPCA (Mensal)</option><option value={CorrectionIndex.CDI}>CDI</option></optgroup>
                      <optgroup label="Acumulados 12m"><option value={CorrectionIndex.INCC_12}>INCC (Anual)</option><option value={CorrectionIndex.IPCA_12}>IPCA (Anual)</option></optgroup>
                  </select>
                  <input type="month" value={form.month} onChange={e => setForm({...form, month: e.target.value})} className="w-full border rounded p-2 text-sm" />
                  <input type="number" step="0.0001" value={form.rate} onChange={e => setForm({...form, rate: parseFloat(e.target.value)})} className="w-full border rounded p-2 text-sm font-bold" />
                  <button type="submit" className="w-full bg-emerald-600 text-white p-2 rounded font-bold">{editingId ? 'Salvar' : 'Adicionar'}</button>
                  {editingId && <button onClick={() => setEditingId(null)} className="w-full text-slate-500 text-xs">Cancelar Edição</button>}
              </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                      <tr><th className="p-4">Mês</th><th className="p-4">Índice</th><th className="p-4 text-right">Taxa %</th><th className="p-4 text-right">Ações</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                      {filteredIndices.map(idx => (
                          <tr key={idx.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-4 font-medium">{new Date(idx.date+'T12:00:00').toLocaleDateString('pt-BR', {month:'2-digit', year:'numeric'})}</td>
                              <td className="p-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${idx.type.includes('12') ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                      {idx.type} {idx.type.includes('12') && ' (ANUAL)'}
                                  </span>
                              </td>
                              <td className="p-4 text-right font-bold text-slate-800">{idx.rate.toFixed(4)}%</td>
                              <td className="p-4 text-right">
                                  <button onClick={() => {setEditingId(idx.id); setForm({month: idx.date.slice(0,7), type: idx.type, rate: idx.rate});}} className="p-1 text-blue-500 mr-2"><Pencil size={14}/></button>
                                  <button onClick={() => deleteIndex(idx.id)} className="p-1 text-red-400"><Trash2 size={14}/></button>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default CorrectionIndices;
