
// Fix React import from named to default export
import React, { useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';
import { Pencil, Search, Gavel, TrendingUp, Calculator, X, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Simulation = () => {
  const { quotas, currentQuota, setCurrentQuota, installments, updateInstallmentPayment, companies, administrators, indices } = useConsortium();
  const navigate = useNavigate();
  
  const [searchText, setSearchText] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const filteredOptions = useMemo(() => {
    return quotas.filter(q => {
      const textMatch = (q.group || '').toLowerCase().includes(searchText.toLowerCase()) || (q.quotaNumber || '').toLowerCase().includes(searchText.toLowerCase());
      const companyMatch = filterCompany ? q.companyId === filterCompany : true;
      let statusMatch = true;
      if (filterStatus === 'ACTIVE') statusMatch = !q.isContemplated;
      if (filterStatus === 'CONTEMPLATED') statusMatch = q.isContemplated;
      return textMatch && companyMatch && statusMatch;
    });
  }, [quotas, searchText, filterCompany, filterStatus]);

  const todayStr = new Date().toISOString().split('T')[0];

  const currentDisplayCredit = useMemo(() => {
    if (currentQuota && installments.length > 0) {
        const pastOrPresent = installments.filter(i => i.dueDate.split('T')[0] <= todayStr);
        return pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || currentQuota.creditValue : installments[0].correctedCreditValue || currentQuota.creditValue;
    }
    return currentQuota?.creditValue || 0;
  }, [currentQuota, installments, todayStr]);

  const detailedSummary = useMemo(() => {
    const stats = {
        paid: { fc: 0, fr: 0, ta: 0, fine: 0, interest: 0, total: 0 },
        toPay: { fc: 0, fr: 0, ta: 0, fine: 0, interest: 0, total: 0 },
        counts: { total: 0 }
    };
    if (!currentQuota) return stats;

    installments.forEach(inst => {
        const isMatured = inst.dueDate.split('T')[0] <= todayStr;
        if (isMatured) {
            stats.paid.fc += inst.commonFund; stats.paid.fr += inst.reserveFund; stats.paid.ta += inst.adminFee;
            stats.paid.fine += (inst.manualFine || 0); stats.paid.interest += (inst.manualInterest || 0);
        } else {
            stats.toPay.fc += inst.commonFund; stats.toPay.fr += inst.reserveFund; stats.toPay.ta += inst.adminFee;
            stats.counts.total++;
        }
        if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
            stats.paid.fc += (inst.bidAbatementFC || 0); stats.paid.fr += (inst.bidAbatementFR || 0); stats.paid.ta += (inst.bidAbatementTA || 0);
        }
    });
    stats.paid.total = stats.paid.fc + stats.paid.fr + stats.paid.ta + stats.paid.fine + stats.paid.interest;
    stats.toPay.total = stats.toPay.fc + stats.toPay.fr + stats.toPay.ta;
    return stats;
  }, [currentQuota, installments, todayStr]);

  const footerTotals = useMemo(() => {
    const totals = installments.reduce((acc, inst) => {
        const bFC = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidFreeAbatementFC || 0);
        const bTA = (inst.bidEmbeddedAbatementTA || 0) + (inst.bidFreeAbatementTA || 0);
        const bFR = (inst.bidEmbeddedAbatementFR || 0) + (inst.bidFreeAbatementFR || 0);
        
        const bFCP = (inst.bidEmbeddedPercentFC || 0) + (inst.bidFreePercentFC || 0);
        const bTAP = (inst.bidEmbeddedPercentTA || 0) + (inst.bidFreePercentTA || 0);
        const bFRP = (inst.bidEmbeddedPercentFR || 0) + (inst.bidFreePercentFR || 0);

        const totalLineValue = inst.totalInstallment + bFC + bTA + bFR;

        return {
            fc: acc.fc + inst.commonFund + bFC,
            fcPct: acc.fcPct + (inst.monthlyRateFC || 0) + bFCP,
            ta: acc.ta + inst.adminFee + bTA,
            taPct: acc.taPct + (inst.monthlyRateTA || 0) + bTAP,
            fr: acc.fr + inst.reserveFund + bFR,
            frPct: acc.frPct + (inst.monthlyRateFR || 0) + bFRP,
            fine: acc.fine + (inst.manualFine || 0),
            interest: acc.interest + (inst.manualInterest || 0),
            total: acc.total + totalLineValue
        };
    }, { fc: 0, fcPct: 0, ta: 0, taPct: 0, fr: 0, frPct: 0, fine: 0, interest: 0, total: 0 });

    return {
        ...totals,
        totalPct: totals.fcPct + totals.taPct + totals.frPct
    };
  }, [installments]);

  const handleEditClick = (id: number, field: string, value: number) => {
    setEditingCell({ id, field });
    setEditValue(value.toFixed(2).replace('.', ','));
  };

  const handleSaveEdit = (installmentNum: number) => {
    if (!editingCell) return;
    const val = parseFloat(editValue.replace(',', '.'));
    if (!isNaN(val)) {
        const update: any = {};
        if (editingCell.field === 'fc') update.fc = val;
        else if (editingCell.field === 'fr') update.fr = val;
        else if (editingCell.field === 'ta') update.ta = val;
        else if (editingCell.field === 'fine') update.fine = val;
        else if (editingCell.field === 'interest') update.interest = val;
        updateInstallmentPayment(installmentNum, update);
    }
    setEditingCell(null);
  };

  const renderEditableCell = (inst: any, field: string, value: number, isManual: boolean, rate?: number) => {
    const isEditing = editingCell?.id === inst.installmentNumber && editingCell?.field === field;
    if (isEditing) return (<td className="p-2 text-right"><input autoFocus type="text" className="w-full p-1 border border-blue-400 rounded text-right text-xs" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(inst.installmentNumber); if (e.key === 'Escape') setEditingCell(null); }} onBlur={() => handleSaveEdit(inst.installmentNumber)} /></td>);
    return (<td className={`p-2 text-right text-xs cursor-pointer hover:bg-slate-50 ${isManual ? 'text-blue-600 font-bold' : ''}`} onClick={() => handleEditClick(inst.installmentNumber, field, value)}><div className="flex flex-col items-end"><span>{formatCurrency(value)}</span><span className="text-[9px] text-slate-400">{rate ? rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%' : ''}</span></div></td>);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 print:hidden">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Calculator className="text-emerald-600" /> Simulador e Extrato</h2>
             {currentQuota && <button onClick={() => navigate(`/edit/${currentQuota.id}`)} className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 text-sm font-medium flex items-center gap-2"><Pencil size={16} /> Editar Cota</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
             <div className="md:col-span-3 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Pesquisar..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500" /></div>
             <div className="md:col-span-9"><select className="w-full py-2 px-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md outline-none" value={currentQuota?.id || ''} onChange={(e) => { const found = quotas.find(q => q.id === e.target.value); setCurrentQuota(found || null); }}><option value="">Selecionar Cota ({filteredOptions.length})</option>{filteredOptions.map(q => (<option key={q.id} value={q.id}>{q.group} - {q.quotaNumber} {q.companyId ? `(${companies.find(c => c.id === q.companyId)?.name})` : ''}</option>))}</select></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase sticky top-0 z-20">
                <tr>
                  <th className="p-2 text-center bg-slate-100 sticky left-0 z-30 w-10">P</th>
                  <th className="p-2 min-w-[70px]">Vencimento</th>
                  <th className="p-2 text-right">FC Mensal (%)</th>
                  <th className="p-2 text-right">FR Mensal (%)</th>
                  <th className="p-2 text-right">TA Mensal (%)</th>
                  <th className="p-2 text-right">Multa</th>
                  <th className="p-2 text-right">Juros</th>
                  <th className="p-2 text-right font-bold text-slate-800 bg-emerald-50/50">Vlr Pago (%)</th>
                  <th className="p-2 text-right border-l border-slate-200 bg-slate-50/80">Saldo FC (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo FR (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo TA (%)</th>
                  <th className="p-2 text-right font-bold bg-slate-100 border-l border-slate-200">Saldo Total (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((inst) => (
                  <React.Fragment key={inst.installmentNumber}>
                  {inst.correctionApplied && (
                      <tr className="bg-blue-50 border-y border-blue-100">
                         <td className="p-2 text-center text-blue-600 sticky left-0 bg-blue-50 z-10"><TrendingUp size={12} className="mx-auto"/></td>
                         <td colSpan={11} className="p-2 text-blue-800 text-[10px] font-bold uppercase tracking-wide">
                            CORREÇÃO {inst.correctionIndexName}: {formatPercent((inst.correctionFactor || 0) * 100)} 
                            <span className="ml-2 font-normal opacity-75">(Crédito Base: {formatCurrency(inst.correctedCreditValue || 0)})</span>
                         </td>
                      </tr>
                  )}
                  {((inst.bidEmbeddedApplied ?? 0) > 0 || (inst.bidFreeApplied ?? 0) > 0) && (
                    <React.Fragment>
                      {inst.bidEmbeddedApplied! > 0 && (
                        <tr className="bg-amber-50 border-y border-amber-100/50">
                            <td className="p-2 text-center font-bold text-amber-700 sticky left-0 bg-amber-50 z-10"><Gavel size={14} className="mx-auto" /></td>
                            <td className="p-2 text-left font-bold text-amber-800 text-[9px] uppercase whitespace-nowrap">
                                <div>LANCE EMBUTIDO</div>
                                <div className="text-[8px] text-amber-600 font-medium flex items-center gap-0.5 mt-0.5">
                                    <Calendar size={8} /> {formatDate(inst.bidDate || '')}
                                </div>
                            </td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFR?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentTA?.toFixed(4)}%</span></div></td>
                            <td colSpan={2}></td>
                            <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercent?.toFixed(4)}%</span></div></td>
                            <td colSpan={4}></td>
                        </tr>
                      )}
                      {inst.bidFreeApplied! > 0 && (
                        <tr className="bg-orange-50 border-y border-orange-100/50">
                            <td className="p-2 text-center font-bold text-orange-700 sticky left-0 bg-orange-50 z-10"><Gavel size={14} className="mx-auto" /></td>
                            <td className="p-2 text-left font-bold text-orange-800 text-[9px] uppercase whitespace-nowrap">
                                <div>LANCE LIVRE</div>
                                <div className="text-[8px] text-orange-600 font-medium flex items-center gap-0.5 mt-0.5">
                                    <Calendar size={8} /> {formatDate(inst.bidDate || '')}
                                </div>
                            </td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFR?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentTA?.toFixed(4)}%</span></div></td>
                            <td colSpan={2}></td>
                            <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercent?.toFixed(4)}%</span></div></td>
                            <td colSpan={4}></td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="p-2 text-center font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100">{inst.installmentNumber}</td>
                    <td className="p-2 text-slate-500">{formatDate(inst.dueDate)}</td>
                    {renderEditableCell(inst, 'fc', inst.commonFund, inst.manualFC !== undefined && inst.manualFC !== null, inst.monthlyRateFC)}
                    {renderEditableCell(inst, 'fr', inst.reserveFund, inst.manualFR !== undefined && inst.manualFR !== null, inst.monthlyRateFR)}
                    {renderEditableCell(inst, 'ta', inst.adminFee, inst.manualTA !== undefined && inst.manualTA !== null, inst.monthlyRateTA)}
                    {renderEditableCell(inst, 'fine', inst.manualFine || 0, inst.manualFine !== undefined && inst.manualFine !== null)}
                    {renderEditableCell(inst, 'interest', inst.manualInterest || 0, inst.manualInterest !== undefined && inst.manualInterest !== null)}
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/20"><div className="flex flex-col items-end"><span>{formatCurrency(inst.totalInstallment || 0)}</span><span className="text-[8px] text-slate-400">{( (inst.totalInstallment / (inst.correctedCreditValue || 1) ) * 100).toFixed(4)}%</span></div></td>
                    <td className="p-2 text-right border-l border-slate-100"><span>{formatCurrency(inst.balanceFC)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFC.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceFR)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFR.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceTA)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceTA.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200"><span>{formatCurrency(inst.balanceTotal)}</span><br/><span className="text-[9px] text-slate-500 font-black">{inst.percentBalanceTotal.toFixed(4)}%</span></td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-slate-200 text-slate-800 font-bold text-[10px] uppercase border-t-2 border-slate-300 sticky bottom-0 z-20">
                  <tr>
                      <td className="p-2 text-center bg-slate-300 sticky left-0 z-30" colSpan={2}>Soma Final</td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fc)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.fcPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fr)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.frPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.ta)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.taPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.fine)}</td>
                      <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.interest)}</td>
                      <td className="p-2 text-right bg-emerald-100 font-black text-emerald-900"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.total)}</span><span className="text-[10px]">{footerTotals.totalPct.toFixed(4)}%</span></div></td>
                      <td colSpan={4} className="p-2 text-right text-[8px] text-slate-500 italic lowercase font-normal">* fechamento 100% FC + Taxas</td>
                  </tr>
              </tfoot>
            </table>
          </div>
      </div>

      {currentQuota && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print:border-none">
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo Pago (Histórico)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.paid.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL PAGO</span> <div className="flex gap-12"><span>{detailedSummary.paid.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{(detailedSummary.paid.total / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo a Pagar (Saldo)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL A VENCER</span> <div className="flex gap-12"><span>{detailedSummary.toPay.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{(detailedSummary.toPay.total / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-300 flex justify-between text-xs font-black">
                        <span>Qtde Parcelas Restantes:</span>
                        <span className="text-sm">{detailedSummary.counts.total.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
          </div>
      )}
    </div>
  );
};

export default Simulation;
