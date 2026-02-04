
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { formatCurrency } from '../utils/formatters';
import { ArrowLeft, Search, Building2, LayoutList, Printer, Loader, FileText, ChevronRight, Filter } from 'lucide-react';

interface QuotaDetailRow {
    quotaId: string;
    group: string;
    quotaNumber: string;
    companyName: string;
    companyId: string;
    commonFund: number;
    fees: number;
    bids: number;
    others: number;
    total: number;
}

const MonthlyDetailReport = () => {
    const { monthYear } = useParams<{ monthYear: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { quotas, indices, companies } = useConsortium();
    
    // Captura o ID da empresa vindo do relatório anterior
    const urlCompanyId = searchParams.get('companyId');

    const [loading, setLoading] = useState(true);
    const [detailData, setDetailData] = useState<QuotaDetailRow[]>([]);
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        const buildDetail = async () => {
            if (!monthYear) return;
            setLoading(true);
            try {
                const allPayments = await db.getAllPaymentsDictionary();
                const rows: QuotaDetailRow[] = [];

                quotas.forEach(quota => {
                    // SE houver um filtro de empresa vindo da URL, ignora as outras cotas
                    if (urlCompanyId && quota.companyId !== urlCompanyId) return;

                    const schedule = generateSchedule(quota, indices);
                    const paymentMap = allPayments[quota.id] || {};
                    const company = companies.find(c => c.id === quota.companyId);

                    schedule.forEach(inst => {
                        const instDateStr = inst.dueDate.split('T')[0];
                        const instMonthKey = instDateStr.slice(0, 7);

                        if (instMonthKey !== monthYear) return;

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

                        const rowBids = (inst.bidAmountApplied || 0);

                        rows.push({
                            quotaId: quota.id,
                            group: quota.group,
                            quotaNumber: quota.quotaNumber,
                            companyId: quota.companyId || '',
                            companyName: company?.name || 'Sem Empresa',
                            commonFund: actualFC,
                            fees: actualTA + actualFR,
                            bids: rowBids,
                            others: actualFine + actualInterest,
                            total: actualFC + actualTA + actualFR + rowBids + actualFine + actualInterest
                        });
                    });
                });

                setDetailData(rows.sort((a, b) => a.group.localeCompare(b.group) || a.quotaNumber.localeCompare(b.quotaNumber)));
            } catch (err) {
                console.error("Erro ao detalhar mês:", err);
            } finally {
                setLoading(false);
            }
        };

        buildDetail();
    }, [quotas, indices, monthYear, companies, urlCompanyId]);

    const filteredData = useMemo(() => {
        return detailData.filter(d => 
            d.group.toLowerCase().includes(searchText.toLowerCase()) || 
            d.quotaNumber.toLowerCase().includes(searchText.toLowerCase()) ||
            d.companyName.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [detailData, searchText]);

    const totals = useMemo(() => {
        return filteredData.reduce((acc, curr) => ({
            commonFund: acc.commonFund + curr.commonFund,
            fees: acc.fees + curr.fees,
            bids: acc.bids + curr.bids,
            others: acc.others + curr.others,
            total: acc.total + curr.total
        }), { commonFund: 0, fees: 0, bids: 0, others: 0, total: 0 });
    }, [filteredData]);

    const displayMonth = useMemo(() => {
        if (!monthYear) return '';
        const [year, month] = monthYear.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    }, [monthYear]);

    const activeCompanyFilterName = useMemo(() => {
        if (!urlCompanyId) return null;
        return companies.find(c => c.id === urlCompanyId)?.name;
    }, [urlCompanyId, companies]);

    return (
        <div className="w-full space-y-6 pb-10 print:p-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => navigate('/reports/monthly')} 
                        className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-lg border border-slate-200 print:hidden"
                        title="Voltar ao relatório macro"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <LayoutList className="text-emerald-600" /> Detalhes: {displayMonth}
                        </h1>
                        <div className="flex items-center gap-2">
                             <p className="text-slate-500">Fluxo analítico individualizado por cota.</p>
                             {activeCompanyFilterName && (
                                 <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-bold border border-emerald-100 animate-pulse">
                                     <Filter size={10} /> Filtrado por: {activeCompanyFilterName}
                                 </span>
                             )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 print:hidden">
                    <button onClick={() => window.print()} className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 font-medium flex items-center gap-2 transition-colors">
                        <Printer size={18} /> Imprimir Analítico
                    </button>
                </div>
            </div>

            {/* SEARCH */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-3 print:hidden">
                <Search className="text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Pesquisar por grupo, cota ou empresa..." 
                    className="flex-1 bg-transparent border-none outline-none text-sm"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                />
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-wider sticky top-0">
                            <tr>
                                <th className="px-4 py-4 font-bold border-r border-slate-700">Grupo / Cota</th>
                                <th className="px-4 py-4">Empresa</th>
                                <th className="px-4 py-4 text-right">Fundo Comum</th>
                                <th className="px-4 py-4 text-right">Taxas (TA/FR)</th>
                                <th className="px-4 py-4 text-right">Lances</th>
                                <th className="px-4 py-4 text-right">Encargos</th>
                                <th className="px-4 py-4 text-right font-black bg-slate-900 border-l border-slate-700">Total Cota</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400">
                                        <Loader className="animate-spin mx-auto mb-2" /> Gerando analítico...
                                    </td>
                                </tr>
                            ) : filteredData.length > 0 ? (
                                filteredData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-700 border-r border-slate-100">
                                            {row.group} / {row.quotaNumber}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 italic">
                                            {row.companyName}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">
                                            {formatCurrency(row.commonFund)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-slate-600">
                                            {formatCurrency(row.fees)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-amber-600 font-medium">
                                            {row.bids > 0 ? formatCurrency(row.bids) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-red-500">
                                            {row.others > 0 ? formatCurrency(row.others) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-black text-slate-900 bg-slate-50 border-l border-slate-100">
                                            {formatCurrency(row.total)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400">
                                        Nenhum registro encontrado {urlCompanyId ? 'para esta empresa' : ''}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-slate-900 text-white font-black text-[10px] uppercase">
                            <tr>
                                <td colSpan={2} className="px-4 py-4 border-r border-slate-700">Totais ({filteredData.length} cotas)</td>
                                <td className="px-4 py-4 text-right">{formatCurrency(totals.commonFund)}</td>
                                <td className="px-4 py-4 text-right">{formatCurrency(totals.fees)}</td>
                                <td className="px-4 py-4 text-right text-amber-400">{formatCurrency(totals.bids)}</td>
                                <td className="px-4 py-4 text-right text-red-300">{formatCurrency(totals.others)}</td>
                                <td className="px-4 py-4 text-right text-emerald-400 border-l border-slate-700 text-sm">
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

export default MonthlyDetailReport;
