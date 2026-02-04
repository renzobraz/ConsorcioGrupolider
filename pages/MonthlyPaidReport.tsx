
import React, { useState, useEffect, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Printer, Loader, Search, Filter, ArrowRight, Download, ChevronRight, TrendingUp, ExternalLink } from 'lucide-react';

interface MonthlySummary {
    monthYear: string; // YYYY-MM
    commonFund: number;
    fees: number; // TA + FR
    bids: number;
    others: number; // Fine + Interest
    total: number;
    quotaCount: number;
}

const MonthlyPaidReport = () => {
    const { quotas, indices, companies, administrators } = useConsortium();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([]);
    
    // Filters
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0].slice(0, 7) + "-01";
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 2);
        return d.toISOString().split('T')[0];
    });
    const [filterCompany, setFilterCompany] = useState('');

    useEffect(() => {
        const buildMonthlyReport = async () => {
            setLoading(true);
            try {
                const allPayments = await db.getAllPaymentsDictionary();
                const monthMap: Record<string, MonthlySummary> = {};

                quotas.forEach(quota => {
                    if (filterCompany && quota.companyId !== filterCompany) return;

                    const schedule = generateSchedule(quota, indices);
                    const paymentMap = allPayments[quota.id] || {};

                    schedule.forEach(inst => {
                        const instDateStr = inst.dueDate.split('T')[0];
                        const monthKey = instDateStr.slice(0, 7); 

                        if (instDateStr < startDate || instDateStr > endDate) return;

                        if (!monthMap[monthKey]) {
                            monthMap[monthKey] = {
                                monthYear: monthKey,
                                commonFund: 0,
                                fees: 0,
                                bids: 0,
                                others: 0,
                                total: 0,
                                quotaCount: 0
                            };
                        }

                        const currentMonth = monthMap[monthKey];
                        const paymentData = paymentMap[inst.installmentNumber];
                        const isPaid = !!paymentData;

                        const actualFC = (isPaid && paymentData.manualFC !== undefined && paymentData.manualFC !== null) 
                            ? paymentData.manualFC : inst.commonFund;
                        
                        const actualTA = (isPaid && paymentData.manualTA !== undefined && paymentData.manualTA !== null) 
                            ? paymentData.manualTA : inst.adminFee;
                            
                        const actualFR = (isPaid && paymentData.manualFR !== undefined && paymentData.manualFR !== null) 
                            ? paymentData.manualFR : inst.reserveFund;
                        
                        const actualFine = isPaid ? (paymentData.manualFine || 0) : 0;
                        const actualInterest = isPaid ? (paymentData.manualInterest || 0) : 0;

                        currentMonth.commonFund += actualFC;
                        currentMonth.fees += actualTA + actualFR;
                        currentMonth.others += actualFine + actualInterest;

                        if ((inst.bidAmountApplied || 0) > 0) {
                            currentMonth.bids += inst.bidAmountApplied || 0;
                        }

                        currentMonth.total = currentMonth.commonFund + currentMonth.fees + currentMonth.bids + currentMonth.others;
                    });
                });

                const sortedMonths = Object.values(monthMap).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
                setMonthlyData(sortedMonths);
            } catch (err) {
                console.error("Erro ao gerar relatório mensal:", err);
            } finally {
                setLoading(false);
            }
        };

        buildMonthlyReport();
    }, [quotas, indices, startDate, endDate, filterCompany]);

    const totals = useMemo(() => {
        return monthlyData.reduce((acc, curr) => ({
            commonFund: acc.commonFund + curr.commonFund,
            fees: acc.fees + curr.fees,
            bids: acc.bids + curr.bids,
            others: acc.others + curr.others,
            total: acc.total + curr.total
        }), { commonFund: 0, fees: 0, bids: 0, others: 0, total: 0 });
    }, [monthlyData]);

    const formatMonth = (my: string) => {
        const [year, month] = my.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    };

    const handleDetailNavigation = (monthYear: string) => {
        // Envia o filtro de empresa atual na URL para que o detalhe saiba quem filtrar
        const query = filterCompany ? `?companyId=${filterCompany}` : '';
        navigate(`/reports/monthly/${monthYear}${query}`);
    };

    return (
        <div className="w-full space-y-6 pb-10 print:p-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <CalendarDays className="text-emerald-600" /> Fluxo Mensal Financeiro
                    </h1>
                    <p className="text-slate-500">Relatório consolidado de parcelas e lances (Realizado + Projetado).</p>
                </div>
                <div className="flex gap-2 print:hidden">
                    <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 transition-colors">
                        <Printer size={18} /> Imprimir
                    </button>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Início do Período</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Fim do Período</label>
                    <input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)} 
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Empresa</label>
                    <select 
                        value={filterCompany} 
                        onChange={(e) => setFilterCompany(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="">Todas as Empresas</option>
                        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div className="flex items-end">
                    <div className="bg-emerald-50 text-emerald-700 p-2 rounded-lg border border-emerald-100 w-full flex items-center justify-center gap-2">
                        <TrendingUp size={16} />
                        <span className="text-xs font-bold">Fluxo Atualizado</span>
                    </div>
                </div>
            </div>

            {/* CARDS SUMMARY */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fundo Comum</p>
                    <p className="text-xl font-black text-slate-800">{formatCurrency(totals.commonFund)}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Taxas (TA+FR)</p>
                    <p className="text-xl font-black text-slate-800">{formatCurrency(totals.fees)}</p>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Lances</p>
                    <p className="text-xl font-black text-amber-700">{formatCurrency(totals.bids)}</p>
                </div>
                <div className="bg-emerald-600 p-5 rounded-xl border border-emerald-700 shadow-lg shadow-emerald-100">
                    <p className="text-[10px] font-bold text-emerald-100 uppercase mb-1">Total Período</p>
                    <p className="text-xl font-black text-white">{formatCurrency(totals.total)}</p>
                </div>
            </div>

            {/* MAIN TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-bold border-r border-slate-700">Mês de Referência</th>
                                <th className="px-6 py-4 text-right">Fundo Comum</th>
                                <th className="px-6 py-4 text-right">Taxas (TA/FR)</th>
                                <th className="px-6 py-4 text-right text-amber-400">Lances</th>
                                <th className="px-6 py-4 text-right">Encargos (M/J)</th>
                                <th className="px-6 py-4 text-right font-black bg-slate-900 border-l border-slate-700">Total Fluxo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-slate-400">
                                        <Loader className="animate-spin mx-auto mb-2" /> Carregando fluxo...
                                    </td>
                                </tr>
                            ) : monthlyData.length > 0 ? (
                                monthlyData.map((row) => (
                                    <tr key={row.monthYear} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4 font-bold text-slate-700 border-r border-slate-100 group-hover:text-emerald-700">
                                            <button 
                                                onClick={() => handleDetailNavigation(row.monthYear)}
                                                className="flex items-center gap-2 hover:underline decoration-emerald-500 underline-offset-4 text-left w-full"
                                                title="Clique para ver o detalhamento por cota"
                                            >
                                                <ChevronRight size={14} className="text-slate-300 group-hover:text-emerald-500" />
                                                {formatMonth(row.monthYear)}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-600">
                                            {formatCurrency(row.commonFund)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-600">
                                            {formatCurrency(row.fees)}
                                        </td>
                                        <td className="px-6 py-4 text-right text-amber-600 font-medium">
                                            {row.bids > 0 ? formatCurrency(row.bids) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right text-red-500">
                                            {row.others > 0 ? formatCurrency(row.others) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-black text-slate-900 bg-slate-50 border-l border-slate-100">
                                            {formatCurrency(row.total)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center text-slate-400">
                                        Nenhum registro encontrado.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-black text-xs">
                            <tr>
                                <td className="px-6 py-4 border-r border-slate-700">Total Geral</td>
                                <td className="px-6 py-4 text-right">{formatCurrency(totals.commonFund)}</td>
                                <td className="px-6 py-4 text-right">{formatCurrency(totals.fees)}</td>
                                <td className="px-6 py-4 text-right text-amber-400">{formatCurrency(totals.bids)}</td>
                                <td className="px-6 py-4 text-right text-red-300">{formatCurrency(totals.others)}</td>
                                <td className="px-6 py-4 text-right text-emerald-400 border-l border-slate-700 text-sm">
                                    {formatCurrency(totals.total)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default MonthlyPaidReport;
