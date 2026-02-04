import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule } from '../services/calculationService';
import { formatCurrency } from '../utils/formatters';
import { ShoppingBag, Building2, Search, Filter, X, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreditManagement = () => {
  const { quotas, companies, administrators, indices, allCreditUsages } = useConsortium();
  const navigate = useNavigate();

  // Filter States
  const [search, setSearch] = useState('');
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // '' | 'CONTEMPLATED' | 'ACTIVE'

  // Helper to filter a list of quotas based on state
  const filterQuotas = (list: any[]) => {
      return list.filter(q => {
          // 1. Text Search (Group / Quota)
          const matchesSearch = 
            q.group.toLowerCase().includes(search.toLowerCase()) || 
            q.quotaNumber.toLowerCase().includes(search.toLowerCase());

          // 2. Admin Filter
          const matchesAdmin = !filterAdmin || q.administratorId === filterAdmin;

          // 3. Company Filter (Global filter applied to items inside the group)
          const matchesCompany = !filterCompany || q.companyId === filterCompany;

          // 4. Status Filter
          let matchesStatus = true;
          if (filterStatus === 'CONTEMPLATED') matchesStatus = q.isContemplated;
          if (filterStatus === 'ACTIVE') matchesStatus = !q.isContemplated;

          return matchesSearch && matchesAdmin && matchesCompany && matchesStatus;
      });
  };

  // 1. Group Quotas by Company
  const companyGroups = companies.map(comp => {
      // Get quotas for this company AND apply UI filters
      const rawCompanyQuotas = quotas.filter(q => q.companyId === comp.id);
      const companyQuotas = filterQuotas(rawCompanyQuotas);
      
      let totalCreditBase = 0;
      let totalUpdates = 0;
      let totalEmbedded = 0;
      let totalUsed = 0;
      let totalAvailable = 0;
      
      const quotaDetails = companyQuotas.map(quota => {
          // Calculate Credit Value (Current)
          const schedule = generateSchedule(quota, indices);
          const todayStr = new Date().toISOString().split('T')[0];
          
          let currentCredit = quota.creditValue;
          if (schedule.length > 0) {
              const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= todayStr);
              if (pastOrPresent.length > 0) {
                  currentCredit = pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue;
              } else {
                  currentCredit = schedule[0].correctedCreditValue || quota.creditValue;
              }
          }

          // Calculate Usage
          const usageSum = allCreditUsages
              .filter(u => u.quotaId === quota.id)
              .reduce((acc, curr) => acc + curr.amount, 0);

          const manualAdj = quota.creditManualAdjustment || 0;
          const embeddedBid = quota.bidEmbedded || 0;

          // Formula: (Carta + Atualização - Lance Embutido) - Uso
          const netAvailable = (currentCredit + manualAdj) - embeddedBid;
          const remaining = netAvailable - usageSum;

          totalCreditBase += currentCredit;
          totalUpdates += manualAdj;
          totalEmbedded += embeddedBid;
          totalUsed += usageSum;
          totalAvailable += remaining;

          return {
              quota,
              currentCredit,
              manualAdj,
              embeddedBid,
              usageSum,
              remaining
          };
      });

      return {
          company: comp,
          details: quotaDetails,
          totalCreditBase,
          totalUpdates,
          totalEmbedded,
          totalUsed,
          totalAvailable
      };
  });

  // Handle Quotas without Company
  const rawNoCompanyQuotas = quotas.filter(q => !q.companyId);
  const quotasNoCompany = filterQuotas(rawNoCompanyQuotas);

  if (quotasNoCompany.length > 0) {
      let totalCreditBase = 0;
      let totalUpdates = 0;
      let totalEmbedded = 0;
      let totalUsed = 0;
      let totalAvailable = 0;

      const details = quotasNoCompany.map(quota => {
          const schedule = generateSchedule(quota, indices);
          const todayStr = new Date().toISOString().split('T')[0];
          let currentCredit = quota.creditValue;
          if (schedule.length > 0) {
              const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= todayStr);
              if (pastOrPresent.length > 0) {
                  currentCredit = pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue;
              } else {
                  currentCredit = schedule[0].correctedCreditValue || quota.creditValue;
              }
          }
          const usageSum = allCreditUsages
              .filter(u => u.quotaId === quota.id)
              .reduce((acc, curr) => acc + curr.amount, 0);
          
          const manualAdj = quota.creditManualAdjustment || 0;
          const embeddedBid = quota.bidEmbedded || 0;
          const remaining = (currentCredit + manualAdj - embeddedBid) - usageSum;

          totalCreditBase += currentCredit;
          totalUpdates += manualAdj;
          totalEmbedded += embeddedBid;
          totalUsed += usageSum;
          totalAvailable += remaining;

          return { quota, currentCredit, manualAdj, embeddedBid, usageSum, remaining };
      });
      
      companyGroups.push({
          company: { id: 'no-company', name: 'Sem Empresa Vinculada', phone: '', email: '' },
          details,
          totalCreditBase,
          totalUpdates,
          totalEmbedded,
          totalUsed,
          totalAvailable
      });
  }

  // Hide empty groups if filtering removed all items
  const visibleGroups = companyGroups.filter(g => g.details.length > 0);

  const clearFilters = () => {
      setSearch('');
      setFilterAdmin('');
      setFilterCompany('');
      setFilterStatus('');
  };

  const hasActiveFilters = search || filterAdmin || filterCompany || filterStatus;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10 print:p-0 print:space-y-4 print:max-w-none">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 print:text-xl">
            <ShoppingBag className="text-emerald-600" /> Gestão de Créditos
            </h1>
            <p className="text-slate-500 print:text-xs">Visão consolidada do uso de crédito por empresa.</p>
        </div>
        <button 
          onClick={() => window.print()} 
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center gap-2 print:hidden self-start"
        >
          <Printer size={18} /> Imprimir Relatório
        </button>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4 print:hidden">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar por Grupo ou Cota..." 
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Building2 size={12}/> Empresa
                </label>
                <select 
                    value={filterCompany} 
                    onChange={(e) => setFilterCompany(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Empresas</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Filter size={12}/> Administradora
                </label>
                <select 
                    value={filterAdmin} 
                    onChange={(e) => setFilterAdmin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Administradoras</option>
                    {administrators.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <Filter size={12}/> Status
                </label>
                <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)}
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
                    className="self-end px-4 py-2 text-slate-500 hover:text-red-500 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors flex items-center justify-center gap-1 text-sm font-medium whitespace-nowrap"
                >
                    <X size={16} /> Limpar
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 print:gap-4">
          {visibleGroups.length > 0 ? visibleGroups.map(group => {
              // Calculate Percentages for Progress Bar (based on Used vs (Base+Adj))
              const baseWithUpdates = group.totalCreditBase + group.totalUpdates;
              const percentUsed = baseWithUpdates > 0 ? (group.totalUsed / baseWithUpdates) * 100 : 0;

              return (
                  <div key={group.company.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border print:border-slate-300 print:shadow-none print:break-inside-avoid">
                      {/* COMPANY HEADER */}
                      <div className="bg-slate-50 p-6 border-b border-slate-200 print:p-4 print:bg-white">
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4 print:mb-2">
                              <div className="flex items-center gap-3">
                                  <div className="p-3 bg-white rounded-lg shadow-sm text-slate-700 print:hidden">
                                      <Building2 size={24} />
                                  </div>
                                  <div>
                                      <h2 className="text-xl font-bold text-slate-800 print:text-lg">{group.company.name}</h2>
                                      <p className="text-sm text-slate-500 print:text-[10px]">{group.details.length} cotas listadas</p>
                                  </div>
                              </div>
                              
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-right print:gap-2 print:grid-cols-5">
                                  <div>
                                      <p className="text-[10px] text-slate-500 uppercase font-bold">Base</p>
                                      <p className="text-base font-bold text-slate-600 print:text-xs">{formatCurrency(group.totalCreditBase)}</p>
                                  </div>
                                  <div>
                                      <p className="text-[10px] text-slate-500 uppercase font-bold text-indigo-600">Ajuste (+)</p>
                                      <p className="text-base font-bold text-indigo-600 print:text-xs">{formatCurrency(group.totalUpdates)}</p>
                                  </div>
                                  <div>
                                      <p className="text-[10px] text-slate-500 uppercase font-bold text-orange-600">Emb. (-)</p>
                                      <p className="text-base font-bold text-orange-600 print:text-xs">{formatCurrency(group.totalEmbedded)}</p>
                                  </div>
                                  <div>
                                      <p className="text-[10px] text-slate-500 uppercase font-bold text-amber-600">Uso (-)</p>
                                      <p className="text-base font-bold text-amber-600 print:text-xs">{formatCurrency(group.totalUsed)}</p>
                                  </div>
                                  <div>
                                      <p className="text-[10px] text-slate-500 uppercase font-bold">Disponível</p>
                                      <p className={`text-xl font-bold print:text-sm ${group.totalAvailable >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                                          {formatCurrency(group.totalAvailable)}
                                      </p>
                                  </div>
                              </div>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden print:h-1">
                              <div className="bg-amber-500 h-2 rounded-full transition-all duration-500 print:h-1" style={{ width: `${Math.min(percentUsed, 100)}%` }}></div>
                          </div>
                          <div className="flex justify-between text-xs font-medium text-slate-500 mt-1 print:text-[8px]">
                              <span>0%</span>
                              <span>{percentUsed.toFixed(1)}% Utilizado</span>
                              <span>100%</span>
                          </div>
                      </div>

                      {/* QUOTAS LIST */}
                      <div className="p-0 overflow-x-auto print:overflow-visible">
                          <table className="w-full text-xs text-left print:text-[8px]">
                              <thead className="bg-white text-slate-500 uppercase border-b border-slate-100 print:bg-slate-50">
                                  <tr>
                                      <th className="px-6 py-3 font-semibold print:px-2">Cota / Grupo</th>
                                      <th className="px-6 py-3 font-semibold text-right print:px-2">Valor Carta</th>
                                      <th className="px-6 py-3 font-semibold text-right text-indigo-600 print:px-2">Ajuste (+)</th>
                                      <th className="px-6 py-3 font-semibold text-right text-orange-600 print:px-2">Emb. (-)</th>
                                      <th className="px-6 py-3 font-semibold text-right text-amber-600 print:px-2">Uso (-)</th>
                                      <th className="px-6 py-3 font-semibold text-right text-blue-700 bg-blue-50/50 print:px-2 print:bg-transparent">Disponível</th>
                                      <th className="px-6 py-3 text-center print:hidden">Ação</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {group.details.map((item, idx) => (
                                      <tr key={item.quota.id} className="hover:bg-slate-50">
                                          <td className="px-6 py-4 print:px-2">
                                              <div className="font-medium text-slate-700">{item.quota.group} / {item.quota.quotaNumber}</div>
                                              {!item.quota.isContemplated && (
                                                  <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded print:text-[7px]">Não Contemplada</span>
                                              )}
                                          </td>
                                          <td className="px-6 py-4 text-right font-medium text-slate-600 print:px-2">
                                              {formatCurrency(item.currentCredit)}
                                          </td>
                                          <td className="px-6 py-4 text-right font-medium text-indigo-600 print:px-2">
                                              {item.manualAdj !== 0 ? formatCurrency(item.manualAdj) : '-'}
                                          </td>
                                          <td className="px-6 py-4 text-right font-medium text-orange-600 print:px-2">
                                              {item.embeddedBid !== 0 ? formatCurrency(item.embeddedBid) : '-'}
                                          </td>
                                          <td className="px-6 py-4 text-right font-medium text-amber-600 print:px-2">
                                              {item.usageSum > 0 ? formatCurrency(item.usageSum) : '-'}
                                          </td>
                                          <td className="px-6 py-4 text-right font-bold text-blue-700 bg-blue-50/30 print:px-2 print:bg-transparent">
                                              {formatCurrency(item.remaining)}
                                          </td>
                                          <td className="px-6 py-4 text-center print:hidden">
                                              {item.quota.isContemplated ? (
                                                  <button 
                                                    onClick={() => navigate(`/usage/${item.quota.id}`)}
                                                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors font-medium"
                                                  >
                                                      Gerenciar
                                                  </button>
                                              ) : (
                                                  <span className="text-slate-300 text-[10px]">Aguardando</span>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              );
          }) : (
              <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 print:hidden">
                  <Filter size={48} className="mx-auto mb-3 opacity-20" />
                  <p className="text-lg font-medium">Nenhum registro encontrado</p>
                  <p className="text-sm">Ajuste os filtros para visualizar os dados.</p>
              </div>
          )}
      </div>
    </div>
  );
};

export default CreditManagement;