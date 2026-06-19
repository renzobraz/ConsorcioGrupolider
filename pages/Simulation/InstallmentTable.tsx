import React, { useState } from 'react';
import { TrendingUp, Gavel, CheckCircle, Edit3, Calendar, Trash2 } from 'lucide-react';
import { formatNumber, formatDate, safeParseNumber } from '../../utils/formatters';
import { PaymentInstallment } from '../../types';

interface FooterTotals {
  fc: number; fcPct: number;
  ta: number; taPct: number;
  fr: number; frPct: number;
  insurance: number; amortization: number;
  fine: number; interest: number; manualEarnings: number;
  total: number; totalPct: number;
  paidTotal: number; paidTotalPct: number;
}

interface InstallmentTableProps {
  installments: PaymentInstallment[];
  payments: Record<number, any>;
  footerTotals: FooterTotals;
  updateInstallmentPayment: (num: number, data: any) => void;
  openPaymentModal: (inst: any, isBid?: boolean, isEmbedded?: boolean) => void;
  onEditManualTx: (txId: string) => void;
  onDeleteManualTx: (txId: string) => void;
}

const PAID_STATUSES = ['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'];

const InstallmentTable: React.FC<InstallmentTableProps> = ({
  installments, payments, footerTotals,
  updateInstallmentPayment, openPaymentModal, onEditManualTx, onDeleteManualTx
}) => {
  const [editingCell, setEditingCell] = useState<{ id: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEditClick = (id: number, field: string, value: number) => {
    setEditingCell({ id, field });
    setEditValue(value.toFixed(2).replace('.', ','));
  };

  const handleSaveEdit = (installmentNum: number) => {
    if (!editingCell) return;
    const val = safeParseNumber(editValue);
    if (!isNaN(val)) {
      const update: any = {};
      const f = editingCell.field;
      if (f === 'fc') update.fc = val;
      else if (f === 'fr') update.fr = val;
      else if (f === 'ta') update.ta = val;
      else if (f === 'fine') update.fine = val;
      else if (f === 'interest') update.interest = val;
      else if (f === 'insurance') update.insurance = val;
      else if (f === 'amortization') update.amortization = val;
      updateInstallmentPayment(installmentNum, update);
    }
    setEditingCell(null);
  };

  const renderEditableCell = (inst: any, field: string, value: number, isManual: boolean, rate?: number) => {
    const isEditing = editingCell?.id === inst.installmentNumber && editingCell?.field === field;
    if (isEditing) {
      return (
        <td className="p-2 text-right">
          <input autoFocus type="text"
            className="w-full p-1 border border-blue-400 rounded text-right text-xs"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit(inst.installmentNumber);
              if (e.key === 'Escape') setEditingCell(null);
            }}
            onBlur={() => handleSaveEdit(inst.installmentNumber)}
          />
        </td>
      );
    }
    return (
      <td className={`p-2 text-right text-xs cursor-pointer hover:bg-slate-50 ${isManual ? 'text-blue-600 font-bold' : ''}`}
        onClick={() => handleEditClick(inst.installmentNumber, field, value)}>
        <div className="flex flex-col items-end">
          <span>{formatNumber(value)}</span>
          <span className="text-[9px] text-slate-400">
            {rate ? rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%' : ''}
          </span>
        </div>
      </td>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-xs text-left border-collapse min-w-[1400px]">
          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase sticky top-0 z-20">
            <tr>
              <th className="p-2 text-center bg-slate-100 sticky left-0 z-30 w-10">P</th>
              <th className="p-2 min-w-[70px]">Vencimento</th>
              <th className="p-2 text-right">Crédito</th>
              <th className="p-2 text-right">FC Mensal (%)</th>
              <th className="p-2 text-right">TA Mensal (%)</th>
              <th className="p-2 text-right">FR Mensal (%)</th>
              <th className="p-2 text-right">Seguro</th>
              <th className="p-2 text-right">Amort.</th>
              <th className="p-2 text-right">Multa</th>
              <th className="p-2 text-right">Juros</th>
              <th className="p-2 text-right text-blue-700 bg-blue-50/30">Extra/Rend.</th>
              <th className="p-2 text-right font-bold text-slate-800 bg-emerald-50/50">Vlr Previsto (%)</th>
              <th className="p-2 text-right border-l border-slate-200 bg-slate-50/80">Saldo FC (%)</th>
              <th className="p-2 text-right bg-slate-50/80">Saldo TA (%)</th>
              <th className="p-2 text-right bg-slate-50/80">Saldo FR (%)</th>
              <th className="p-2 text-right font-bold bg-slate-100 border-l border-slate-200">Saldo Total (%)</th>
              <th className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/50 border-l border-slate-200">Vlr Efetivado</th>
              <th className="p-2 text-center bg-slate-100 border-l border-slate-200 w-12 print:hidden">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {installments.map((inst, idx) => {
              const uniqueKey = inst.isManualTransaction
                ? `manual-${inst.manualTransactionId}-${idx}`
                : `inst-${inst.installmentNumber}-${idx}`;

              return (
                <React.Fragment key={uniqueKey}>
                  {inst.correctionApplied && (
                    <tr className="bg-blue-50 border-y border-blue-100">
                      <td className="p-2 text-center text-blue-600 sticky left-0 bg-blue-50 z-10"><TrendingUp size={12} className="mx-auto" /></td>
                      <td colSpan={11} className="p-2 text-blue-800 text-[10px] font-bold uppercase tracking-wide">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            CORREÇÃO {inst.correctionIndexName}: {((inst.correctionFactor || 0) * 100).toFixed(4)}%
                            {inst.correctionCapApplied && (
                              <span className="text-red-600 font-bold">
                                (TETO APLICADO. ÍNDICE REAL: {(inst.correctionRealRate || 0).toFixed(4)}%)
                              </span>
                            )}
                          </div>
                          <div className="flex gap-4 mt-1 font-normal opacity-75 text-[9px]">
                            <span>Crédito Base: {formatNumber(inst.correctedCreditValue || 0)}</span>
                            <span>Ajuste FC: +{formatNumber(inst.correctionAmountFC || 0)}</span>
                            <span>Ajuste TA: +{formatNumber(inst.correctionAmountTA || 0)}</span>
                            <span>Ajuste FR: +{formatNumber(inst.correctionAmountFR || 0)}</span>
                            <span className="font-bold">Total Ajuste: +{formatNumber(inst.correctionAmountTotal || 0)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-right border-l border-blue-200 text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.correctionBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceFC?.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.correctionBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceTA?.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.correctionBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceFR?.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right font-bold text-blue-900 bg-blue-100/50 border-l border-blue-200"><div className="flex flex-col items-end"><span>{formatNumber(inst.correctionBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.correctionPercentBalanceTotal?.toFixed(4)}%</span></div></td>
                      <td></td>
                    </tr>
                  )}

                  {((inst.bidEmbeddedApplied ?? 0) > 0 || (inst.bidFreeApplied ?? 0) > 0) && (
                    <React.Fragment>
                      {(inst.bidEmbeddedApplied ?? 0) > 0 && (
                        <tr className={`bg-amber-50 border-y border-amber-100/50 ${payments[-1]?.status === 'PAGO' ? 'bg-emerald-50/30' : ''}`}>
                          <td className="p-2 text-center font-bold text-amber-700 sticky left-0 bg-amber-50 z-10">
                            <div className="flex flex-col items-center">
                              <Gavel size={14} className="mx-auto" />
                              {payments[-1]?.status === 'PAGO' && <CheckCircle size={10} className="text-emerald-500 mx-auto mt-0.5" />}
                            </div>
                          </td>
                          <td className="p-2 text-left font-bold text-amber-800 text-[9px] uppercase whitespace-nowrap">
                            <div>LANCE EMBUTIDO</div>
                            <div className="text-[8px] text-amber-600 font-medium flex items-center gap-0.5 mt-0.5">
                              <Calendar size={8} /> {formatDate(payments[-1]?.paymentDate || inst.bidDate || '')}
                            </div>
                          </td>
                          <td></td>
                          <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidEmbeddedAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFC?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidEmbeddedAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentTA?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidEmbeddedAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFR?.toFixed(4)}%</span></div></td>
                          <td colSpan={5}></td>
                          <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/30"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidEmbeddedApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercent?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right border-l border-amber-200 text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidEmbeddedBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceFC?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidEmbeddedBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceTA?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidEmbeddedBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceFR?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/50 border-l border-amber-200"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidEmbeddedBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercentBalanceTotal?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-center border-l border-amber-200 print:hidden">
                            <button onClick={() => openPaymentModal(inst, true, true)}
                              className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${PAID_STATUSES.includes(payments[-1]?.status || '') ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-amber-700 bg-amber-100 hover:bg-amber-200'}`}>
                              {PAID_STATUSES.includes(payments[-1]?.status || '') ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                            </button>
                          </td>
                        </tr>
                      )}
                      {(inst.bidFreeApplied ?? 0) > 0 && (
                        <tr className={`bg-orange-50 border-y border-orange-100/50 ${payments[0]?.status === 'PAGO' ? 'bg-emerald-50/30' : ''}`}>
                          <td className="p-2 text-center font-bold text-orange-700 sticky left-0 bg-orange-50 z-10">
                            <div className="flex flex-col items-center">
                              <Gavel size={14} className="mx-auto" />
                              {payments[0]?.status === 'PAGO' && <CheckCircle size={10} className="text-emerald-500 mx-auto mt-0.5" />}
                            </div>
                          </td>
                          <td className="p-2 text-left font-bold text-orange-800 text-[9px] uppercase whitespace-nowrap">
                            <div>LANCE LIVRE</div>
                            <div className="text-[8px] text-orange-600 font-medium flex items-center gap-0.5 mt-0.5">
                              <Calendar size={8} /> {formatDate(payments[0]?.paymentDate || inst.bidDate || '')}
                            </div>
                          </td>
                          <td></td>
                          <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidFreeAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFC?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidFreeAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentTA?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidFreeAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFR?.toFixed(4)}%</span></div></td>
                          <td colSpan={5}></td>
                          <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/30"><div className="flex flex-col items-end"><span>-{formatNumber(inst.bidFreeApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercent?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right border-l border-orange-200 text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidFreeBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceFC?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidFreeBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceTA?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidFreeBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceFR?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/50 border-l border-orange-200"><div className="flex flex-col items-end"><span>{formatNumber(inst.bidFreeBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercentBalanceTotal?.toFixed(4)}%</span></div></td>
                          <td className="p-2 text-center border-l border-orange-200 print:hidden">
                            <button onClick={() => openPaymentModal(inst, true, false)}
                              className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${PAID_STATUSES.includes(payments[0]?.status || '') ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-orange-700 bg-orange-100 hover:bg-orange-200'}`}>
                              {PAID_STATUSES.includes(payments[0]?.status || '') ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                            </button>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}

                  <tr className={`hover:bg-slate-50 transition-colors ${inst.isPaid ? 'bg-emerald-50/30' : ''}`}>
                    <td className="p-2 text-center font-medium sticky left-0 bg-white z-10 border-r border-slate-100">
                      <div className="flex flex-col items-center">
                        <span className={`text-[9px] ${inst.isPaid ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                          {inst.installmentNumber === 0 ? '000' : inst.installmentNumber}
                        </span>
                        {inst.isPaid && <CheckCircle size={10} className="text-emerald-500 mx-auto mt-0.5" />}
                        {inst.tag && (
                          <span className="text-[8px] font-black text-blue-600 uppercase mt-0.5 bg-blue-50 px-1 rounded border border-blue-100">
                            {inst.tag}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-slate-500">
                      {formatDate(inst.dueDate)}
                      {inst.isPaid && inst.paymentDate && (
                        <div className="text-[8px] text-emerald-600 font-medium">Pago: {formatDate(inst.paymentDate)}</div>
                      )}
                    </td>
                    <td className="p-2 text-right text-slate-500">{formatNumber(inst.correctedCreditValue || 0)}</td>
                    {renderEditableCell(inst, 'fc', inst.commonFund, inst.manualFC !== undefined && inst.manualFC !== null, inst.monthlyRateFC)}
                    {renderEditableCell(inst, 'ta', inst.adminFee, inst.manualTA !== undefined && inst.manualTA !== null, inst.monthlyRateTA)}
                    {renderEditableCell(inst, 'fr', inst.reserveFund, inst.manualFR !== undefined && inst.manualFR !== null, inst.monthlyRateFR)}
                    {renderEditableCell(inst, 'insurance', inst.insurance || 0, inst.manualInsurance !== undefined && inst.manualInsurance !== null)}
                    {renderEditableCell(inst, 'amortization', inst.amortization || 0, inst.manualAmortization !== undefined && inst.manualAmortization !== null)}
                    {renderEditableCell(inst, 'fine', inst.manualFine || 0, inst.manualFine !== undefined && inst.manualFine !== null)}
                    {renderEditableCell(inst, 'interest', inst.manualInterest || 0, inst.manualInterest !== undefined && inst.manualInterest !== null)}
                    <td className={`p-2 text-right text-xs font-medium ${inst.manualEarnings ? 'text-blue-600 bg-blue-50/30' : 'text-slate-400'}`}>
                      {inst.manualEarnings ? formatNumber(inst.manualEarnings) : '-'}
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/20">
                      <div className="flex flex-col items-end">
                        <span>{formatNumber((inst.totalInstallment || 0) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0))}</span>
                        <span className="text-[8px] text-slate-400">
                          {(((inst.totalInstallment || 0) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0)) / (inst.correctedCreditValue || 1) * 100).toFixed(4)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-right border-l border-slate-100"><span>{formatNumber(inst.balanceFC)}</span><br /><span className="text-[8px] text-slate-400">{inst.percentBalanceFC.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatNumber(inst.balanceTA)}</span><br /><span className="text-[8px] text-slate-400">{inst.percentBalanceTA.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatNumber(inst.balanceFR)}</span><br /><span className="text-[8px] text-slate-400">{inst.percentBalanceFR.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200"><span>{formatNumber(inst.balanceTotal)}</span><br /><span className="text-[9px] text-slate-500 font-black">{inst.percentBalanceTotal.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/30 border-l border-slate-200">
                      <div className="flex flex-col items-end">
                        <span>{inst.isPaid ? formatNumber(inst.realAmountPaid || 0) : '-'}</span>
                        {inst.isPaid && (
                          <span className="text-[8px] text-emerald-600 font-black">
                            {((inst.realAmountPaid || 0) / (inst.correctedCreditValue || 1) * 100).toFixed(4)}%
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-center border-l border-slate-200 print:hidden">
                      {inst.isManualTransaction ? (
                        <div className="flex flex-col gap-1">
                          <button onClick={() => onEditManualTx(inst.manualTransactionId || '')}
                            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full text-blue-700 bg-blue-50 hover:bg-blue-100">
                            <Edit3 size={12} /> Editar
                          </button>
                          <button onClick={() => onDeleteManualTx(inst.manualTransactionId || '')}
                            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full text-red-700 bg-red-50 hover:bg-red-100">
                            <Trash2 size={12} /> Excluir
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => openPaymentModal(inst)}
                          className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${inst.isPaid ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}>
                          {inst.isPaid ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                        </button>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-200 text-slate-800 font-bold text-[10px] uppercase border-t-2 border-slate-300 sticky bottom-0 z-20">
            <tr>
              <td className="p-2 text-center bg-slate-300 sticky left-0 z-30" colSpan={3}>Soma Final</td>
              <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatNumber(footerTotals.fc)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.fcPct.toFixed(4)}%</span></div></td>
              <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatNumber(footerTotals.ta)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.taPct.toFixed(4)}%</span></div></td>
              <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatNumber(footerTotals.fr)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.frPct.toFixed(4)}%</span></div></td>
              <td className="p-2 text-right text-slate-700">{formatNumber(footerTotals.insurance)}</td>
              <td className="p-2 text-right text-slate-700">{formatNumber(footerTotals.amortization)}</td>
              <td className="p-2 text-right text-red-700">{formatNumber(footerTotals.fine)}</td>
              <td className="p-2 text-right text-red-700">{formatNumber(footerTotals.interest)}</td>
              <td className="p-2 text-right text-blue-800 bg-blue-100/50">{formatNumber(footerTotals.manualEarnings)}</td>
              <td className="p-2 text-right bg-emerald-100 font-black text-emerald-900"><div className="flex flex-col items-end"><span>{formatNumber(footerTotals.total)}</span><span className="text-[10px]">{footerTotals.totalPct.toFixed(4)}%</span></div></td>
              <td colSpan={4} className="p-2 text-right text-[8px] text-slate-500 italic lowercase font-normal">* fechamento 100% FC + Taxas</td>
              <td className="p-2 text-right bg-emerald-100 font-black text-emerald-900 border-l border-slate-200"><div className="flex flex-col items-end"><span>{formatNumber(footerTotals.paidTotal)}</span><span className="text-[10px]">{footerTotals.paidTotalPct.toFixed(4)}%</span></div></td>
              <td className="p-2 print:hidden"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default InstallmentTable;
