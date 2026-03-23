
// Fix React import from named to default export
import React, { useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatPercent, formatDate, getTodayStr } from '../utils/formatters';
import { Pencil, Search, Gavel, TrendingUp, Calculator, X, Calendar, Building2, Filter, CheckCircle, Edit3, ShoppingBag, Plus, Trash2, Download, FileText, Printer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentStatus, ManualTransactionType } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Simulation = () => {
  const { quotas, currentQuota, setCurrentQuota, installments, payments, updateInstallmentPayment, companies, administrators, indices, globalFilters, setGlobalFilters, addManualTransaction, deleteManualTransaction } = useConsortium();
  const navigate = useNavigate();
  
  const [searchText, setSearchText] = useState('');
  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isBidModal, setIsBidModal] = useState(false);

  // Manual Transaction Modal State
  const [isManualTxModalOpen, setIsManualTxModalOpen] = useState(false);
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

  const openPaymentModal = (inst: any, isBid: boolean = false) => {
    setSelectedInstallment(inst);
    setIsBidModal(isBid);
    
    const toStr = (val: any) => {
      if (val === undefined || val === null) return '0';
      return val.toString().replace('.', ',');
    };

    if (isBid) {
      const bidPayment = payments[0] || {};
      setPaymentFormData({
        status: bidPayment.status || PaymentStatus.PAGO,
        paymentDate: bidPayment.paymentDate ? bidPayment.paymentDate.split('T')[0] : (inst.bidDate ? inst.bidDate.split('T')[0] : getTodayStr()),
        amount: toStr(bidPayment.amount || (inst.bidFreeApplied || 0)),
        fc: toStr(bidPayment.manualFC || (inst.bidFreeAbatementFC || 0)),
        fr: toStr(bidPayment.manualFR || (inst.bidFreeAbatementFR || 0)),
        ta: toStr(bidPayment.manualTA || (inst.bidFreeAbatementTA || 0)),
        insurance: toStr(bidPayment.manualInsurance || 0),
        amortization: toStr(bidPayment.manualAmortization || 0),
        fine: toStr(bidPayment.manualFine || 0),
        interest: toStr(bidPayment.manualInterest || 0),
        manualEarnings: toStr(bidPayment.manualEarnings || 0)
      });
    } else {
      setPaymentFormData({
        status: inst.status || PaymentStatus.PAGO,
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
      const installmentNumber = isBidModal ? 0 : selectedInstallment.installmentNumber;
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
    } catch (error) {
      console.error("Error saving payment:", error);
      // Optionally show an error message to the user here
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
      const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
      
      await addManualTransaction({
        id: crypto.randomUUID(),
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
      });
      
      setIsManualTxModalOpen(false);
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
      console.error("Error adding manual transaction:", error);
      alert(error.message || "Erro ao adicionar transação manual. Verifique sua conexão.");
    }
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
          'Data Lance': formatDate(inst.bidDate),
          'Total': -inst.bidEmbeddedApplied,
          'Vlr Pago': 0,
          'Data Pagto': '',
          'Status': 'LANCE',
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
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    XLSX.writeFile(wb, `Extrato_${currentQuota.group}_${currentQuota.quotaNumber}.xlsx`);
  };

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
      "Multa", "Juros", "Extra", "L. Livre", "L. Emb", "Abat. FC", "Total", "Vlr Pago", "Data Pagto", "Status", 
      "Saldo FC", "Saldo TA", "Saldo FR", "Saldo Dev"
    ];
    const tableRows: any[] = [];
    installments.forEach(inst => {
      // 1. Correction Row
      if (inst.correctionApplied) {
        tableRows.push([
          "CORR",
          inst.correctionIndexName || "REAJUSTE",
          formatCurrency(inst.correctedCreditValue),
          formatCurrency(inst.correctionAmountFC),
          formatCurrency(inst.correctionAmountTA),
          formatCurrency(inst.correctionAmountFR),
          "-", "-", "-", "-", "-", "-", "-", "-",
          formatCurrency(inst.correctionAmountTotal),
          "-", "-", "AJUSTE",
          formatCurrency(inst.correctionBalanceFC),
          formatCurrency(inst.correctionBalanceTA),
          formatCurrency(inst.correctionBalanceFR),
          formatCurrency(inst.correctionBalanceTotal)
        ]);
      }

      // 2. Embedded Bid Row
      if ((inst.bidEmbeddedApplied || 0) > 0) {
        tableRows.push([
          "LANCE",
          "EMBUTIDO",
          formatCurrency(inst.correctedCreditValue),
          `(${formatCurrency(inst.bidEmbeddedAbatementFC)})`,
          `(${formatCurrency(inst.bidEmbeddedAbatementTA)})`,
          `(${formatCurrency(inst.bidEmbeddedAbatementFR)})`,
          "-", "-", "-", "-", "-", "-",
          formatCurrency(inst.bidEmbeddedApplied),
          formatCurrency(inst.bidEmbeddedAbatementFC),
          `(${formatCurrency(inst.bidEmbeddedApplied)})`,
          "-", "-", "LANCE",
          formatCurrency(inst.bidEmbeddedBalanceFC),
          formatCurrency(inst.bidEmbeddedBalanceTA),
          formatCurrency(inst.bidEmbeddedBalanceFR),
          formatCurrency(inst.bidEmbeddedBalanceTotal)
        ]);
      }

      // 3. Free Bid Row
      if ((inst.bidFreeApplied || 0) > 0) {
        const bidPayment = payments[0];
        tableRows.push([
          "LANCE",
          "LIVRE",
          formatCurrency(inst.correctedCreditValue),
          `(${formatCurrency(inst.bidFreeAbatementFC)})`,
          `(${formatCurrency(inst.bidFreeAbatementTA)})`,
          `(${formatCurrency(inst.bidFreeAbatementFR)})`,
          "-", "-", "-", "-", "-",
          formatCurrency(inst.bidFreeApplied),
          "-",
          formatCurrency(inst.bidFreeAbatementFC),
          `(${formatCurrency(inst.bidFreeApplied)})`,
          bidPayment?.status === 'PAGO' ? formatCurrency(inst.bidFreeApplied) : "-",
          formatDate(bidPayment?.paymentDate || inst.bidDate),
          bidPayment?.status || "LANCE",
          formatCurrency(inst.bidFreeBalanceFC),
          formatCurrency(inst.bidFreeBalanceTA),
          formatCurrency(inst.bidFreeBalanceFR),
          formatCurrency(inst.bidFreeBalanceTotal)
        ]);
      }

      // 4. Regular Installment Row
      tableRows.push([
        inst.installmentNumber === 0 ? "000" : inst.installmentNumber,
        formatDate(inst.dueDate),
        formatCurrency(inst.correctedCreditValue),
        formatCurrency(inst.commonFund),
        formatCurrency(inst.adminFee),
        formatCurrency(inst.reserveFund),
        formatCurrency(inst.insurance),
        formatCurrency(inst.amortization),
        formatCurrency(inst.manualFine || 0),
        formatCurrency(inst.manualInterest || 0),
        formatCurrency(inst.manualEarnings || 0),
        "-", "-", "-",
        formatCurrency(inst.totalInstallment),
        formatCurrency(inst.realAmountPaid || 0),
        formatDate(inst.paymentDate),
        inst.status,
        formatCurrency(inst.balanceFC),
        formatCurrency(inst.balanceTA),
        formatCurrency(inst.balanceFR),
        formatCurrency(inst.balanceTotal)
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

  const filteredOptions = useMemo(() => {
    return quotas.filter(q => {
      const textMatch = (q.group || '').toLowerCase().includes(searchText.toLowerCase()) || (q.quotaNumber || '').toLowerCase().includes(searchText.toLowerCase());
      const companyMatch = globalFilters.companyId ? q.companyId === globalFilters.companyId : true;
      const adminMatch = globalFilters.administratorId ? q.administratorId === globalFilters.administratorId : true;
      const productMatch = globalFilters.productType ? q.productType === globalFilters.productType : true;
      let statusMatch = true;
      if (globalFilters.status === 'ACTIVE') statusMatch = !q.isContemplated;
      if (globalFilters.status === 'CONTEMPLATED') statusMatch = q.isContemplated;
      return textMatch && companyMatch && adminMatch && productMatch && statusMatch;
    });
  }, [quotas, searchText, globalFilters]);

  const todayStr = getTodayStr();

  const currentDisplayCredit = useMemo(() => {
    if (currentQuota && installments.length > 0) {
        const pastOrPresent = installments.filter(i => i.dueDate.split('T')[0] <= todayStr);
        return pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || currentQuota.creditValue : installments[0].correctedCreditValue || currentQuota.creditValue;
    }
    return currentQuota?.creditValue || 0;
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

  const detailedSummary = useMemo(() => {
    const stats = {
        paid: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
        toPay: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
        counts: { total: 0 }
    };
    if (!currentQuota) return stats;

    installments.forEach(inst => {
        if (inst.isPaid) {
            stats.paid.fc += inst.commonFund + (inst.manualEarnings || 0);
            stats.paid.fr += inst.reserveFund; 
            stats.paid.ta += inst.adminFee;
            stats.paid.insurance += (inst.insurance || 0); 
            stats.paid.amortization += (inst.amortization || 0);
            stats.paid.fine += (inst.manualFine || 0); 
            stats.paid.interest += (inst.manualInterest || 0);
        } else {
            stats.toPay.fc += inst.commonFund; 
            stats.toPay.fr += inst.reserveFund; 
            stats.toPay.ta += inst.adminFee;
            stats.toPay.insurance += (inst.insurance || 0); 
            stats.toPay.amortization += (inst.amortization || 0);
            stats.counts.total++;
        }
        if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
            const isBidPaid = payments[0]?.status === 'PAGO';
            if (isBidPaid) {
                stats.paid.fc += (inst.bidAbatementFC || 0); 
                stats.paid.fr += (inst.bidAbatementFR || 0); 
                stats.paid.ta += (inst.bidAbatementTA || 0);
            } else {
                stats.toPay.fc += (inst.bidAbatementFC || 0); 
                stats.toPay.fr += (inst.bidAbatementFR || 0); 
                stats.toPay.ta += (inst.bidAbatementTA || 0);
            }
        }
    });
    stats.paid.total = stats.paid.fc + stats.paid.fr + stats.paid.ta + stats.paid.insurance + stats.paid.amortization + stats.paid.fine + stats.paid.interest;
    stats.toPay.total = stats.toPay.fc + stats.toPay.fr + stats.toPay.ta + stats.toPay.insurance + stats.toPay.amortization;
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

        // Manual contribution to FC (either from a manual transaction or a manual earning override)
        const manualFCContribution = (inst.manualEarnings || 0);
        const manualFCPct = (manualFCContribution / (inst.correctedCreditValue || currentDisplayCredit || 1)) * 100;

        const totalLineValue = inst.isManualTransaction ? inst.realAmountPaid : (inst.totalInstallment + bFC + bTA + bFR + (inst.manualEarnings || 0));

        return {
            fc: acc.fc + inst.commonFund + bFC + manualFCContribution,
            fcPct: acc.fcPct + (inst.monthlyRateFC || 0) + bFCP + manualFCPct,
            ta: acc.ta + inst.adminFee + bTA,
            taPct: acc.taPct + (inst.monthlyRateTA || 0) + bTAP,
            fr: acc.fr + inst.reserveFund + bFR,
            frPct: acc.frPct + (inst.monthlyRateFR || 0) + bFRP,
            insurance: acc.insurance + (inst.insurance || 0),
            amortization: acc.amortization + (inst.amortization || 0),
            fine: acc.fine + (inst.manualFine || 0),
            interest: acc.interest + (inst.manualInterest || 0),
            manualEarnings: acc.manualEarnings + (inst.manualEarnings || 0),
            total: acc.total + totalLineValue
        };
    }, { fc: 0, fcPct: 0, ta: 0, taPct: 0, fr: 0, frPct: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, manualEarnings: 0, total: 0 });

    return {
        ...totals,
        totalPct: totals.fcPct + totals.taPct + totals.frPct
    };
  }, [installments, currentDisplayCredit]);

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
        else if (editingCell.field === 'insurance') update.insurance = val;
        else if (editingCell.field === 'amortization') update.amortization = val;
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
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="fc"
                        value={paymentFormData.fc}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Taxa de Administração (TA)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="ta"
                        value={paymentFormData.ta}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fundo de Reserva (FR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="fr"
                        value={paymentFormData.fr}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
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
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="insurance"
                        value={paymentFormData.insurance}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amortização</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="amortization"
                        value={paymentFormData.amortization}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Multa</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input
                          type="text"
                          name="fine"
                          value={paymentFormData.fine}
                          onChange={handlePaymentFormChange}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Juros</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input
                          type="text"
                          name="interest"
                          value={paymentFormData.interest}
                          onChange={handlePaymentFormChange}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                    <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rendimentos Manuais (Abate Saldo FC)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="text"
                        name="manualEarnings"
                        value={paymentFormData.manualEarnings}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">Valor Total Pago</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-sm">R$</span>
                      <input
                        type="text"
                        name="amount"
                        value={paymentFormData.amount}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border-2 border-emerald-200 bg-emerald-50 rounded-md text-emerald-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
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
                <Plus className="text-blue-600" size={20} />
                Nova Transação Manual
              </h3>
              <button onClick={() => setIsManualTxModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
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
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                    <input
                      type="text"
                      name="amount"
                      value={manualTxFormData.amount}
                      onChange={handleManualTxFormChange}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsManualTxModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleManualTxSubmit}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                Adicionar Transação
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 print:hidden">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Calculator className="text-emerald-600" /> Simulador e Extrato</h2>
                {currentQuota && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${quotaStatus === 'Pré-Grupo' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                        {quotaStatus}
                    </span>
                )}
            </div>
              <div className="flex items-center gap-2">
                {currentQuota && (
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
                    className="px-3 py-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200 text-sm font-medium flex items-center gap-2"
                  >
                    <Plus size={16} /> Transação Manual
                  </button>
                )}
                {currentQuota && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportToExcel}
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                      title="Exportar para Excel"
                    >
                      <Download size={18} />
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                      title="Exportar para PDF"
                    >
                      <FileText size={18} />
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                      title="Imprimir"
                    >
                      <Printer size={18} />
                    </button>
                  </div>
                )}
                {currentQuota && <button onClick={() => navigate(`/edit/${currentQuota.id}`)} className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 text-sm font-medium flex items-center gap-2"><Pencil size={16} /> Editar Cota</button>}
              </div>
        </div>
        
        {/* FILTERS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
             {/* Search */}
             <div className="md:col-span-2 relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input type="text" placeholder="Pesquisar..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500" />
             </div>
             
             {/* Company Filter */}
             <div className="md:col-span-2 relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.companyId || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, companyId: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Empresa</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
             </div>

             {/* Administrator Filter */}
             <div className="md:col-span-2 relative">
                <Gavel className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.administratorId || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, administratorId: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Administradora</option>
                    {administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
             </div>

             {/* Product Filter */}
             <div className="md:col-span-2 relative">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.productType || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, productType: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Produto</option>
                    <option value="VEICULO">Veículo</option>
                    <option value="IMOVEL">Imóvel</option>
                </select>
             </div>

             {/* Status Filter */}
             <div className="md:col-span-2 relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white"
                    value={globalFilters.status}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, status: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Status</option>
                    <option value="CONTEMPLATED">Contempladas</option>
                    <option value="ACTIVE">Em Andamento</option>
                </select>
             </div>

             {/* Quota Select */}
             <div className="md:col-span-2">
                 <select 
                    className="w-full py-2 px-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md outline-none cursor-pointer" 
                    value={currentQuota?.id || ''} 
                    onChange={(e) => { const found = quotas.find(q => q.id === e.target.value); setCurrentQuota(found || null); }}
                >
                    <option value="">Cota ({filteredOptions.length})</option>
                    {filteredOptions.map(q => (
                        <option key={q.id} value={q.id}>
                            {q.group}-{q.quotaNumber}
                        </option>
                    ))}
                 </select>
             </div>
        </div>
      </div>

      {currentQuota && (
        <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-center justify-between text-sm text-emerald-800">
          <div className="flex items-center gap-2">
            <Calendar size={18} />
            <span>Mês de Referência do Índice: <strong>{currentQuota.indexReferenceMonth || 'Não definido'}</strong></span>
          </div>
          <span className="text-xs opacity-75 italic">Utilizado para o cálculo de correção anual (M-2)</span>
        </div>
      )}

      {currentQuota && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
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
                  <th className="p-2 text-right font-bold text-slate-800 bg-emerald-50/50">Vlr Pago (%)</th>
                  <th className="p-2 text-right border-l border-slate-200 bg-slate-50/80">Saldo FC (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo TA (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo FR (%)</th>
                  <th className="p-2 text-right font-bold bg-slate-100 border-l border-slate-200">Saldo Total (%)</th>
                  <th className="p-2 text-center bg-slate-100 border-l border-slate-200 w-12 print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((inst, idx) => (
                  <React.Fragment key={inst.isManualTransaction ? `manual-${inst.manualTransactionId || idx}` : `inst-${inst.installmentNumber}`}>
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
                                <span>Crédito Base: {formatCurrency(inst.correctedCreditValue || 0)}</span>
                                <span>Ajuste FC: +{formatCurrency(inst.correctionAmountFC || 0)}</span>
                                <span>Ajuste TA: +{formatCurrency(inst.correctionAmountTA || 0)}</span>
                                <span>Ajuste FR: +{formatCurrency(inst.correctionAmountFR || 0)}</span>
                                <span className="font-bold">Total Ajuste: +{formatCurrency(inst.correctionAmountTotal || 0)}</span>
                              </div>
                            </div>
                         </td>
                         <td className="p-2 text-right border-l border-blue-200 text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.correctionBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceFC?.toFixed(4)}%</span></div></td>
                         <td className="p-2 text-right text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.correctionBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceTA?.toFixed(4)}%</span></div></td>
                         <td className="p-2 text-right text-blue-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.correctionBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.correctionPercentBalanceFR?.toFixed(4)}%</span></div></td>
                         <td className="p-2 text-right font-bold text-blue-900 bg-blue-100/50 border-l border-blue-200"><div className="flex flex-col items-end"><span>{formatCurrency(inst.correctionBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.correctionPercentBalanceTotal?.toFixed(4)}%</span></div></td>
                         <td></td>
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
                            <td></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFR?.toFixed(4)}%</span></div></td>
                            <td colSpan={5}></td>
                            <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercent?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right border-l border-amber-200 text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidEmbeddedBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidEmbeddedBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidEmbeddedBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentBalanceFR?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/50 border-l border-amber-200"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidEmbeddedBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercentBalanceTotal?.toFixed(4)}%</span></div></td>
                            <td></td>
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
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFR?.toFixed(4)}%</span></div></td>
                            <td colSpan={5}></td>
                            <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercent?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right border-l border-orange-200 text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidFreeBalanceFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidFreeBalanceTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-800 font-medium text-[10px]"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidFreeBalanceFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentBalanceFR?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/50 border-l border-orange-200"><div className="flex flex-col items-end"><span>{formatCurrency(inst.bidFreeBalanceTotal || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercentBalanceTotal?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-center border-l border-orange-200 print:hidden">
                                <button 
                                    onClick={() => openPaymentModal(inst, true)}
                                    className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${payments[0]?.status === 'PAGO' ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-orange-700 bg-orange-100 hover:bg-orange-200'}`}
                                    title="Efetivar Lance"
                                >
                                    {payments[0]?.status === 'PAGO' ? <Edit3 size={12} /> : <CheckCircle size={12} />}
                                    {payments[0]?.status === 'PAGO' ? 'Editar' : 'Efetivar'}
                                </button>
                            </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}
                  <tr className={`hover:bg-slate-50 transition-colors ${inst.status === 'PAGO' ? 'bg-emerald-50/30' : ''}`}>
                    <td className="p-2 text-center font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100">
                      <div className="flex flex-col items-center">
                        <span className={`text-[9px] ${inst.status === 'PAGO' ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                          {inst.installmentNumber === 0 ? '000' : inst.installmentNumber}
                        </span>
                        {inst.status === 'PAGO' && <CheckCircle size={10} className="text-emerald-500 mx-auto mt-0.5" />}
                        {inst.tag && (
                          <span className="text-[8px] font-black text-blue-600 uppercase mt-0.5 bg-blue-50 px-1 rounded border border-blue-100">
                            {inst.tag}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2 text-slate-500">
                      {formatDate(inst.dueDate)}
                      {inst.status === 'PAGO' && inst.paymentDate && (
                        <div className="text-[8px] text-emerald-600 font-medium">Pago: {formatDate(inst.paymentDate)}</div>
                      )}
                    </td>
                    <td className="p-2 text-right text-slate-500">{formatCurrency(inst.correctedCreditValue || 0)}</td>
                    {renderEditableCell(inst, 'fc', inst.commonFund, inst.manualFC !== undefined && inst.manualFC !== null, inst.monthlyRateFC)}
                    {renderEditableCell(inst, 'ta', inst.adminFee, inst.manualTA !== undefined && inst.manualTA !== null, inst.monthlyRateTA)}
                    {renderEditableCell(inst, 'fr', inst.reserveFund, inst.manualFR !== undefined && inst.manualFR !== null, inst.monthlyRateFR)}
                    {renderEditableCell(inst, 'insurance', inst.insurance || 0, inst.manualInsurance !== undefined && inst.manualInsurance !== null)}
                    {renderEditableCell(inst, 'amortization', inst.amortization || 0, inst.manualAmortization !== undefined && inst.manualAmortization !== null)}
                    {renderEditableCell(inst, 'fine', inst.manualFine || 0, inst.manualFine !== undefined && inst.manualFine !== null)}
                    {renderEditableCell(inst, 'interest', inst.manualInterest || 0, inst.manualInterest !== undefined && inst.manualInterest !== null)}
                    <td className={`p-2 text-right text-xs font-medium ${inst.manualEarnings ? 'text-blue-600 bg-blue-50/30' : 'text-slate-400'}`}>
                      {inst.manualEarnings ? formatCurrency(inst.manualEarnings) : '-'}
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/20">
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency((inst.isManualTransaction ? inst.realAmountPaid : (inst.totalInstallment || 0)) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0))}</span>
                        <span className="text-[8px] text-slate-400">
                          {((((inst.isManualTransaction ? inst.realAmountPaid : (inst.totalInstallment || 0)) + (!inst.isManualTransaction ? (inst.manualEarnings || 0) : 0)) / (inst.correctedCreditValue || 1)) * 100).toFixed(4)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-right border-l border-slate-100"><span>{formatCurrency(inst.balanceFC)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFC.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceTA)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceTA.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceFR)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFR.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200"><span>{formatCurrency(inst.balanceTotal)}</span><br/><span className="text-[9px] text-slate-500 font-black">{inst.percentBalanceTotal.toFixed(4)}%</span></td>
                    <td className="p-2 text-center border-l border-slate-200 print:hidden">
                      {inst.isManualTransaction ? (
                        <button 
                          onClick={() => handleDeleteManualTx(inst.manualTransactionId || '')}
                          className="flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full text-red-700 bg-red-50 hover:bg-red-100"
                          title="Excluir Transação"
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      ) : (
                        <button 
                          onClick={() => openPaymentModal(inst)}
                          className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${inst.status === 'PAGO' ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                          title={inst.status === 'PAGO' ? 'Editar Pagamento' : 'Efetivar Parcela'}
                        >
                          {inst.status === 'PAGO' ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                        </button>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-slate-200 text-slate-800 font-bold text-[10px] uppercase border-t-2 border-slate-300 sticky bottom-0 z-20">
                <tr>
                  <td className="p-2 text-center bg-slate-300 sticky left-0 z-30" colSpan={3}>Soma Final</td>
                  <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fc)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.fcPct.toFixed(4)}%</span></div></td>
                  <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.ta)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.taPct.toFixed(4)}%</span></div></td>
                  <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fr)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.frPct.toFixed(4)}%</span></div></td>
                  <td className="p-2 text-right text-slate-700">{formatCurrency(footerTotals.insurance)}</td>
                  <td className="p-2 text-right text-slate-700">{formatCurrency(footerTotals.amortization)}</td>
                  <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.fine)}</td>
                  <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.interest)}</td>
                  <td className="p-2 text-right text-blue-800 bg-blue-100/50">{formatCurrency(footerTotals.manualEarnings)}</td>
                  <td className="p-2 text-right bg-emerald-100 font-black text-emerald-900"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.total)}</span><span className="text-[10px]">{footerTotals.totalPct.toFixed(4)}%</span></div></td>
                  <td colSpan={5} className="p-2 text-right text-[8px] text-slate-500 italic lowercase font-normal">* fechamento 100% FC + Taxas</td>
                </tr>
              </tfoot>
            </table>
          </div>
      </div>
      )}

      {currentQuota && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print:border-none">
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo Pago (Histórico)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.paid.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{detailedSummary.paid.insurance.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{detailedSummary.paid.amortization.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL PAGO</span> <div className="flex gap-12"><span>{detailedSummary.paid.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{(detailedSummary.paid.total / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo a Pagar (Saldo)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.insurance.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.amortization.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
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
