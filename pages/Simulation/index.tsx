import React, { useState, useMemo, useEffect } from 'react';
import { useConsortium } from '../../store/ConsortiumContext';
import ConsortiumFilterBar from '../../components/ConsortiumFilterBar';
import { getTodayStr, generateUUID } from '../../utils/formatters';
import { Pencil, TrendingUp, X, Calendar, CheckCircle, Download, FileText, Printer, Settings, Trash2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentStatus, ManualTransactionType, ProjectionConfig } from '../../types';
import { calculateScheduleSummary, calculateAverageIndices } from '../../services/calculationService';

import PaymentModal from './PaymentModal';
import ManualTxModal from './ManualTxModal';
import InstallmentTable from './InstallmentTable';
import SummarySection from './SummarySection';
import { useExport } from './useExport';

const EMPTY_PAYMENT_FORM = {
  status: PaymentStatus.PREVISTO, paymentDate: '',
  amount: '0', fc: '0', fr: '0', ta: '0',
  insurance: '0', amortization: '0', fine: '0', interest: '0', manualEarnings: '0'
};

const EMPTY_TX_FORM = {
  date: getTodayStr(), amount: '0', type: ManualTransactionType.EARNING, description: '',
  fc: '0', fr: '0', ta: '0', insurance: '0', amortization: '0', fine: '0', interest: '0'
};

const Simulation = () => {
  const {
    quotas, currentQuota, setCurrentQuota, installments, payments,
    updateInstallmentPayment, companies, administrators, indices, globalFilters, setGlobalFilters,
    manualTransactions, addManualTransaction, updateManualTransaction, deleteManualTransaction,
    projectionConfig, setProjectionConfig
  } = useConsortium();
  const navigate = useNavigate();

  useEffect(() => {
    if (globalFilters.quotaId && (!currentQuota || currentQuota.id !== globalFilters.quotaId)) {
      const quota = quotas.find(q => q.id === globalFilters.quotaId);
      if (quota) setCurrentQuota(quota);
    }
  }, [globalFilters.quotaId, quotas]);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [isBidModal, setIsBidModal] = useState(false);
  const [isEmbeddedBidModal, setIsEmbeddedBidModal] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState(EMPTY_PAYMENT_FORM);

  // Manual transaction modal state
  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
  const [editingManualTxId, setEditingManualTxId] = useState<string | null>(null);
  const [manualTxFormData, setManualTxFormData] = useState(EMPTY_TX_FORM);

  // Projection settings popover
  const [isProjectionSettingsOpen, setIsProjectionSettingsOpen] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openPaymentModal = (inst: any, isBid = false, isEmbedded = false) => {
    setSelectedInstallment(inst);
    setIsBidModal(isBid);
    setIsEmbeddedBidModal(isEmbedded);
    const toStr = (val: any) => (val === undefined || val === null) ? '0' : val.toString().replace('.', ',');

    if (isBid) {
      const bidPayment = isEmbedded ? (payments[-1] || {}) : (payments[0] || {});
      const amount = isEmbedded ? (inst.bidEmbeddedApplied || 0) : (inst.bidFreeApplied || 0);
      const fc = isEmbedded ? (inst.bidEmbeddedAbatementFC || 0) : (inst.bidFreeAbatementFC || 0);
      const fr = isEmbedded ? (inst.bidEmbeddedAbatementFR || 0) : (inst.bidFreeAbatementFR || 0);
      const ta = isEmbedded ? (inst.bidEmbeddedAbatementTA || 0) : (inst.bidFreeAbatementTA || 0);
      setPaymentFormData({
        status: PaymentStatus.PAGO,
        paymentDate: bidPayment.paymentDate ? bidPayment.paymentDate.split('T')[0] : (inst.bidDate ? inst.bidDate.split('T')[0] : getTodayStr()),
        amount: toStr(bidPayment.amount || amount), fc: toStr(bidPayment.manualFC || fc),
        fr: toStr(bidPayment.manualFR || fr), ta: toStr(bidPayment.manualTA || ta),
        insurance: toStr(bidPayment.manualInsurance || 0), amortization: toStr(bidPayment.manualAmortization || 0),
        fine: toStr(bidPayment.manualFine || 0), interest: toStr(bidPayment.manualInterest || 0),
        manualEarnings: toStr(bidPayment.manualEarnings || 0)
      });
    } else {
      setPaymentFormData({
        status: PaymentStatus.PAGO,
        paymentDate: inst.paymentDate ? inst.paymentDate.split('T')[0] : (inst.dueDate ? inst.dueDate.split('T')[0] : getTodayStr()),
        amount: toStr((inst.realAmountPaid !== null && inst.realAmountPaid !== undefined) ? inst.realAmountPaid : (inst.totalInstallment || 0)),
        fc: toStr((inst.manualFC !== undefined && inst.manualFC !== null) ? inst.manualFC : (inst.commonFund || 0)),
        fr: toStr((inst.manualFR !== undefined && inst.manualFR !== null) ? inst.manualFR : (inst.reserveFund || 0)),
        ta: toStr((inst.manualTA !== undefined && inst.manualTA !== null) ? inst.manualTA : (inst.adminFee || 0)),
        insurance: toStr((inst.manualInsurance !== undefined && inst.manualInsurance !== null) ? inst.manualInsurance : (inst.insurance || 0)),
        amortization: toStr((inst.manualAmortization !== undefined && inst.manualAmortization !== null) ? inst.manualAmortization : (inst.amortization || 0)),
        fine: toStr(inst.manualFine || 0), interest: toStr(inst.manualInterest || 0),
        manualEarnings: toStr(inst.manualEarnings || 0)
      });
    }
    setIsPaymentModalOpen(true);
  };

  const handlePaymentFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'status' || name === 'paymentDate') {
      setPaymentFormData(prev => ({ ...prev, [name]: value }));
    } else {
      const sanitized = value.replace(/[^0-9,.]/g, '');
      setPaymentFormData(prev => {
        const next = { ...prev, [name]: sanitized };
        if (name !== 'amount') {
          const p = (v: string) => parseFloat(v.replace(',', '.')) || 0;
          const total = p(next.fc) + p(next.fr) + p(next.ta) + p(next.insurance) + p(next.amortization) + p(next.fine) + p(next.interest);
          next.amount = total.toFixed(2).replace('.', ',');
        }
        return next;
      });
    }
  };

  const savePaymentModal = async () => {
    if (!selectedInstallment && !isBidModal) return;
    try {
      let installmentNumber = selectedInstallment?.installmentNumber;
      if (isBidModal) installmentNumber = isEmbeddedBidModal ? -1 : 0;
      const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
      await updateInstallmentPayment(installmentNumber, {
        status: paymentFormData.status, paymentDate: paymentFormData.paymentDate,
        amount: parse(paymentFormData.amount), fc: parse(paymentFormData.fc),
        fr: parse(paymentFormData.fr), ta: parse(paymentFormData.ta),
        insurance: parse(paymentFormData.insurance), amortization: parse(paymentFormData.amortization),
        fine: parse(paymentFormData.fine), interest: parse(paymentFormData.interest),
        manualEarnings: parse(paymentFormData.manualEarnings)
      });
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
      setIsBidModal(false);
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar pagamento. Verifique sua conexão ou as configurações do banco de dados.');
    }
  };

  const handleManualTxFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'type' || name === 'date' || name === 'description') {
      setManualTxFormData(prev => ({ ...prev, [name]: value }));
    } else {
      const sanitized = value.replace(/[^0-9,.]/g, '');
      setManualTxFormData(prev => {
        const next = { ...prev, [name]: sanitized };
        if (name !== 'amount') {
          const p = (v: string) => parseFloat(v.replace(',', '.')) || 0;
          const total = p(next.fc) + p(next.fr) + p(next.ta) + p(next.insurance) + p(next.amortization) + p(next.fine) + p(next.interest);
          next.amount = total.toFixed(2).replace('.', ',');
        }
        return next;
      });
    }
  };

  const handleManualTxSubmit = async () => {
    if (!currentQuota) return;
    try {
      const parse = (v: string) => {
        if (typeof v !== 'string') return v || 0;
        return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
      };
      const transaction = {
        id: editingManualTxId || generateUUID(), quotaId: currentQuota.id,
        date: manualTxFormData.date, type: manualTxFormData.type,
        description: manualTxFormData.description, amount: parse(manualTxFormData.amount),
        fc: parse(manualTxFormData.fc), fr: parse(manualTxFormData.fr), ta: parse(manualTxFormData.ta),
        insurance: parse(manualTxFormData.insurance), amortization: parse(manualTxFormData.amortization),
        fine: parse(manualTxFormData.fine), interest: parse(manualTxFormData.interest)
      };
      if (editingManualTxId) await updateManualTransaction(transaction);
      else await addManualTransaction(transaction);
      setIsManualTxModalOpen(false);
      setEditingManualTxId(null);
      setManualTxFormData(EMPTY_TX_FORM);
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar transação manual. Verifique sua conexão.');
    }
  };

  const handleEditManualTx = (txId: string) => {
    const tx = manualTransactions.find(t => t.id === txId);
    if (!tx) return;
    const fmt = (n: number) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    setManualTxFormData({
      date: tx.date, amount: fmt(tx.amount), type: tx.type, description: tx.description || '',
      fc: fmt(tx.fc || 0), fr: fmt(tx.fr || 0), ta: fmt(tx.ta || 0),
      insurance: fmt(tx.insurance || 0), amortization: fmt(tx.amortization || 0),
      fine: fmt(tx.fine || 0), interest: fmt(tx.interest || 0)
    });
    setEditingManualTxId(txId);
    setIsManualTxModalOpen(true);
  };

  const handleDeleteManualTx = async (txId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta transação manual? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteManualTransaction(txId);
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir transação manual. Verifique sua conexão.');
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const todayStr = getTodayStr();

  const currentDisplayCredit = useMemo(() => {
    if (!currentQuota) return 0;
    if (installments.length === 0) return currentQuota.creditValue;
    const pastOrPresent = installments.filter(i => i.dueDate && i.dueDate.split('T')[0] <= todayStr);
    if (pastOrPresent.length > 0) return pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || currentQuota.creditValue;
    return installments[0].correctedCreditValue || currentQuota.creditValue;
  }, [currentQuota, installments, todayStr]);

  const quotaStatus = useMemo(() => {
    if (!currentQuota) return '';
    if (!currentQuota.firstAssemblyDate) return 'Pré-Grupo';
    const firstAssembly = new Date(currentQuota.firstAssemblyDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); firstAssembly.setHours(0, 0, 0, 0);
    return today < firstAssembly ? 'Pré-Grupo' : 'Grupo Ativo';
  }, [currentQuota]);

  const chartData = useMemo(() => {
    if (!installments || installments.length === 0) return [];
    return installments.map(inst => ({ name: `P${inst.installmentNumber}`, valor: inst.totalInstallment }));
  }, [installments]);

  const avgRates = useMemo(() => {
    if (!indices || indices.length === 0) return {};
    return calculateAverageIndices(indices, projectionConfig.periodMonths);
  }, [indices, projectionConfig.periodMonths]);

  const currentAvgRate = useMemo(() => {
    if (!currentQuota) return 0;
    if (projectionConfig.customRate) return (Math.pow(1 + (projectionConfig.customRate / 100), 1 / 12) - 1) * 100;
    return avgRates[currentQuota.correctionIndex] || 0;
  }, [currentQuota, avgRates, projectionConfig.customRate]);

  const originalTotal = useMemo(() => {
    if (!currentQuota || !installments) return 0;
    const lastPaid = [...installments].reverse().find(i => i.isPaid);
    const baseCredit = lastPaid?.correctedCreditValue || currentQuota.creditValue;
    return installments.reduce((sum, inst) => {
      if (inst.isPaid) return sum + inst.totalInstallment;
      const fc = (baseCredit * (inst.monthlyRateFC || 0)) / 100;
      const fr = (baseCredit * (inst.monthlyRateFR || 0)) / 100;
      const ta = (baseCredit * (inst.monthlyRateTA || 0)) / 100;
      return sum + fc + fr + ta + (inst.insurance || 0) + (inst.amortization || 0);
    }, 0);
  }, [currentQuota, installments]);

  const finalProjectedCredit = useMemo(() => {
    if (!installments || installments.length === 0) return 0;
    return installments[installments.length - 1].correctedCreditValue || 0;
  }, [installments]);

  const detailedSummary = useMemo(() => {
    if (!currentQuota) return {
      paid: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
      toPay: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
      total: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, total: 0 },
      counts: { total: 0 }
    };
    const summary = calculateScheduleSummary(currentQuota, installments, payments);
    return { ...summary, counts: { total: installments.filter(i => !i.isPaid && i.installmentNumber > 0).length } };
  }, [currentQuota, installments, payments]);

  const projectedTotal = detailedSummary?.total?.total || 0;
  const inflationCost = projectedTotal - originalTotal;

  const footerTotals = useMemo(() => {
    const totals = installments.reduce((acc, inst) => {
      const bFC = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidFreeAbatementFC || 0);
      const bTA = (inst.bidEmbeddedAbatementTA || 0) + (inst.bidFreeAbatementTA || 0);
      const bFR = (inst.bidEmbeddedAbatementFR || 0) + (inst.bidFreeAbatementFR || 0);
      const bFCP = (inst.bidEmbeddedPercentFC || 0) + (inst.bidFreePercentFC || 0);
      const bTAP = (inst.bidEmbeddedPercentTA || 0) + (inst.bidFreePercentTA || 0);
      const bFRP = (inst.bidEmbeddedPercentFR || 0) + (inst.bidFreePercentFR || 0);
      const manualFCContribution = inst.manualEarnings || 0;
      const totalLineValue = inst.isManualTransaction ? inst.realAmountPaid : (inst.totalInstallment + bFC + bTA + bFR + manualFCContribution);
      return {
        fc: acc.fc + inst.commonFund + bFC + manualFCContribution,
        fcPct: acc.fcPct + (inst.monthlyRateFC || 0) + bFCP,
        ta: acc.ta + inst.adminFee + bTA, taPct: acc.taPct + (inst.monthlyRateTA || 0) + bTAP,
        fr: acc.fr + inst.reserveFund + bFR, frPct: acc.frPct + (inst.monthlyRateFR || 0) + bFRP,
        insurance: acc.insurance + (inst.insurance || 0), amortization: acc.amortization + (inst.amortization || 0),
        fine: acc.fine + (inst.manualFine || 0), interest: acc.interest + (inst.manualInterest || 0),
        manualEarnings: acc.manualEarnings + manualFCContribution,
        total: acc.total + (totalLineValue || 0),
        paidTotal: acc.paidTotal + (inst.isPaid ? (inst.realAmountPaid || 0) : 0)
      };
    }, { fc: 0, fcPct: 0, ta: 0, taPct: 0, fr: 0, frPct: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, manualEarnings: 0, total: 0, paidTotal: 0 });
    return {
      ...totals, totalPct: totals.fcPct + totals.taPct + totals.frPct,
      paidTotalPct: currentDisplayCredit > 0 ? (totals.paidTotal / currentDisplayCredit) * 100 : 0
    };
  }, [installments, currentDisplayCredit]);

  const { exportToExcel, exportToPDF, handlePrint } = useExport({
    currentQuota, installments, payments, administrators, projectionConfig, currentAvgRate
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <ConsortiumFilterBar showQuotaFilter={true} />

      <PaymentModal
        isOpen={isPaymentModalOpen} isBidModal={isBidModal}
        selectedInstallment={selectedInstallment} formData={paymentFormData}
        onChange={handlePaymentFormChange} onSave={savePaymentModal}
        onClose={() => { setIsPaymentModalOpen(false); setSelectedInstallment(null); setIsBidModal(false); }}
      />

      <ManualTxModal
        isOpen={isManualTxModalOpen} editingId={editingManualTxId}
        formData={manualTxFormData} onChange={handleManualTxFormChange}
        onSubmit={handleManualTxSubmit}
        onClose={() => { setIsManualTxModalOpen(false); setEditingManualTxId(null); }}
      />

      {/* Toolbar */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          {currentQuota && (
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider ml-0.5">Status Quota</span>
              <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase ${quotaStatus === 'Pré-Grupo' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                {quotaStatus}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentQuota && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-lg">
              <button
                onClick={() => setProjectionConfig({ ...projectionConfig, enabled: !projectionConfig.enabled })}
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${projectionConfig.enabled ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
              >
                <TrendingUp size={14} className={projectionConfig.enabled ? 'animate-pulse' : ''} />
                {projectionConfig.enabled ? 'Projeção Ativa' : 'Simular Futuro'}
              </button>
              <button
                onClick={() => setIsProjectionSettingsOpen(!isProjectionSettingsOpen)}
                className={`p-1.5 rounded-md border transition-all ${isProjectionSettingsOpen ? 'bg-white border-blue-300 text-blue-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'}`}
              >
                <Settings size={14} />
              </button>
              {isProjectionSettingsOpen && (
                <div className="absolute top-20 right-4 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Configurar Projeção</h4>
                    <button onClick={() => setIsProjectionSettingsOpen(false)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1 ml-0.5">Período da Média</label>
                      <select value={projectionConfig.periodMonths}
                        onChange={(e) => setProjectionConfig({ ...projectionConfig, periodMonths: Number(e.target.value), customRate: undefined })}
                        className="w-full text-xs border border-slate-200 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value={12}>Últimos 12 meses</option>
                        <option value={24}>Últimos 24 meses</option>
                        <option value={36}>Últimos 36 meses (3 anos)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1 ml-0.5">Taxa Anual Fixa (%)</label>
                      <div className="flex gap-2">
                        <input type="number" step="0.1" placeholder="Ex: 5.0" value={projectionConfig.customRate || ''}
                          onChange={(e) => setProjectionConfig({ ...projectionConfig, customRate: e.target.value ? Number(e.target.value) : undefined })}
                          className="flex-1 text-xs border border-slate-200 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-bold" />
                        {projectionConfig.customRate && (
                          <button onClick={() => setProjectionConfig({ ...projectionConfig, customRate: undefined })} className="p-2 text-red-500 hover:bg-red-50 rounded-md">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 mt-1 italic">Ignora a média histórica se preenchido.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentQuota && <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>}

          {currentQuota && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-lg">
              <button
                onClick={() => { setManualTxFormData(EMPTY_TX_FORM); setIsManualTxModalOpen(true); }}
                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md border border-emerald-200 text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Plus size={14} /> Transação Manual
              </button>
              <div className="flex items-center gap-1 border-l border-slate-200 ml-1 pl-1">
                <button onClick={exportToExcel} className="p-1.5 text-slate-500 hover:bg-white hover:text-emerald-600 rounded-md transition-all" title="Exportar Excel"><Download size={16} /></button>
                <button onClick={exportToPDF} className="p-1.5 text-slate-500 hover:bg-white hover:text-red-600 rounded-md transition-all" title="Exportar PDF"><FileText size={16} /></button>
                <button onClick={handlePrint} className="p-1.5 text-slate-500 hover:bg-white hover:text-blue-600 rounded-md transition-all" title="Imprimir"><Printer size={16} /></button>
              </div>
            </div>
          )}

          {currentQuota && (
            <button onClick={() => navigate(`/edit/${currentQuota.id}`)}
              className="px-3 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 text-xs font-bold flex items-center gap-2 transition-all shadow-sm">
              <Pencil size={14} /> Editar Cota
            </button>
          )}
        </div>
      </div>

      {/* Info bar */}
      {currentQuota && (
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-between text-sm text-emerald-800">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              <span>Mês de Referência do Índice: <strong>{currentQuota.indexReferenceMonth || 'Não definido'}</strong></span>
            </div>
            {currentQuota.isContemplated && currentQuota.contemplationDate && (
              <div className="flex items-center gap-2 border-l border-emerald-200 pl-6">
                <CheckCircle size={18} className="text-emerald-600" />
                <span>Data de Contemplação: <strong>{currentQuota.contemplationDate}</strong></span>
                {currentQuota.isDrawContemplation && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-200 text-emerald-800 rounded-full text-[10px] font-bold uppercase">Sorteio</span>
                )}
              </div>
            )}
          </div>
          <span className="text-xs opacity-75 italic">Utilizado para o cálculo de correção anual (M-2)</span>
        </div>
      )}

      {currentQuota && (
        <InstallmentTable
          installments={installments} payments={payments} footerTotals={footerTotals}
          updateInstallmentPayment={updateInstallmentPayment} openPaymentModal={openPaymentModal}
          onEditManualTx={handleEditManualTx} onDeleteManualTx={handleDeleteManualTx}
        />
      )}

      {currentQuota && (
        <SummarySection
          currentQuota={currentQuota} detailedSummary={detailedSummary}
          projectionConfig={projectionConfig} currentAvgRate={currentAvgRate}
          originalTotal={originalTotal} projectedTotal={projectedTotal}
          inflationCost={inflationCost} finalProjectedCredit={finalProjectedCredit}
          currentDisplayCredit={currentDisplayCredit} chartData={chartData}
        />
      )}
    </div>
  );
};

export default Simulation;
