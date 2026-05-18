
import React, { useState, useEffect, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { formatCurrency, formatDate, formatDateToYYYYMMDD, getTodayStr } from '../utils/formatters';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Printer, Loader, Search, Filter, ArrowRight, Download, ChevronRight, TrendingUp, ExternalLink, ArrowLeft } from 'lucide-react';
import ConsortiumFilterBar from '../components/ConsortiumFilterBar';

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
    const { quotas, indices, companies, administrators, globalFilters, setGlobalFilters } = useConsortium();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([]);
    
    // Filters
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return formatDateToYYYYMMDD(d).slice(0, 7) + "-01";
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() + 2);
        return formatDateToYYYYMMDD(d);
    });

    useEffect(() => {
        const buildMonthlyReport = async () => {
            setLoading(true);
            try {
                const allPayments = await db.getAllPaymentsDictionary();
                const monthMap: Record<string, MonthlySummary> = {};

                quotas.forEach(quota => {
                    if (globalFilters.companyId && quota.companyId !== globalFilters.companyId) return;
                    if (globalFilters.administratorId && quota.administratorId !== globalFilters.administratorId) return;
                    if (globalFilters.status) {
                        const isContemplated = !!quota.isContemplated;
                        if (globalFilters.status === 'CONTEMPLATED' && !isContemplated) return;
                        if (globalFilters.status === 'ACTIVE' && isContemplated) return;
                    }

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
                        // Strict check: must have status 'PAGO' and a payment date
                        const isPaid = !!paymentData && 
                                      (paymentData.status === 'PAGO' || paymentData.isPaid === true) && 
                                      !!paymentData.paymentDate;

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

                        // Bids are now handled separately below to avoid double-counting
                        
                        currentMonth.total = currentMonth.commonFund + currentMonth.fees + currentMonth.bids + currentMonth.others;
                    });

                    // Handle Bids separately (once per quota)
                    // Free Bid (Lance Livre) - This is a cash payment
                    const freeBidPayment = paymentMap[0];
                    if (freeBidPayment && (freeBidPayment.status === 'PAGO' || freeBidPayment.isPaid === true) && freeBidPayment.paymentDate) {
                        const bidDateStr = freeBidPayment.paymentDate.split('T')[0];
                        if (bidDateStr >= startDate && bidDateStr <= endDate) {
                            const monthKey = bidDateStr.slice(0, 7);
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
                            const bidAmount = (freeBidPayment.bidFreeApplied || quota.bidFree || 0);
                            monthMap[monthKey].bids += bidAmount;
                            monthMap[monthKey].total = monthMap[monthKey].commonFund + monthMap[monthKey].fees + monthMap[monthKey].bids + monthMap[monthKey].others;
                        }
                    }
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
    }, [quotas, indices, startDate, endDate, globalFilters.companyId, globalFilters.administratorId, globalFilters.status]);

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
        const query = globalFilters.companyId ? `?companyId=${globalFilters.companyId}` : '';
        navigate(`/reports/monthly/${monthYear}${query}`);
    };

    return (
        <div className="w-full space-y-6 pb-10 print:p-0">

        <ConsortiumFilterBar 
          showQuotaFilter={false} 
          showRangeDateFilter={true}
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          actions={
            <button 
              onClick={() => window.print()} 
              className="p-2.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-sm bg-white"
              title="Imprimir Relatório"
            >
              <Printer size={18} />
            </button>
          }
        />

            {/* CARDS SUMMARY - Mobile Friendly */}
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase mb-1">Fundo Comum</p>
                    <p className="text-sm sm:text-xl font-black text-slate-800 truncate">{formatCurrency(totals.commonFund)}</p>
                </div>
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase mb-1">Taxas (TA+FR)</p>
                    <p className="text-sm sm:text-xl font-black text-slate-800 truncate">{formatCurrency(totals.fees)}</p>
                </div>
                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[9px] sm:text-[10px] font-bold text-amber-600 uppercase mb-1">Lances</p>
                    <p className="text-sm sm:text-xl font-black text-amber-700 truncate">{formatCurrency(totals.bids)}</p>
                </div>
                <div className="bg-emerald-600 p-4 sm:p-5 rounded-xl border border-emerald-700 shadow-lg shadow-emerald-100 col-span-2 lg:col-span-1">
                    <p className="text-[9px] sm:text-[10px] font-bold text-emerald-100 uppercase mb-1">Total Período</p>
                    <p className="text-sm sm:text-xl font-black text-white truncate">{formatCurrency(totals.total)}</p>
                </div>
            </div>

            {/* Visualização Mobile (Cards) - Fluxo Mensal */}
            <div className="block md:hidden space-y-4 print:hidden">
                {loading ? (
                    <div className="p-10 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                        <Loader className="animate-spin mx-auto mb-2" /> Carregando fluxo...
                    </div>
                ) : monthlyData.length > 0 ? (
                    monthlyData.map((row) => (
                        <div key={row.monthYear} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <span className="font-black text-slate-800">{formatMonth(row.monthYear)}</span>
                                <button 
                                    onClick={() => handleDetailNavigation(row.monthYear)}
                                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-emerald-600 hover:bg-emerald-50"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                            <div className="p-4 grid grid-cols-2 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Fundo Comum</span>
                                    <span className="text-xs font-bold text-slate-700">{formatCurrency(row.commonFund)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Taxas</span>
                                    <span className="text-xs font-bold text-slate-700">{formatCurrency(row.fees)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Lances</span>
                                    <span className="text-xs font-bold text-amber-600">{row.bids > 0 ? formatCurrency(row.bids) : '-'}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Encargos</span>
                                    <span className="text-xs font-bold text-red-500">{row.others > 0 ? formatCurrency(row.others) : '-'}</span>
                                </div>
                                <div className="col-span-2 pt-3 border-t border-slate-50 flex justify-between items-center">
                                    <span className="text-xs font-black text-slate-400 uppercase">Total do Mês</span>
                                    <span className="text-base font-black text-slate-900">{formatCurrency(row.total)}</span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-10 text-center bg-white rounded-xl border border-dashed border-slate-300">
                        Nenhum registro encontrado.
                    </div>
                )}
            </div>

            {/* MAIN TABLE - Desktop Only */}
            <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:overflow-visible print:border-none print:shadow-none">
                <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full text-sm text-left border-collapse print:text-[10px]">
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
