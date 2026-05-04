
import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { CorrectionIndex, MonthlyIndex } from '../types';
import { Trash2, Plus, TrendingUp, Pencil, X, Filter, Calculator, Calendar, Info, Star, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

const CorrectionIndices = () => {
  const { indices, addIndex, updateIndex, deleteIndex } = useConsortium();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    type: CorrectionIndex.INCC,
    rate: 0.5
  });

  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  
  // Column Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRate, setFilterRate] = useState('');

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof MonthlyIndex, direction: 'asc' | 'desc' } | null>({ key: 'date', direction: 'desc' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedMonth = form.month.toString().padStart(2, '0');
    const dateStr = `${form.year}-${formattedMonth}-01`;
    
    if (indices.some(idx => idx.type === form.type && idx.date === dateStr && idx.id !== editingId)) {
      alert("Índice já cadastrado para este mês."); return;
    }
    
    const indexData: MonthlyIndex = { id: editingId || crypto.randomUUID(), type: form.type, date: dateStr, rate: Number(form.rate) };
    editingId ? updateIndex(indexData) : addIndex(indexData);
    setEditingId(null);
    
    // Auto-advance to next month
    let nextMonth = form.month + 1;
    let nextYear = form.year;
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
    }
    
    setForm({ month: nextMonth, year: nextYear, type: form.type, rate: 0.5 });
  };

  let processedIndices = [...indices].filter(idx => {
    const m = idx.date.slice(0, 7);
    if (filterStart && m < filterStart) return false;
    if (filterEnd && m > filterEnd) return false;
    
    if (filterMonth) {
      const formattedDate = new Date(idx.date+'T12:00:00').toLocaleDateString('pt-BR', {month:'2-digit', year:'numeric'});
      if (!formattedDate.includes(filterMonth)) return false;
    }
    if (filterType && idx.type !== filterType) return false;
    if (filterRate && !idx.rate.toFixed(4).includes(filterRate)) return false;
    
    return true;
  });

  if (sortConfig) {
    processedIndices.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  const filteredIndices = processedIndices;

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

  const requestSort = (key: keyof MonthlyIndex) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortHeader = ({ label, sortKey, align = 'left' }: { label: string, sortKey: keyof MonthlyIndex, align?: 'left'|'right' }) => (
      <th 
        className={`p-4 cursor-pointer hover:bg-slate-100 transition-colors group select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
        onClick={() => requestSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
            {label}
            <div className="flex flex-col opacity-50 group-hover:opacity-100">
                {sortConfig?.key === sortKey ? (
                    sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                ) : (
                    <ArrowUpDown size={10} />
                )}
            </div>
        </div>
      </th>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-end items-center">
          <div className="flex gap-2 print:hidden">
              <input type="month" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="border rounded p-1 text-xs" />
              <input type="month" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="border rounded p-1 text-xs" />
              {(filterStart || filterEnd) && <button onClick={() => {setFilterStart(''); setFilterEnd('');}} className="text-red-500"><X size={16}/></button>}
          </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
          <Summary title="INCC Acumulado" type={CorrectionIndex.INCC} color="border-blue-500" />
          <Summary title="IPCA Acumulado" type={CorrectionIndex.IPCA} color="border-orange-500" />
          <Summary title="INPC Acumulado" type={CorrectionIndex.INPC} color="border-emerald-500" />
          <Summary title="CDI Acumulado" type={CorrectionIndex.CDI} color="border-violet-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="font-bold mb-4 flex items-center gap-2">{editingId ? <Pencil size={18}/> : <Plus size={18}/>} {editingId ? 'Editar' : 'Novo Lançamento'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value as any})} className="w-full border rounded p-2 text-sm">
                      <optgroup label="Mensais"><option value={CorrectionIndex.INCC}>INCC (Mensal)</option><option value={CorrectionIndex.IPCA}>IPCA (Mensal)</option><option value={CorrectionIndex.INPC}>INPC (Mensal)</option><option value={CorrectionIndex.CDI}>CDI</option></optgroup>
                      <optgroup label="Acumulados 12m"><option value={CorrectionIndex.INCC_12}>INCC (Anual)</option><option value={CorrectionIndex.IPCA_12}>IPCA (Anual)</option><option value={CorrectionIndex.INPC_12}>INPC (Anual)</option></optgroup>
                  </select>
                  <div className="flex gap-2">
                      <select value={form.month} onChange={e => setForm({...form, month: parseInt(e.target.value)})} className="w-2/3 border rounded p-2 text-sm">
                          <option value={1}>Janeiro</option>
                          <option value={2}>Fevereiro</option>
                          <option value={3}>Março</option>
                          <option value={4}>Abril</option>
                          <option value={5}>Maio</option>
                          <option value={6}>Junho</option>
                          <option value={7}>Julho</option>
                          <option value={8}>Agosto</option>
                          <option value={9}>Setembro</option>
                          <option value={10}>Outubro</option>
                          <option value={11}>Novembro</option>
                          <option value={12}>Dezembro</option>
                      </select>
                      <input type="number" min="1990" max="2100" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value)})} className="w-1/3 border rounded p-2 text-sm text-center" />
                  </div>
                  <input type="number" step="0.0001" value={Number.isNaN(form.rate) ? '' : form.rate} onChange={e => setForm({...form, rate: parseFloat(e.target.value)})} className="w-full border rounded p-2 text-sm font-bold" />
                  <button type="submit" className="w-full bg-emerald-600 text-white p-2 rounded font-bold">{editingId ? 'Salvar' : 'Adicionar'}</button>
                  {editingId && <button onClick={() => setEditingId(null)} className="w-full text-slate-500 text-xs">Cancelar Edição</button>}
              </form>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
                      <tr>
                          <SortHeader label="Mês" sortKey="date" />
                          <SortHeader label="Índice" sortKey="type" />
                          <SortHeader label="Taxa %" sortKey="rate" align="right" />
                          <th className="p-4 text-right">Ações</th>
                      </tr>
                      <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 pb-3">
                              <input 
                                type="text" 
                                placeholder="Filtrar mês (MM/AAAA)" 
                                value={filterMonth}
                                onChange={e => setFilterMonth(e.target.value)}
                                className="w-full border border-slate-300 rounded p-1 text-xs font-normal normal-case"
                              />
                          </th>
                          <th className="px-4 pb-3">
                              <select 
                                value={filterType}
                                onChange={e => setFilterType(e.target.value)}
                                className="w-full border border-slate-300 rounded p-1 text-xs font-normal normal-case"
                              >
                                  <option value="">Todos</option>
                                  {Object.values(CorrectionIndex).map(type => (
                                      <option key={type} value={type}>{type}</option>
                                  ))}
                              </select>
                          </th>
                          <th className="px-4 pb-3">
                              <input 
                                type="text" 
                                placeholder="Filtrar taxa" 
                                value={filterRate}
                                onChange={e => setFilterRate(e.target.value)}
                                className="w-full border border-slate-300 rounded p-1 text-xs font-normal normal-case text-right"
                              />
                          </th>
                          <th className="px-4 pb-3">
                              {(filterMonth || filterType || filterRate) && (
                                  <button 
                                    onClick={() => { setFilterMonth(''); setFilterType(''); setFilterRate(''); }}
                                    className="text-red-500 hover:text-red-700 text-xs normal-case font-medium w-full text-right"
                                  >
                                      Limpar
                                  </button>
                              )}
                          </th>
                      </tr>
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
                                  <button onClick={() => {
                                      setEditingId(idx.id); 
                                      setForm({
                                          month: parseInt(idx.date.slice(5,7)), 
                                          year: parseInt(idx.date.slice(0,4)), 
                                          type: idx.type, 
                                          rate: idx.rate
                                      });
                                  }} className="p-1 text-blue-500 mr-2"><Pencil size={14}/></button>
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
