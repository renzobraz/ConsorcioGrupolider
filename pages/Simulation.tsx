
// Fix React import from named to default export
import React, { useState, useMemo, useEffect } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import ConsortiumFilterBar from '../components/ConsortiumFilterBar';
import { formatCurrency, formatNumber, formatPercent, formatDate, getTodayStr, safeParseNumber, generateUUID } from '../utils/formatters';
import { Pencil, Search, Gavel, TrendingUp, Calculator, X, Calendar, Building2, Filter, CheckCircle, Edit3, ShoppingBag, Plus, Trash2, Download, FileText, Printer, ArrowLeft, Settings, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentStatus, ManualTransactionType, CorrectionIndex, ProjectionConfig } from '../types';
import { calculateScheduleSummary, calculateAverageIndices } from '../services/calculationService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const Simulation = () => {
  const { 
    quotas, 
    currentQuota, 
    setCurrentQuota, 
    installments, 
    payments, 
    updateInstallmentPayment, 
    companies, 
    administrators, 
    indices, 
    globalFilters, 
    setGlobalFilters, 
    manualTransactions, 
    addManualTransaction, 
    updateManualTransaction, 
    deleteManualTransaction,
    projectionConfig,
    setProjectionConfig
  } = useConsortium();
  const navigate = useNavigate();
  
  // Sync with Global Filters
  useEffect(() => {
    if (globalFilters.quotaId && (!currentQuota || currentQuota.id !== globalFilters.quotaId)) {
      const quota = quotas.find(q => q.id === globalFilters.quotaId);
      if (quota) setCurrentQuota(quota);
    }
  }, [globalFilters.quotaId, quotas]);

  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isBidModal, setIsBidModal] = useState(false);
  const [isEmbeddedBidModal, setIsEmbeddedBidModal] = useState(false);
  const [isProjectionSettingsOpen, setIsProjectionSettingsOpen] = useState(false);

  // Manual Transaction Modal State
  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
  const [editingManualTxId, setEditingManualTxId] = useState<string | null>(null);
  const [manualTxFormData, setManualTxFormData] = useState({
    date: getTodayStr(),
    amount: '0',
    type: ManualTransactionType.EARNING,
    description: '',
    fc: '0',
    fr: '0',
    ta: '0',
    insurance: '0',
    amortization: '0',
    fine: '0',
    interest: '0'
  });

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    status: PaymentStatus.PREVISTO,
    paymentDate: '',
    amount: '0',
    fc: '0',
    fr: '0',
    ta: '0',
    insurance: '0',
    amortization: '0',
    fine: '0',
    interest: '0',
    manualEarnings: '0'
  });

  const openPaymentModal = (inst: any, isBid: boolean = false, isEmbedded: boolean = false) => {
    setSelectedInstallment(inst);
    setIsBidModal(isBid);
    setIsEmbeddedBidModal(isEmbedded);
    
    const toStr = (val: any) => {
      if (val === undefined || val === null) return '0';
      return val.toString().replace('.', ',');
    };

    if (isBid) {
      const bidPayment = isEmbedded ? (payments[-1] || {}) : (payments[0] || {});
      const amount = isEmbedded ? (inst.bidEmbeddedApplied || 0) : (inst.bidFreeApplied || 0);
      const fc = isEmbedded ? (inst.bidEmbeddedAbatementFC || 0) : (inst.bidFreeAbatementFC || 0);
      const fr = isEmbedded ? (inst.bidEmbeddedAbatementFR || 0) : (inst.bidFreeAbatementFR || 0);
      const ta = isEmbedded ? (inst.bidEmbeddedAbatementTA || 0) : (inst.bidFreeAbatementTA || 0);

      setPaymentFormData({
        status: PaymentStatus.PAGO,
        paymentDate: bidPayment.paymentDate ? bidPayment.paymentDate.split('T')[0] : (inst.bidDate ? inst.bidDate.split('T')[0] : getTodayStr()),
        amount: toStr(bidPayment.amount || amount),
        fc: toStr(bidPayment.manualFC || fc),
        fr: toStr(bidPayment.manualFR || fr),
        ta: toStr(bidPayment.manualTA || ta),
        insurance: toStr(bidPayment.manualInsurance || 0),
        amortization: toStr(bidPayment.manualAmortization || 0),
        fine: toStr(bidPayment.manualFine || 0),
        interest: toStr(bidPayment.manualInterest || 0),
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
        fine: toStr(inst.manualFine || 0),
        interest: toStr(inst.manualInterest || 0),
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
      // Allow only numbers, commas and dots
      const sanitizedValue = value.replace(/[^0-9,.]/g, '');
      
      setPaymentFormData(prev => {
        const newData = { ...prev, [name]: sanitizedValue };
        
        // Auto-calculate total amount if a component value changes
        if (name !== 'amount') {
          const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
          const total = parse(newData.fc) + parse(newData.fr) + parse(newData.ta) + 
                        parse(newData.insurance) + parse(newData.amortization) + 
                        parse(newData.fine) + parse(newData.interest);
          newData.amount = total.toFixed(2).replace('.', ',');
        }
        return newData;
      });
    }
  };

  const savePaymentModal = async () => {
    if (!selectedInstallment && !isBidModal) return;
    
    try {
      let installmentNumber = selectedInstallment?.installmentNumber;
      if (isBidModal) {
        installmentNumber = isEmbeddedBidModal ? -1 : 0;
      }
      const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
      
      await updateInstallmentPayment(installmentNumber, {
        status: paymentFormData.status,
        paymentDate: paymentFormData.paymentDate,
        amount: parse(paymentFormData.amount),
        fc: parse(paymentFormData.fc),
        fr: parse(paymentFormData.fr),
        ta: parse(paymentFormData.ta),
        insurance: parse(paymentFormData.insurance),
        amortization: parse(paymentFormData.amortization),
        fine: parse(paymentFormData.fine),
        interest: parse(paymentFormData.interest),
        manualEarnings: parse(paymentFormData.manualEarnings)
      });
      
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
      setIsBidModal(false);
    } catch (error: any) {
      console.error("Error saving payment:", error);
      alert(error.message || "Erro ao salvar pagamento. Verifique sua conexão ou as configurações do banco de dados.");
    }
  };

  const handleManualTxFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'type' || name === 'date' || name === 'description') {
      setManualTxFormData(prev => ({ ...prev, [name]: value }));
    } else {
      // Allow only numbers, commas and dots
      const sanitizedValue = value.replace(/[^0-9,.]/g, '');
      
      setManualTxFormData(prev => {
        const newData = { ...prev, [name]: sanitizedValue };
        
        if (name !== 'amount') {
          const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
          const total = parse(newData.fc) + parse(newData.fr) + parse(newData.ta) + 
                        parse(newData.insurance) + parse(newData.amortization) + 
                        parse(newData.fine) + parse(newData.interest);
          newData.amount = total.toFixed(2).replace('.', ',');
        }
        return newData;
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
        id: editingManualTxId || generateUUID(),
        quotaId: currentQuota.id,
        date: manualTxFormData.date,
        type: manualTxFormData.type,
        description: manualTxFormData.description,
        amount: parse(manualTxFormData.amount),
        fc: parse(manualTxFormData.fc),
        fr: parse(manualTxFormData.fr),
        ta: parse(manualTxFormData.ta),
        insurance: parse(manualTxFormData.insurance),
        amortization: parse(manualTxFormData.amortization),
        fine: parse(manualTxFormData.fine),
        interest: parse(manualTxFormData.interest)
      };

      if (editingManualTxId) {
        await updateManualTransaction(transaction);
      } else {
        await addManualTransaction(transaction);
      }
      
      setIsManualTxModalOpen(false);
      setEditingManualTxId(null);
      setManualTxFormData({
        date: getTodayStr(),
        amount: '0',
        type: ManualTransactionType.EARNING,
        description: '',
        fc: '0',
        fr: '0',
        ta: '0',
        insurance: '0',
        amortization: '0',
        fine: '0',
        interest: '0'
      });
    } catch (error: any) {
      console.error("Error saving manual transaction:", error);
      alert(error.message || "Erro ao salvar transação manual. Verifique sua conexão.");
    }
  };

  const handleEditManualTx = (txId: string) => {
    const tx = manualTransactions.find(t => t.id === txId);
    if (!tx) return;

    setManualTxFormData({
      date: tx.date,
      amount: (tx.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      type: tx.type,
      description: tx.description || '',
      fc: (tx.fc || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      fr: (tx.fr || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      ta: (tx.ta || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      insurance: (tx.insurance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      amortization: (tx.amortization || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      fine: (tx.fine || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      interest: (tx.interest || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    });
    setEditingManualTxId(txId);
    setIsManualTxModalOpen(true);
  };

  const exportToExcel = () => {
    if (!currentQuota || !installments.length) return;

    const rows: any[] = [];
    installments.forEach(inst => {
      // 1. Correction Row
      if (inst.correctionApplied) {
        rows.push({
          'P': 'CORR',
          'Vencimento': inst.correctionIndexName || 'REAJUSTE',
          'Crédito': inst.correctedCreditValue,
          'FC Mensal': inst.correctionAmountFC,
          '% FC': (inst.correctionFactor || 0) * 100,
          'TA Mensal': inst.correctionAmountTA,
          '% TA': (inst.correctionFactor || 0) * 100,
          'FR Mensal': inst.correctionAmountFR,
          '% FR': (inst.correctionFactor || 0) * 100,
          'Seguro': 0,
          'Amort.': 0,
          'Multa': 0,
          'Juros': 0,
          'Extra/Rend.': 0,
          'Lance Livre': 0,
          'Lance Emb.': 0,
          'Lance Total': 0,
          'Abat. FC': 0,
          'Abat. FR': 0,
          'Abat. TA': 0,
          'Data Lance': '',
          'Total': inst.correctionAmountTotal,
          'Vlr Pago': 0,
          'Data Pagto': '',
          'Status': 'AJUSTE',
          'Saldo FC': inst.correctionBalanceFC,
          '% Saldo FC': inst.correctionPercentBalanceFC,
          'Saldo TA': inst.correctionBalanceTA,
          '% Saldo TA': inst.correctionPercentBalanceTA,
          'Saldo FR': inst.correctionBalanceFR,
          '% Saldo FR': inst.correctionPercentBalanceFR,
          'Saldo Devedor': inst.correctionBalanceTotal,
          '% Saldo Total': inst.correctionPercentBalanceTotal
        });
      }

      // 2. Embedded Bid Row
      if ((inst.bidEmbeddedApplied || 0) > 0) {
        const bidPayment = payments[-1];
        rows.push({
          'P': 'LANCE',
          'Vencimento': 'EMBUTIDO',
          'Crédito': inst.correctedCreditValue,
          'FC Mensal': -inst.bidEmbeddedAbatementFC,
          '% FC': -inst.bidEmbeddedPercentFC,
          'TA Mensal': -inst.bidEmbeddedAbatementTA,
          '% TA': -inst.bidEmbeddedPercentTA,
          'FR Mensal': -inst.bidEmbeddedAbatementFR,
          '% FR': -inst.bidEmbeddedPercentFR,
          'Seguro': 0,
          'Amort.': 0,
          'Multa': 0,
          'Juros': 0,
          'Extra/Rend.': 0,
          'Lance Livre': 0,
          'Lance Emb.': inst.bidEmbeddedApplied,
          'Lance Total': inst.bidEmbeddedApplied,
          'Abat. FC': inst.bidEmbeddedAbatementFC,
          'Abat. FR': inst.bidEmbeddedAbatementFR,
          'Abat. TA': inst.bidEmbeddedAbatementTA,
          'Data Lance': formatDate(bidPayment?.paymentDate || inst.bidDate),
          'Total': -inst.bidEmbeddedApplied,
          'Vlr Pago': bidPayment?.status === 'PAGO' ? inst.bidEmbeddedApplied : 0,
          'Data Pagto': formatDate(bidPayment?.paymentDate),
          'Status': bidPayment?.status || 'LANCE',
          'Saldo FC': inst.bidEmbeddedBalanceFC,
          '% Saldo FC': inst.bidEmbeddedPercentBalanceFC,
          'Saldo TA': inst.bidEmbeddedBalanceTA,
          '% Saldo TA': inst.bidEmbeddedPercentBalanceTA,
          'Saldo FR': inst.bidEmbeddedBalanceFR,
          '% Saldo FR': inst.bidEmbeddedPercentBalanceFR,
          'Saldo Devedor': inst.bidEmbeddedBalanceTotal,
          '% Saldo Total': inst.bidEmbeddedPercentBalanceTotal
        });
      }

      // 3. Free Bid Row
      if ((inst.bidFreeApplied || 0) > 0) {
        const bidPayment = payments[0];
        rows.push({
          'P': 'LANCE',
          'Vencimento': 'LIVRE',
          'Crédito': inst.correctedCreditValue,
          'FC Mensal': -inst.bidFreeAbatementFC,
          '% FC': -inst.bidFreePercentFC,
          'TA Mensal': -inst.bidFreeAbatementTA,
          '% TA': -inst.bidFreePercentTA,
          'FR Mensal': -inst.bidFreeAbatementFR,
          '% FR': -inst.bidFreePercentFR,
          'Seguro': 0,
          'Amort.': 0,
          'Multa': 0,
          'Juros': 0,
          'Extra/Rend.': 0,
          'Lance Livre': inst.bidFreeApplied,
          'Lance Emb.': 0,
          'Lance Total': inst.bidFreeApplied,
          'Abat. FC': inst.bidFreeAbatementFC,
          'Abat. FR': inst.bidFreeAbatementFR,
          'Abat. TA': inst.bidFreeAbatementTA,
          'Data Lance': formatDate(bidPayment?.paymentDate || inst.bidDate),
          'Total': -inst.bidFreeApplied,
          'Vlr Pago': bidPayment?.status === 'PAGO' ? inst.bidFreeApplied : 0,
          'Data Pagto': formatDate(bidPayment?.paymentDate),
          'Status': bidPayment?.status || 'LANCE',
          'Saldo FC': inst.bidFreeBalanceFC,
          '% Saldo FC': inst.bidFreePercentBalanceFC,
          'Saldo TA': inst.bidFreeBalanceTA,
          '% Saldo TA': inst.bidFreePercentBalanceTA,
          'Saldo FR': inst.bidFreeBalanceFR,
          '% Saldo FR': inst.bidFreePercentBalanceFR,
          'Saldo Devedor': inst.bidFreeBalanceTotal,
          '% Saldo Total': inst.bidFreePercentBalanceTotal
        });
      }

      // 4. Regular Installment Row
      rows.push({
        'P': inst.installmentNumber === 0 ? '000' : inst.installmentNumber,
        'Vencimento': formatDate(inst.dueDate),
        'Crédito': inst.correctedCreditValue,
        'FC Mensal': inst.commonFund,
        '% FC': inst.monthlyRateFC,
        'TA Mensal': inst.adminFee,
        '% TA': inst.monthlyRateTA,
        'FR Mensal': inst.reserveFund,
        '% FR': inst.monthlyRateFR,
        'Seguro': inst.insurance,
        'Amort.': inst.amortization,
        'Multa': inst.manualFine || 0,
        'Juros': inst.manualInterest || 0,
        'Extra/Rend.': inst.manualEarnings || 0,
        'Lance Livre': 0,
        'Lance Emb.': 0,
        'Lance Total': 0,
        'Abat. FC': 0,
        'Abat. FR': 0,
        'Abat. TA': 0,
        'Data Lance': '',
        'Total': inst.totalInstallment,
        'Vlr Pago': inst.realAmountPaid || 0,
        'Data Pagto': formatDate(inst.paymentDate),
        'Status': inst.status,
        'Saldo FC': inst.balanceFC,
        '% Saldo FC': inst.percentBalanceFC,
        'Saldo TA': inst.balanceTA,
        '% Saldo TA': inst.percentBalanceTA,
        'Saldo FR': inst.balanceFR,
        '% Saldo FR': inst.percentBalanceFR,
        'Saldo Devedor': inst.balanceTotal,
        '% Saldo Total': inst.percentBalanceTotal
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    
    if (projectionConfig.enabled) {
      const note = `* VALORES PROJETADOS: Simulação com base em ${projectionConfig.customRate ? `taxa fixa de ${projectionConfig.customRate}% a.a.` : `média de ${projectionConfig.periodMonths} meses (${(currentAvgRate).toFixed(4)}% a.m.)`}.`;
      XLSX.utils.sheet_add_aoa(ws, [[""]], { origin: -1 });
      XLSX.utils.sheet_add_aoa(ws, [[note]], { origin: -1 });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    XLSX.writeFile(wb, `Extrato_${currentQuota.group}_${currentQuota.quotaNumber}.xlsx`);
  };

  const chartData = useMemo(() => {
    if (!installments || installments.length === 0) return [];
    return installments.map(inst => ({
      name: `P${inst.installmentNumber}`,
      valor: inst.totalInstallment,
      credito: inst.correctedCreditValue || inst.commonFund * (100 / (inst.monthlyRateFC || 1))
    }));
  }, [installments]);

  const avgRates = useMemo(() => {
    if (!indices || indices.length === 0) return {};
    return calculateAverageIndices(indices, projectionConfig.periodMonths);
  }, [indices, projectionConfig.periodMonths]);

  const currentAvgRate = useMemo(() => {
    if (!currentQuota) return 0;
    if (projectionConfig.customRate) {
      return (Math.pow(1 + (projectionConfig.customRate / 100), 1/12) - 1) * 100;
    }
    return avgRates[currentQuota.correctionIndex] || 0;
  }, [currentQuota, avgRates, projectionConfig.customRate]);

  const originalTotal = useMemo(() => {
    if (!currentQuota || !installments) return 0;
    // Calculate total without future projections
    // This is a bit tricky since generateSchedule is already using projectionConfig
    // We can estimate it by taking the last non-projected credit value
    const lastPaid = [...installments].reverse().find(inst => inst.isPaid);
    const baseCredit = lastPaid?.correctedCreditValue || currentQuota.creditValue;
    
    let total = 0;
    installments.forEach(inst => {
      if (inst.isPaid) {
        total += inst.totalInstallment;
      } else {
        // Estimate remaining installments based on current credit
        const fc = (baseCredit * (inst.monthlyRateFC || 0)) / 100;
        const fr = (baseCredit * (inst.monthlyRateFR || 0)) / 100;
        const ta = (baseCredit * (inst.monthlyRateTA || 0)) / 100;
        total += fc + fr + ta + (inst.insurance || 0) + (inst.amortization || 0);
      }
    });
    return total;
  }, [currentQuota, installments]);

  const finalProjectedCredit = useMemo(() => {
    if (!installments || installments.length === 0) return 0;
    return installments[installments.length - 1].correctedCreditValue || 0;
  }, [installments]);

  const detailedSummary = useMemo(() => {
    if (!currentQuota) return {
        paid: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0, percent: 0, bidFree: 0, bidEmbedded: 0, manualEarnings: 0 },
        toPay: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0, percent: 0, bidFree: 0, bidEmbedded: 0, manualEarnings: 0 },
        total: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, total: 0 },
        counts: { total: 0 }
    };

    const summary = calculateScheduleSummary(currentQuota, installments, payments);
    return {
      ...summary,
      counts: {
        total: installments.filter(i => !i.isPaid && i.installmentNumber > 0).length
      }
    };
  }, [currentQuota, installments, payments]);

  const projectedTotal = detailedSummary?.total?.total || 0;
  const inflationCost = projectedTotal - originalTotal;

  const exportToPDF = () => {
    if (!currentQuota || !installments.length) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    const title = `Extrato de Consórcio - Grupo: ${currentQuota.group} Cota: ${currentQuota.quotaNumber}`;
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Administradora: ${administrators.find(a => a.id === currentQuota.administratorId)?.name || 'N/A'}`, 14, 22);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 27);

    const tableColumn = [
      "P", "Vencimento", "Crédito", "FC", "TA", "FR", "Seguro", "Amort.", 
      "Multa", "Juros", "Extra", "L. Livre", "L. Emb", "Abat. FC", "Abat. FR", "Abat. TA", "Total", "Vlr Pago", "Data Pagto", "Status", 
      "Saldo FC", "Saldo TA", "Saldo FR", "Saldo Dev"
    ];
    const tableRows: any[] = [];
    installments.forEach(inst => {
      // 1. Correction Row
      if (inst.correctionApplied) {
        tableRows.push([
          "CORR",
          inst.correctionIndexName || "REAJUSTE",
          formatNumber(inst.correctedCreditValue),
          formatNumber(inst.correctionAmountFC),
          formatNumber(inst.correctionAmountTA),
          formatNumber(inst.correctionAmountFR),
          "-", "-", "-", "-", "-", "-", "-", "-", "-", "-",
          formatNumber(inst.correctionAmountTotal),
          "-", "-", "AJUSTE",
          formatNumber(inst.correctionBalanceFC),
          formatNumber(inst.correctionBalanceTA),
          formatNumber(inst.correctionBalanceFR),
          formatNumber(inst.correctionBalanceTotal)
        ]);
      }

      // 2. Embedded Bid Row
      if ((inst.bidEmbeddedApplied || 0) > 0) {
        const bidPayment = payments[-1];
        tableRows.push([
          "LANCE",
          "EMBUTIDO",
          formatNumber(inst.correctedCreditValue),
          `(${formatNumber(inst.bidEmbeddedAbatementFC)})`,
          `(${formatNumber(inst.bidEmbeddedAbatementTA)})`,
          `(${formatNumber(inst.bidEmbeddedAbatementFR)})`,
          "-", "-", "-", "-", "-", "-",
          formatNumber(inst.bidEmbeddedApplied),
          formatNumber(inst.bidEmbeddedAbatementFC),
          formatNumber(inst.bidEmbeddedAbatementFR),
          formatNumber(inst.bidEmbeddedAbatementTA),
          `(${formatNumber(inst.bidEmbeddedApplied)})`,
          bidPayment?.status === 'PAGO' ? formatNumber(inst.bidEmbeddedApplied) : "-",
          formatDate(bidPayment?.paymentDate),
          bidPayment?.status || "LANCE",
          formatNumber(inst.bidEmbeddedBalanceFC),
          formatNumber(inst.bidEmbeddedBalanceTA),
          formatNumber(inst.bidEmbeddedBalanceFR),
          formatNumber(inst.bidEmbeddedBalanceTotal)
        ]);
      }

      // 3. Free Bid Row
      if ((inst.bidFreeApplied || 0) > 0) {
        const bidPayment = payments[0];
        tableRows.push([
          "LANCE",
          "LIVRE",
          formatNumber(inst.correctedCreditValue),
          `(${formatNumber(inst.bidFreeAbatementFC)})`,
          `(${formatNumber(inst.bidFreeAbatementTA)})`,
          `(${formatNumber(inst.bidFreeAbatementFR)})`,
          "-", "-", "-", "-", "-",
          formatNumber(inst.bidFreeApplied),
          "-",
          formatNumber(inst.bidFreeAbatementFC),
          formatNumber(inst.bidFreeAbatementFR),
          formatNumber(inst.bidFreeAbatementTA),
          `(${formatNumber(inst.bidFreeApplied)})`,
          bidPayment?.status === 'PAGO' ? formatNumber(inst.bidFreeApplied) : "-",
          formatDate(bidPayment?.paymentDate),
          bidPayment?.status || "LANCE",
          formatNumber(inst.bidFreeBalanceFC),
          formatNumber(inst.bidFreeBalanceTA),
          formatNumber(inst.bidFreeBalanceFR),
          formatNumber(inst.bidFreeBalanceTotal)
        ]);
      }

      // 4. Regular Installment Row
      tableRows.push([
        inst.installmentNumber === 0 ? "000" : inst.installmentNumber,
        formatDate(inst.dueDate),
        formatNumber(inst.correctedCreditValue),
        formatNumber(inst.commonFund),
        formatNumber(inst.adminFee),
        formatNumber(inst.reserveFund),
        formatNumber(inst.insurance),
        formatNumber(inst.amortization),
        formatNumber(inst.manualFine || 0),
        formatNumber(inst.manualInterest || 0),
        formatNumber(inst.manualEarnings || 0),
        "-", "-", "-", "-", "-",
        formatNumber(inst.totalInstallment),
        formatNumber(inst.realAmountPaid || 0),
        formatDate(inst.paymentDate),
        inst.status,
        formatNumber(inst.balanceFC),
        formatNumber(inst.balanceTA),
        formatNumber(inst.balanceFR),
        formatNumber(inst.balanceTotal)
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 4.5, cellPadding: 0.3 },
      headStyles: { fillColor: [16, 185, 129] },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 15 },
        17: { cellWidth: 12 }
      }
    });

    if (projectionConfig.enabled) {
      const note = `* VALORES PROJETADOS: Simulação com base em ${projectionConfig.customRate ? `taxa fixa de ${projectionConfig.customRate}% a.a.` : `média de ${projectionConfig.periodMonths} meses (${(currentAvgRate).toFixed(4)}% a.m.)`}.`;
      autoTable(doc, {
        body: [[note]],
        startY: (doc as any).lastAutoTable.finalY + 5,
        theme: 'plain',
        styles: { fontSize: 6, textColor: [180, 83, 9], fontStyle: 'bold' }
      });
    }

    doc.save(`Extrato_${currentQuota.group}_${currentQuota.quotaNumber}.pdf`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDeleteManualTx = async (txId: string) => {
    if (!window.confirm("Tem certeza que deseja excluir esta transação manual? Esta ação não pode ser desfeita.")) {
      return;
    }
    try {
      await deleteManualTransaction(txId);
    } catch (error: any) {
      console.error("Error deleting manual transaction:", error);
      alert(error.message || "Erro ao excluir transação manual. Verifique sua conexão.");
    }
  };

  const todayStr = getTodayStr();

  const currentDisplayCredit = useMemo(() => {
    if (!currentQuota) return 0;
    if (installments.length === 0) return currentQuota.creditValue;

    const pastOrPresent = installments.filter(i => {
      if (!i.dueDate) return false;
      return i.dueDate.split('T')[0] <= todayStr;
    });

    if (pastOrPresent.length > 0) {
      const lastPast = pastOrPresent[pastOrPresent.length - 1];
      return lastPast.correctedCreditValue || currentQuota.creditValue;
    }

    return installments[0].correctedCreditValue || currentQuota.creditValue;
  }, [currentQuota, installments, todayStr]);

  const quotaStatus = useMemo(() => {
    if (!currentQuota) return '';
    // SE Data_Adesao estiver preenchida E Data_1a_Assembleia for nula (ou data futura): Status = "Pré-Grupo"
    // SE Data_1a_Assembleia for menor ou igual à data atual: Status = "Grupo Ativo"
    if (!currentQuota.firstAssemblyDate) return 'Pré-Grupo';
    
    const firstAssembly = new Date(currentQuota.firstAssemblyDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    firstAssembly.setHours(0, 0, 0, 0);
    
    return today < firstAssembly ? 'Pré-Grupo' : 'Grupo Ativo';
  }, [currentQuota]);

  const footerTotals = useMemo(() => {
    const totals = installments.reduce((acc, inst) => {
        const bFC = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidFreeAbatementFC || 0);
        const bTA = (inst.bidEmbeddedAbatementTA || 0) + (inst.bidFreeAbatementTA || 0);
        const bFR = (inst.bidEmbeddedAbatementFR || 0) + (inst.bidFreeAbatementFR || 0);
        
        const bFCP = (inst.bidEmbeddedPercentFC || 0) + (inst.bidFreePercentFC || 0);
        const bTAP = (inst.bidEmbeddedPercentTA || 0) + (inst.bidFreePercentTA || 0);
        const bFRP = (inst.bidEmbeddedPercentFR || 0) + (inst.bidFreePercentFR || 0);

        // Manual contribution to FC (either from a manual transaction or a manual earning override)
        const manualFCContribution = (inst.manualEarnings || 0);
        const manualFCPct = (manualFCContribution / (inst.correctedCreditValue || currentDisplayCredit || 1)) * 100;

        const totalLineValue = inst.isManualTransaction ? inst.realAmountPaid : (inst.totalInstallment + bFC + bTA + bFR + (inst.manualEarnings || 0));

        return {
            fc: acc.fc + inst.commonFund + bFC + manualFCContribution,
            fcPct: acc.fcPct + (inst.monthlyRateFC || 0) + bFCP,
            ta: acc.ta + inst.adminFee + bTA,
            taPct: acc.taPct + (inst.monthlyRateTA || 0) + bTAP,
            fr: acc.fr + inst.reserveFund + bFR,
            frPct: acc.frPct + (inst.monthlyRateFR || 0) + bFRP,
            insurance: acc.insurance + (inst.insurance || 0),
            amortization: acc.amortization + (inst.amortization || 0),
            fine: acc.fine + (inst.manualFine || 0),
            interest: acc.interest + (inst.manualInterest || 0),
            manualEarnings: acc.manualEarnings + (inst.manualEarnings || 0),
            total: acc.total + totalLineValue,
            paidTotal: acc.paidTotal + (inst.isPaid ? (inst.realAmountPaid || 0) : 0)
        };
    }, { fc: 0, fcPct: 0, ta: 0, taPct: 0, fr: 0, frPct: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, manualEarnings: 0, total: 0, paidTotal: 0 });

    return {
        ...totals,
        totalPct: totals.fcPct + totals.taPct + totals.frPct,
        paidTotalPct: currentDisplayCredit > 0 ? (totals.paidTotal / currentDisplayCredit) * 100 : 0
    };
  }, [installments, currentDisplayCredit]);

  const handleEditClick = (id: number, field: string, value: number) => {
    setEditingCell({ id, field });
    setEditValue(value.toFixed(2).replace('.', ','));
  };

  const handleSaveEdit = (installmentNum: number) => {
    if (!editingCell) return;
    const val = safeParseNumber(editValue);
    if (!isNaN(val)) {
        const update: any = {};
        if (editingCell.field === 'fc') update.fc = val;
        else if (editingCell.field === 'fr') update.fr = val;
        else if (editingCell.field === 'ta') update.ta = val;
        else if (editingCell.field === 'fine') update.fine = val;
        else if (editingCell.field === 'interest') update.interest = val;
        else if (editingCell.field === 'insurance') update.insurance = val;
        else if (editingCell.field === 'amortization') update.amortization = val;
        updateInstallmentPayment(installmentNum, update);
    }
    setEditingCell(null);
  };

  const renderEditableCell = (inst: any, field: string, value: number, isManual: boolean, rate?: number) => {
    const isEditing = editingCell?.id === inst.installmentNumber && editingCell?.field === field;
    if (isEditing) return (<td className="p-2 text-right"><input autoFocus type="text" className="w-full p-1 border border-blue-400 rounded text-right text-xs" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(inst.installmentNumber); if (e.key === 'Escape') setEditingCell(null); }} onBlur={() => handleSaveEdit(inst.installmentNumber)} /></td>);
    return (<td className={`p-2 text-right text-xs cursor-pointer hover:bg-slate-50 ${isManual ? 'text-blue-600 font-bold' : ''}`} onClick={() => handleEditClick(inst.installmentNumber, field, value)}><div className="flex flex-col items-end"><span>{formatNumber(value)}</span><span className="text-[9px] text-slate-400">{rate ? rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%' : ''}</span></div></td>);
  };

  return (
    <div className="space-y-6">
      <ConsortiumFilterBar showQuotaFilter={true} />

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedInstallment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle className="text-emerald-600" size={20} />
                {isBidModal ? 'Efetivar Lance Livre' : `Efetivar Parcela ${selectedInstallment.installmentNumber}`}
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Status & Date */}
                <div className="space-y-4 md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Status do Pagamento</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                        <select
                          name="status"
                          value={paymentFormData.status}
                          onChange={handlePaymentFormChange}
                          className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        >
                          <option value={PaymentStatus.PREVISTO}>Previsto</option>
                          <option value={PaymentStatus.PAGO}>Pago</option>
                          <option value={PaymentStatus.CONCILIADO}>Conciliado</option>
                          <option value={PaymentStatus.EFETIVADO}>Efetivado</option>
                          <option value={PaymentStatus.QUITADO}>Quitado</option>
                        </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Data do Pagamento</label>
                      <input
                        type="date"
                        name="paymentDate"
                        value={paymentFormData.paymentDate}
                        onChange={handlePaymentFormChange}
                        className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Principais</h4>
                  
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fundo Comum (FC)</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="fc"
                          value={paymentFormData.fc}
                          onChange={handlePaymentFormChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Taxa de Administração (TA)</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="ta"
                          value={paymentFormData.ta}
                          onChange={handlePaymentFormChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fundo de Reserva (FR)</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="fr"
                          value={paymentFormData.fr}
                          onChange={handlePaymentFormChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                </div>

                {/* Additional Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Adicionais</h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Seguro</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="insurance"
                        value={paymentFormData.insurance}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amortização</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="amortization"
                        value={paymentFormData.amortization}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Multa</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="fine"
                          value={paymentFormData.fine}
                          onChange={handlePaymentFormChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Juros</label>
                      <div className="relative">
                        <input
                          type="text"
                          name="interest"
                          value={paymentFormData.interest}
                          onChange={handlePaymentFormChange}
                          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                    <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rendimentos Manuais (Abate Saldo FC)</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="manualEarnings"
                        value={paymentFormData.manualEarnings}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">Valor Total Pago</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="amount"
                        value={paymentFormData.amount}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border-2 border-emerald-200 bg-emerald-50 rounded-md text-emerald-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={savePaymentModal}
                className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Salvar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Transaction Modal */}
      {isManualTxModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {editingManualTxId ? <Edit3 className="text-blue-600" size={20} /> : <Plus className="text-blue-600" size={20} />}
                {editingManualTxId ? 'Editar Transação Manual' : 'Nova Transação Manual'}
              </h3>
              <button onClick={() => { setIsManualTxModalOpen(false); setEditingManualTxId(null); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
                  <input
                    type="date"
                    name="date"
                    value={manualTxFormData.date}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                  <select
                    name="type"
                    value={manualTxFormData.type}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={ManualTransactionType.EARNING}>Rendimento</option>
                    <option value={ManualTransactionType.EXTRA_PAYMENT}>Aporte Extra</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
                <input
                  type="text"
                  name="description"
                  placeholder="Ex: Rendimento mensal, Aporte FGTS..."
                  value={manualTxFormData.description}
                  onChange={handleManualTxFormChange}
                  className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fundo Comum (FC)</label>
                  <input
                    type="text"
                    name="fc"
                    value={manualTxFormData.fc}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fundo Reserva (FR)</label>
                  <input
                    type="text"
                    name="fr"
                    value={manualTxFormData.fr}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Taxa Adm (TA)</label>
                  <input
                    type="text"
                    name="ta"
                    value={manualTxFormData.ta}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Seguro</label>
                  <input
                    type="text"
                    name="insurance"
                    value={manualTxFormData.insurance}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Amortização</label>
                  <input
                    type="text"
                    name="amortization"
                    value={manualTxFormData.amortization}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Multa</label>
                  <input
                    type="text"
                    name="fine"
                    value={manualTxFormData.fine}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Juros</label>
                  <input
                    type="text"
                    name="interest"
                    value={manualTxFormData.interest}
                    onChange={handleManualTxFormChange}
                    className="w-full p-2 border border-slate-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 font-bold">Total Pago</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="amount"
                      value={manualTxFormData.amount}
                      onChange={handleManualTxFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => { setIsManualTxModalOpen(false); setEditingManualTxId(null); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualTxSubmit}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                {editingManualTxId ? <Edit3 size={16} /> : <Plus size={16} />}
                {editingManualTxId ? 'Salvar Alterações' : 'Adicionar Transação'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                  projectionConfig.enabled 
                    ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' 
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Simular correções futuras"
              >
                <TrendingUp size={14} className={projectionConfig.enabled ? 'animate-pulse' : ''} />
                {projectionConfig.enabled ? 'Projeção Ativa' : 'Simular Futuro'}
              </button>
              
              <button
                onClick={() => setIsProjectionSettingsOpen(!isProjectionSettingsOpen)}
                className={`p-1.5 rounded-md border transition-all ${
                  isProjectionSettingsOpen ? 'bg-white border-blue-300 text-blue-600 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
                title="Configurar Projeção"
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
                      <select 
                        value={projectionConfig.periodMonths}
                        onChange={(e) => setProjectionConfig({ ...projectionConfig, periodMonths: Number(e.target.value), customRate: undefined })}
                        className="w-full text-xs border border-slate-200 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value={12}>Últimos 12 meses</option>
                        <option value={24}>Últimos 24 meses</option>
                        <option value={36}>Últimos 36 meses (3 anos)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1 ml-0.5">Taxa Anual Fixa (%)</label>
                      <div className="flex gap-2">
                        <input 
                          type="number"
                          step="0.1"
                          placeholder="Ex: 5.0"
                          value={projectionConfig.customRate || ''}
                          onChange={(e) => setProjectionConfig({ ...projectionConfig, customRate: e.target.value ? Number(e.target.value) : undefined })}
                          className="flex-1 text-xs border border-slate-200 rounded-md p-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                        />
                        {projectionConfig.customRate && (
                          <button 
                            onClick={() => setProjectionConfig({ ...projectionConfig, customRate: undefined })}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-md"
                          >
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

          {currentQuota && (
            <div className="h-6 w-px bg-slate-200 mx-1 hidden md:block"></div>
          )}

          {currentQuota && (
            <div className="flex items-center gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-lg">
              <button 
                onClick={() => {
                  setManualTxFormData({
                    date: getTodayStr(),
                    amount: '0',
                    type: ManualTransactionType.EARNING,
                    description: '',
                    fc: '0',
                    fr: '0',
                    ta: '0',
                    insurance: '0',
                    amortization: '0',
                    fine: '0',
                    interest: '0'
                  });
                  setIsManualTxModalOpen(true);
                }} 
                className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md border border-emerald-200 text-xs font-bold flex items-center gap-2 transition-all"
              >
                <Plus size={14} /> Transação Manual
              </button>

              <div className="flex items-center gap-1 border-l border-slate-200 ml-1 pl-1">
                <button 
                  onClick={exportToExcel}
                  className="p-1.5 text-slate-500 hover:bg-white hover:text-emerald-600 rounded-md transition-all"
                  title="Exportar Excel"
                >
                  <Download size={16} />
                </button>
                <button 
                  onClick={exportToPDF}
                  className="p-1.5 text-slate-500 hover:bg-white hover:text-red-600 rounded-md transition-all"
                  title="Exportar PDF"
                >
                  <FileText size={16} />
                </button>
                <button 
                  onClick={handlePrint}
                  className="p-1.5 text-slate-500 hover:bg-white hover:text-blue-600 rounded-md transition-all"
                  title="Imprimir"
                >
                  <Printer size={16} />
                </button>
              </div>
            </div>
          )}

          {currentQuota && (
            <button 
              onClick={() => navigate(`/edit/${currentQuota.id}`)} 
              className="px-3 py-2 bg-white text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              <Pencil size={14} /> Editar Cota
            </button>
          )}
        </div>
      </div>

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
                <span>Data de Contemplação: <strong>{formatDate(currentQuota.contemplationDate)}</strong></span>
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
                         <td className="p-2 text-center text-blue-600 sticky left-0 bg-blue-50 z-10"><TrendingUp size={12} className="mx-auto"/></td>
                         <td colSpan={11} className="p-2 text-blue-800 text-[10px] font-bold uppercase tracking-wide">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                CORREÇÃO {inst.correctionIndexName}: {formatPercent((inst.correctionFactor || 0) * 100)} 
                                {inst.correctionCapApplied && (
                                    <span className="text-red-600 font-bold">
                                        (TETO APLICADO. ÍNDICE REAL: {formatPercent(inst.correctionRealRate || 0)})
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
                      {inst.bidEmbeddedApplied! > 0 && (
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
                                <button 
                                    onClick={() => openPaymentModal(inst, true, true)}
                                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[-1]?.status || '') ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-amber-700 bg-amber-100 hover:bg-amber-200'}`}
                                    title="Efetivar Lance"
                                >
                                    {['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[-1]?.status || '') ? <Edit3 size={12} /> : <CheckCircle size={12} />}
                                    {['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[-1]?.status || '') ? 'Editar' : 'Efetivar'}
                                </button>
                            </td>
                        </tr>
                      )}
                      {inst.bidFreeApplied! > 0 && (
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
                                <button 
                                    onClick={() => openPaymentModal(inst, true, false)}
                                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[0]?.status || '') ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-orange-700 bg-orange-100 hover:bg-orange-200'}`}
                                    title="Efetivar Lance"
                                >
                                    {['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[0]?.status || '') ? <Edit3 size={12} /> : <CheckCircle size={12} />}
                                    {['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes(payments[0]?.status || '') ? 'Editar' : 'Efetivar'}
                                </button>
                            </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}
                  <tr className={`hover:bg-slate-50 transition-colors ${inst.isPaid ? 'bg-emerald-50/30' : ''}`}>
                    <td className="p-2 text-center font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100">
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
                        <span>{formatNumber((inst.isManualTransaction ? (inst.totalInstallment || 0) : (inst.totalInstallment || 0)) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0))}</span>
                        <span className="text-[8px] text-slate-400">
                          {((((inst.isManualTransaction ? (inst.totalInstallment || 0) : (inst.totalInstallment || 0)) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0)) / (inst.correctedCreditValue || 1)) * 100).toFixed(4)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-right border-l border-slate-100"><span>{formatNumber(inst.balanceFC)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFC.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatNumber(inst.balanceTA)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceTA.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatNumber(inst.balanceFR)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFR.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200"><span>{formatNumber(inst.balanceTotal)}</span><br/><span className="text-[9px] text-slate-500 font-black">{inst.percentBalanceTotal.toFixed(4)}%</span></td>
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
                          <button 
                            onClick={() => handleEditManualTx(inst.manualTransactionId || '')}
                            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full text-blue-700 bg-blue-50 hover:bg-blue-100"
                            title="Editar Transação"
                          >
                            <Edit3 size={12} /> Editar
                          </button>
                          <button 
                            onClick={() => handleDeleteManualTx(inst.manualTransactionId || '')}
                            className="flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full text-red-700 bg-red-50 hover:bg-red-100"
                            title="Excluir Transação"
                          >
                            <Trash2 size={12} /> Excluir
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => openPaymentModal(inst)}
                          className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${inst.isPaid ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                          title={inst.isPaid ? 'Editar Pagamento' : 'Efetivar Parcela'}
                        >
                          {inst.isPaid ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                        </button>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>
                ); })}
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
      )}

      {currentQuota && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print:border-none relative">
                {projectionConfig.enabled && (
                  <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 px-4 py-1 text-[10px] text-amber-700 font-bold flex items-center justify-center gap-2">
                    <TrendingUp size={12} />
                    VALORES PROJETADOS: Simulação com base em {projectionConfig.customRate ? `taxa fixa de ${projectionConfig.customRate}% a.a.` : `média de ${projectionConfig.periodMonths} meses (${(currentAvgRate).toFixed(4)}% a.m.)`}.
                  </div>
                )}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo Pago (Histórico)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.fc || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.paid?.fc || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.ta || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.paid?.ta || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.fr || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.paid?.fr || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.insurance || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.amortization || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Multa:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.fine || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Juros:</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.interest || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL PAGO</span> <div className="flex gap-12"><span>{(detailedSummary?.paid?.total || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{((detailedSummary?.paid?.total || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>

                    {projectionConfig.enabled && (
                      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
                          <Calculator size={12} /> Impacto da Projeção
                        </h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Total s/ Projeção:</span>
                            <span className="font-medium">{formatCurrency(originalTotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Total c/ Projeção:</span>
                            <span className="font-medium">{formatCurrency(projectedTotal)}</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-200 text-amber-700 font-bold">
                            <span>Custo da Inflação:</span>
                            <span>{formatCurrency(inflationCost)}</span>
                          </div>
                        </div>
                        <div className="pt-2 flex justify-between items-center text-[10px]">
                          <span className="text-slate-500">Crédito Final Est.:</span>
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{formatCurrency(finalProjectedCredit)}</span>
                        </div>
                      </div>
                    )}
                </div>
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo a Pagar (Saldo)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.fc || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.toPay?.fc || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.ta || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.toPay?.ta || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.fr || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{((detailedSummary?.toPay?.fr || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.insurance || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.amortization || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Multa:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.fine || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Juros:</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.interest || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL A VENCER</span> <div className="flex gap-12"><span>{(detailedSummary?.toPay?.total || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{((detailedSummary?.toPay?.total || 0) / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-300 flex justify-between text-xs font-black">
                        <span>Qtde Parcelas Restantes:</span>
                        <span className="text-sm">{(detailedSummary?.counts?.total ?? 0).toFixed(2).replace('.', ',')}</span>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                        <TrendingUp size={12} /> Evolução das Parcelas
                      </h4>
                      <div className="h-32 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis 
                              dataKey="name" 
                              hide 
                            />
                            <YAxis 
                              hide 
                              domain={['auto', 'auto']}
                            />
                            <Tooltip 
                              contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                              formatter={(value: number) => [formatCurrency(value), 'Parcela']}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="valor" 
                              stroke="#3b82f6" 
                              fillOpacity={1} 
                              fill="url(#colorVal)" 
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                </div>
          </div>
      )}
    </div>
  );
};

export default Simulation;
