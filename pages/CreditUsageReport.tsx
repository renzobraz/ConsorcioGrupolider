import React, { useState } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ShoppingBag, Printer, Filter, X } from 'lucide-react';

const CreditUsageReport = () => {
  const { allCreditUsages, quotas, companies, administrators } = useConsortium();

  // Filters State
  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterCompany, setFilterCompany] = useState('');

  // Combine Usage Data with Quota Info & Filter
  const reportData = allCreditUsages.map(usage => {
      const quota = quotas.find(q => q.id === usage.quotaId);
      const company = quota ? companies.find(c => c.id === quota.companyId) : null;
      const admin = quota ? administrators.find(a => a.id === quota.administratorId) : null;
      return {
          ...usage,
          quota,
          company,
          admin
      };
  }).filter(item => {
      const matchAdmin = !filterAdmin || item.admin?.id === filterAdmin;
      const matchComp = !filterCompany || item.company?.id === filterCompany;
      return matchAdmin && matchComp;
  }).sort((a, b) => b.date.localeCompare(a.date)); // Newest first

  const totalUsed = reportData.reduce((acc, curr) => acc + curr.amount, 0);

  // Aggregations
  const byProvider = reportData.reduce((acc, curr) => {
      const key = curr.seller || 'Não Informado';
      acc[key] = (acc[key] || 0) + curr.amount;
      return acc;
  }, {} as Record<string, number>);

  const byDescription = reportData.reduce((acc, curr) => {
      const key = curr.description || 'Sem Descrição';
      acc[key] = (acc[key] || 0) + curr.amount;
      return acc;
  }, {} as Record<string, number>);

  // Sort aggregations for display
  const topProviders = (Object.entries(byProvider) as [string, number][]).sort((a, b) => b[1] - a[1]);
  const topDescriptions = (Object.entries(byDescription) as [string, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10 print:max-w-none print:w-full print:pb-0 print:space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 print:text-xl">
                    <ShoppingBag className="text-emerald-600" /> Relatório de Utilização
                </h1>
                <p className="text-slate-500 print:text-xs">Extrato de todas as utilizações de crédito.</p>
            </div>
            <button 
                onClick={() => window.print()} 
                className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors font-medium flex items-center gap-2 print:hidden self-start"
            >
                <Printer size={18} /> Imprimir
            </button>
        </div>

        {/* FILTERS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-end print:hidden">
            <div className="flex-1 w-full md:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Empresa</label>
                <select 
                    value={filterCompany} 
                    onChange={(e) => setFilterCompany(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                    <option value="">Todas</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1 w-full md:w-auto">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Administradora</label>
                <select 
                    value={filterAdmin} 
                    onChange={(e) => setFilterAdmin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                    <option value="">Todas</option>
                    {administrators.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
            {(filterAdmin || filterCompany) && (
                <button 
                    onClick={() => { setFilterAdmin(''); setFilterCompany(''); }}
                    className="text-slate-500 hover:text-red-500 text-sm font-medium px-2 py-2 flex items-center gap-1"
                >
                    <X size={16}/> Limpar
                </button>
            )}
        </div>

        {/* SUMMARY */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between print:shadow-none print:border-slate-300 print:p-4">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-full print:hidden">
                    <ShoppingBag size={24} />
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase print:text-[8px]">Total Utilizado</p>
                    <p className="text-2xl font-bold text-slate-800 print:text-lg">{formatCurrency(totalUsed)}</p>
                </div>
            </div>
            <div className="text-right">
                <p className="text-sm font-semibold text-slate-500 uppercase print:text-[8px]">Lançamentos</p>
                <p className="text-2xl font-bold text-slate-800 print:text-lg">{reportData.length}</p>
            </div>
        </div>

        {/* TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border print:border-slate-300 print:shadow-none">
            {reportData.length > 0 ? (
                <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full text-sm text-left print:text-[8px]">
                        <thead className="bg-slate-900 text-white uppercase text-xs print:bg-slate-800">
                            <tr>
                                <th className="px-6 py-3 print:px-2">Data</th>
                                <th className="px-6 py-3 print:px-2">Cota / Grupo</th>
                                <th className="px-6 py-3 print:px-2">Empresa</th>
                                <th className="px-6 py-3 print:px-2">Descrição</th>
                                <th className="px-6 py-3 print:px-2">Fornecedor</th>
                                <th className="px-6 py-3 text-right print:px-2">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {reportData.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap print:px-2">
                                        {formatDate(item.date)}
                                    </td>
                                    <td className="px-6 py-4 text-slate-600 print:px-2">
                                        {item.quota ? `${item.quota.group} / ${item.quota.quotaNumber}` : 'Cota Removida'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 text-xs print:px-2 print:text-[7px]">
                                        {item.company?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-slate-800 print:px-2">
                                        {item.description}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 print:px-2">
                                        {item.seller || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-amber-600 print:px-2">
                                        {formatCurrency(item.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold print:bg-white">
                            <tr>
                                <td colSpan={5} className="px-6 py-3 text-right print:px-2">Total Geral:</td>
                                <td className="px-6 py-3 text-right text-amber-600 print:px-2">{formatCurrency(totalUsed)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl m-4 print:hidden">
                    <Filter size={48} className="mx-auto mb-3 opacity-20" />
                    <p className="text-lg font-medium">Nenhum registro encontrado</p>
                </div>
            )}
        </div>

        {/* ANALYTICAL SUMMARY SECTION */}
        {reportData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 page-break-inside-avoid print:gap-4 print:grid-cols-2">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:p-4 print:shadow-none print:border-slate-300">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 border-b pb-2 print:text-[10px]">Por Fornecedor</h3>
                    <div className="space-y-3 print:space-y-1">
                        {topProviders.map(([provider, amount], idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm print:text-[8px]">
                                <span className="text-slate-600 truncate flex-1 pr-4">{provider}</span>
                                <span className="font-bold text-slate-800">{formatCurrency(amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:p-4 print:shadow-none print:border-slate-300">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 border-b pb-2 print:text-[10px]">Por Descrição</h3>
                    <div className="space-y-3 print:space-y-1">
                        {topDescriptions.map(([desc, amount], idx) => (
                            <div key={idx} className="flex justify-between items-center text-sm print:text-[8px]">
                                <span className="text-slate-600 truncate flex-1 pr-4">{desc}</span>
                                <span className="font-bold text-slate-800">{formatCurrency(amount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default CreditUsageReport;