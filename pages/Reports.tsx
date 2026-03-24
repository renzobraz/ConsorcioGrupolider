import React, { useEffect, useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule, calculateCDICorrection, calculateCurrentCreditValue } from '../services/calculationService';
import { db } from '../services/database';
import { getTodayStr, formatNumber } from '../utils/formatters';
import { FileBarChart, Loader, AlertTriangle, Filter, CheckCircle2, Clock, Sheet, Calendar, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Printer, Download, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ReportRow {
  id: string;
  group: string;
  quotaNumber: string;
  creditValue: number;
  isContemplated: boolean;
  contemplationDate?: string;
  administratorId?: string;
  companyId?: string;
  productType?: string;

  saldoAVencer: number; 
  percentAVencer: number;
  saldoVencido: number; 
  percentVencido: number;

  bidTotal: number;
  percentBidTotal: number;
  bidFree: number;
  percentBidFree: number;
  bidEmbedded: number;
  percentBidEmbedded: number;
  
  creditAtContemplation: number; 
  valorRealCarta: number; 
  creditManualAdjustment: number;
  creditoTotal: number;
  bidFreeCorrection: number;
  creditoUtilizado: number;
  saldoDisponivel: number;
}

const Reports = () => {
  const { quotas, indices, updateQuota, administrators, companies, allCreditUsages, globalFilters, setGlobalFilters } = useConsortium();
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<{ id: string, field: 'credit' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filters State removed (using globalFilters)
  const [referenceDate, setReferenceDate] = useState(getTodayStr());
  const [sortConfig, setSortConfig] = useState<{ key: keyof ReportRow, direction: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    const buildReport = async () => {
      setLoading(true);
      const refDateStr = referenceDate;
      const refDate = new Date(refDateStr + 'T23:59:59');

      try {
        const [allPayments, allManualTransactions] = await Promise.all([
          db.getAllPaymentsDictionary(),
          db.getAllManualTransactions()
        ]);
        
        const rows = quotas.map(quota => {
          const quotaPayments = allPayments[quota.id] || {};
          const quotaManualTransactions = allManualTransactions.filter(t => t.quotaId === quota.id);
          const schedule = generateSchedule({ ...quota, manualTransactions: quotaManualTransactions }, indices, quotaPayments);
          
          let vlrCartaAtual = quota.creditValue;
          if (schedule.length > 0) {
             const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= refDateStr);
             vlrCartaAtual = pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue : quota.creditValue;
          }

          let sumVencido = 0;
          let sumAVencer = 0;
          const totalPercentContract = 100 + (quota.adminFeeRate || 0) + (quota.reserveFundRate || 0);
          let totalPercentRemaining = totalPercentContract;
          
          const bidPaymentData = quotaPayments[0];
          const isBidPaid = !!bidPaymentData && 
                           (bidPaymentData.status === 'PAGO' || bidPaymentData.isPaid === true) && 
                           !!bidPaymentData.paymentDate &&
                           bidPaymentData.paymentDate.split('T')[0] <= refDateStr;

          schedule.forEach(inst => {
              const paymentData = quotaPayments[inst.installmentNumber];
              // Strict check: must have status 'PAGO' and a payment date <= referenceDate
              const isActuallyPaid = !!paymentData && 
                                    (paymentData.status === 'PAGO' || paymentData.isPaid === true) && 
                                    !!paymentData.paymentDate &&
                                    paymentData.paymentDate.split('T')[0] <= refDateStr;

              if (isActuallyPaid) {
                  const fine = paymentData?.manualFine || inst.manualFine || 0;
                  const interest = paymentData?.manualInterest || inst.manualInterest || 0;
                  const insurance = paymentData?.manualInsurance || inst.insurance || 0;
                  const amortization = paymentData?.manualAmortization || inst.amortization || 0;
                  sumVencido += inst.commonFund + inst.reserveFund + inst.adminFee + insurance + amortization + fine + interest + (inst.manualEarnings || 0);
                  
                  // Deduct paid percentages
                  totalPercentRemaining -= (inst.monthlyRateFC || 0) + (inst.monthlyRateFR || 0) + (inst.monthlyRateTA || 0);
              } else {
                  // For unpaid items, we sum pending insurance and amortization
                  const insurance = paymentData?.manualInsurance || inst.insurance || 0;
                  const amortization = paymentData?.manualAmortization || inst.amortization || 0;
                  sumAVencer += insurance + amortization;
              }

              // Bid logic: If bid was applied in this installment AND if bid was paid
              if (inst.bidAmountApplied && inst.bidAmountApplied > 0 && isBidPaid) {
                  sumVencido += (inst.bidAbatementFC || 0) + (inst.bidAbatementFR || 0) + (inst.bidAbatementTA || 0);
                  
                  // Deduct bid percentages from remaining debt
                  totalPercentRemaining -= (inst.bidEmbeddedPercentFC || 0) + (inst.bidEmbeddedPercentTA || 0) + (inst.bidEmbeddedPercentFR || 0);
                  totalPercentRemaining -= (inst.bidFreePercentFC || 0) + (inst.bidFreePercentTA || 0) + (inst.bidFreePercentFR || 0);
              }
          });

          // Saldo Devedor = (Remaining % * Current Credit) + Pending Insurance/Amortization
          sumAVencer += Math.max(0, totalPercentRemaining * vlrCartaAtual) / 100;

          const totalContractValue = sumVencido + sumAVencer || 1;
          const percentAVencer = (Math.max(0, totalPercentRemaining) / totalPercentContract) * 100;
          const percentVencido = 100 - percentAVencer;
          
          const correction92CDI = calculateCDICorrection(quota.bidFree || 0, quota.contemplationDate, indices);
          
          const creditAtContemplation = calculateCurrentCreditValue(quota, indices, refDate);
          
          const bidEmbedded = quota.bidEmbedded || 0;
          const valorLiquido = creditAtContemplation - bidEmbedded;
          const creditoTotal = valorLiquido + (quota.creditManualAdjustment || 0);
          
          const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id && u.date <= refDateStr);
          const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

          return {
            id: quota.id,
            group: quota.group,
            quotaNumber: quota.quotaNumber,
            creditValue: vlrCartaAtual,
            isContemplated: quota.isContemplated,
            contemplationDate: quota.contemplationDate,
            administratorId: quota.administratorId,
            companyId: quota.companyId,
            productType: quota.productType,
            saldoAVencer: sumAVencer,
            percentAVencer: percentAVencer,
            saldoVencido: sumVencido,
            percentVencido: percentVencido,
            bidTotal: quota.bidTotal || 0,
            percentBidTotal: vlrCartaAtual > 0 ? ((quota.bidTotal || 0) / vlrCartaAtual) * 100 : 0,
            bidFree: quota.bidFree || 0,
            percentBidFree: vlrCartaAtual > 0 ? ((quota.bidFree || 0) / vlrCartaAtual) * 100 : 0,
            bidEmbedded: bidEmbedded,
            percentBidEmbedded: vlrCartaAtual > 0 ? (bidEmbedded / vlrCartaAtual) * 100 : 0,
            creditAtContemplation: creditAtContemplation,
            valorRealCarta: valorLiquido,
            creditManualAdjustment: quota.creditManualAdjustment || 0,
            creditoTotal: creditoTotal,
            bidFreeCorrection: correction92CDI,
            creditoUtilizado,
            saldoDisponivel: creditoTotal - creditoUtilizado
          };
        });
        setReportData(rows);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    buildReport();
  }, [quotas, indices, allCreditUsages, referenceDate]);

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const normalizedValue = editValue.trim().replace(/\./g, '').replace(',', '.');
    
    // If empty, assume 0
    const newVal = normalizedValue === '' ? 0 : parseFloat(normalizedValue);
    
    if (isNaN(newVal)) { 
      setEditingId(null); 
      return; 
    }
    
    const quota = quotas.find(q => q.id === editingId.id);
    if (quota) {
      try {
        const updatedData = { ...quota };
        if (editingId.field === 'credit') {
          updatedData.creditManualAdjustment = newVal;
        } else if (editingId.field === 'correction') {
          updatedData.bidFreeCorrection = newVal;
        }
        
        await updateQuota(updatedData);
        setEditingId(null);
      } catch (error) { 
        setSaveError("Erro ao salvar."); 
      }
    }
  };

  const filteredData = reportData.filter(row => {
    const matchAdmin = !globalFilters.administratorId || row.administratorId === globalFilters.administratorId;
    const matchComp = !globalFilters.companyId || row.companyId === globalFilters.companyId;
    
    // Robust product type matching (handles legacy 'VEHICLE'/'REAL_ESTATE' keys if they exist)
    let rowProduct = row.productType;
    if (rowProduct === 'VEHICLE') rowProduct = 'VEICULO';
    if (rowProduct === 'REAL_ESTATE') rowProduct = 'IMOVEL';
    
    const matchProduct = !globalFilters.productType || rowProduct === globalFilters.productType;
    let matchStatus = true;
    if (globalFilters.status === 'CONTEMPLATED') matchStatus = row.isContemplated;
    else if (globalFilters.status === 'ACTIVE') matchStatus = !row.isContemplated;
    return matchAdmin && matchComp && matchProduct && matchStatus;
  });

  const sortedData = useMemo(() => {
    let items = [...filteredData];
    if (sortConfig) {
      items.sort((a, b) => {
        if (sortConfig.key === 'quotaNumber') {
          return sortConfig.direction === 'asc' ? (parseInt(a.quotaNumber) - parseInt(b.quotaNumber)) : (parseInt(b.quotaNumber) - parseInt(a.quotaNumber));
        }
        
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (valA === valB) return 0;
        if (valA === undefined || valA === null || valA === '') return sortConfig.direction === 'asc' ? 1 : -1;
        if (valB === undefined || valB === null || valB === '') return sortConfig.direction === 'asc' ? -1 : 1;

        return sortConfig.direction === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
      });
    }
    return items;
  }, [filteredData, sortConfig]);

  const totals = sortedData.reduce((acc, row) => ({
    creditValue: acc.creditValue + row.creditValue,
    saldoAVencer: acc.saldoAVencer + row.saldoAVencer,
    saldoVencido: acc.saldoVencido + row.saldoVencido,
    bidTotal: acc.bidTotal + row.bidTotal,
    bidFree: acc.bidFree + row.bidFree,
    bidEmbedded: acc.bidEmbedded + row.bidEmbedded,
    creditAtContemplation: acc.creditAtContemplation + row.creditAtContemplation,
    valorRealCarta: acc.valorRealCarta + row.valorRealCarta,
    creditoTotal: acc.creditoTotal + row.creditoTotal,
    creditoUtilizado: acc.creditoUtilizado + row.creditoUtilizado,
    saldoDisponivel: acc.saldoDisponivel + row.saldoDisponivel,
    creditManualAdjustment: acc.creditManualAdjustment + row.creditManualAdjustment,
    bidFreeCorrection: acc.bidFreeCorrection + row.bidFreeCorrection
  }), { creditValue: 0, saldoAVencer: 0, saldoVencido: 0, bidTotal: 0, bidFree: 0, bidEmbedded: 0, creditAtContemplation: 0, valorRealCarta: 0, creditoTotal: 0, creditoUtilizado: 0, saldoDisponivel: 0, creditManualAdjustment: 0, bidFreeCorrection: 0 });

  const SortHeader = ({ label, sortKey, align = 'right', className = '' }: { label: string, sortKey: keyof ReportRow, align?: 'left'|'right', className?: string }) => (
      <th className={`px-2 py-3 cursor-pointer hover:bg-slate-800 transition-colors group select-none ${className} ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => setSortConfig({ key: sortKey, direction: sortConfig?.key === sortKey && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>{label} <ArrowUpDown size={10} className="opacity-30 group-hover:opacity-100" /></div>
      </th>
  );

  const handlePrint = () => {
    window.print();
  };

  const exportToExcel = () => {
    if (!sortedData.length) return;

    const exportRows = sortedData.map(row => ({
      'Grupo': row.group,
      'Cota': row.quotaNumber,
      'Vlr Carta': row.creditValue,
      'Valor Pago': row.saldoVencido,
      'Valor a Pagar': row.saldoAVencer,
      'Lance Tot.': row.bidTotal,
      '% Lance': row.percentBidTotal,
      'Lance Livre': row.bidFree,
      '% Liv': row.percentBidFree,
      'Crédito': row.creditAtContemplation,
      'Lance Emb.': row.bidEmbedded,
      '% Emb': row.percentBidEmbedded,
      'Vlr Líquido': row.valorRealCarta,
      'Aplicação financeira': row.creditManualAdjustment,
      '92% CDI': row.bidFreeCorrection,
      'Crédito Corrigido': row.creditoTotal,
      'Utilizado': row.creditoUtilizado,
      'Saldo Disp.': row.saldoDisponivel,
      'Data Contemplação': row.isContemplated && row.contemplationDate ? new Date(row.contemplationDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório por Cota');
    XLSX.writeFile(wb, `Relatorio_por_Cota_${referenceDate}.xlsx`);
  };

  const exportToPDF = () => {
    if (!sortedData.length) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    const title = `Relatório por Cota - Referência: ${referenceDate}`;
    
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

    const tableColumn = [
      "Grupo", "Cota", "Vlr Carta", "Valor Pago", "Valor a Pagar", "Lance Tot.", "% Lance", 
      "Lance Livre", "% Liv", "Crédito", "Lance Emb.", "% Emb", "Vlr Líquido", "Aplicação", "92% CDI", 
      "Corrigido", "Utilizado", "Saldo Disp.", "Contemplação"
    ];
    
    const tableRows = sortedData.map(row => [
      row.group,
      row.quotaNumber,
      formatNumber(row.creditValue),
      formatNumber(row.saldoVencido),
      formatNumber(row.saldoAVencer),
      formatNumber(row.bidTotal),
      `${row.percentBidTotal.toFixed(2)}%`,
      formatNumber(row.bidFree),
      `${row.percentBidFree.toFixed(2)}%`,
      formatNumber(row.creditAtContemplation),
      formatNumber(row.bidEmbedded),
      `${row.percentBidEmbedded.toFixed(2)}%`,
      formatNumber(row.valorRealCarta),
      formatNumber(row.creditManualAdjustment),
      formatNumber(row.bidFreeCorrection),
      formatNumber(row.creditoTotal),
      formatNumber(row.creditoUtilizado),
      formatNumber(row.saldoDisponivel),
      row.isContemplated && row.contemplationDate ? new Date(row.contemplationDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 30,
      theme: 'grid',
      styles: { fontSize: 5, cellPadding: 0.5 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`Relatorio_por_Cota_${referenceDate}.pdf`);
  };

  return (
    <div className="space-y-6 pb-10 print:p-0 print:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 print:text-xl">Relatório por Cota</h1>
           <p className="text-slate-500 print:text-xs">Acompanhamento de saldos, lances e créditos disponíveis em {referenceDate}.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button 
            onClick={exportToExcel}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Exportar para Excel"
          >
            <Download size={20} />
          </button>
          <button 
            onClick={exportToPDF}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Exportar para PDF"
          >
            <FileText size={20} />
          </button>
          <button 
            onClick={handlePrint}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Imprimir"
          >
            <Printer size={20} />
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-4 print:hidden">
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fechamento</label><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Empresa</label><select value={globalFilters.companyId || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, companyId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Administradora</label><select value={globalFilters.administratorId || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, administratorId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Produto</label><select value={globalFilters.productType || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, productType: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none"><option value="">Todos</option><option value="VEICULO">Veículo</option><option value="IMOVEL">Imóvel</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label><select value={globalFilters.status || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, status: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none"><option value="">Todas</option><option value="CONTEMPLATED">Contempladas</option><option value="ACTIVE">Em Andamento</option></select></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
              { label: 'Valor Pago', value: totals.saldoVencido, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Valor a Pagar', value: totals.saldoAVencer, color: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Total Lances', value: totals.bidTotal, color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Crédito Contemp.', value: totals.creditAtContemplation, color: 'text-slate-600', bg: 'bg-slate-50' },
              { label: 'Vlr Carta Líq.', value: totals.valorRealCarta, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Crédito Corrigido', value: totals.creditoTotal, color: 'text-slate-800', bg: 'bg-slate-100' },
              { label: 'Utilizado', value: totals.creditoUtilizado, color: 'text-orange-700', bg: 'bg-orange-50' },
              { label: 'Disponível', value: totals.saldoDisponivel, color: 'text-emerald-800', bg: 'bg-emerald-100 border-emerald-200' },
          ].map((t, i) => (
              <div key={i} className={`${t.bg} border border-slate-200/60 p-3 rounded-lg shadow-sm print:shadow-none print:border print:border-slate-300`}>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">{t.label}</p>
                  <p className={`text-sm font-black ${t.color}`}>{formatNumber(t.value)}</p>
              </div>
          ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border print:border-slate-300 print:shadow-none">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-[10px] text-left border-collapse print:text-[8px]">
              <thead className="bg-slate-800 text-white uppercase tracking-tighter print:bg-slate-800">
                <tr>
                  <SortHeader label="Grupo" sortKey="group" align="left" className="sticky left-0 bg-slate-800 z-10 border-r border-slate-700 print:static" />
                  <SortHeader label="Cota" sortKey="quotaNumber" align="left" className="sticky left-[50px] bg-slate-800 z-10 border-r border-slate-700 print:static" />
                  <SortHeader label="Vlr Carta" sortKey="creditValue" />
                  <SortHeader label="Valor Pago" sortKey="saldoVencido" className="bg-emerald-900/30" />
                  <SortHeader label="Valor a Pagar" sortKey="saldoAVencer" className="bg-red-900/30" />
                  <SortHeader label="Lance Tot." sortKey="bidTotal" className="bg-amber-900/30" />
                  <th className="px-2 py-3 text-right bg-amber-900/20 text-[8px] font-bold">% Lance</th>
                  <SortHeader label="Lance Livre" sortKey="bidFree" />
                  <th className="px-2 py-3 text-right text-[8px] font-bold">% Liv</th>
                  <SortHeader label="Crédito" sortKey="creditAtContemplation" className="bg-slate-700 print:bg-slate-700" />
                  <SortHeader label="Lance Emb." sortKey="bidEmbedded" />
                  <th className="px-2 py-3 text-right text-[8px] font-bold">% Emb</th>
                  <SortHeader label="Vlr Líquido" sortKey="valorRealCarta" className="font-bold" />
                  <SortHeader label="Aplicação financeira" sortKey="creditManualAdjustment" />
                  <SortHeader label="92% CDI" sortKey="bidFreeCorrection" />
                  <SortHeader label="Crédito Corrigido" sortKey="creditoTotal" className="bg-slate-700 font-bold print:bg-slate-700" />
                  <SortHeader label="Utilizado" sortKey="creditoUtilizado" />
                  <SortHeader label="Saldo Disp." sortKey="saldoDisponivel" className="bg-emerald-900 border-l border-emerald-700 font-bold print:bg-emerald-900" />
                  <SortHeader label="Data Contemplação" sortKey="contemplationDate" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (<tr><td colSpan={19} className="p-10 text-center"><Loader className="animate-spin mx-auto mb-2" /> Carregando dados...</td></tr>) : 
                 sortedData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.group}</td>
                    <td className="p-2 font-bold text-slate-700 sticky left-[50px] bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.quotaNumber}</td>
                    <td className="p-2 text-right">{formatNumber(row.creditValue)}</td>
                    <td className="p-2 text-right font-medium text-emerald-700 bg-emerald-50/30 print:bg-transparent">{formatNumber(row.saldoVencido)}</td>
                    <td className="p-2 text-right font-medium text-red-600 bg-red-50/30 print:bg-transparent">{formatNumber(row.saldoAVencer)}</td>
                    <td className="p-2 text-right font-medium text-amber-600 bg-amber-50/30 print:bg-transparent">{formatNumber(row.bidTotal)}</td>
                    <td className="p-2 text-right text-amber-500 font-bold">{row.percentBidTotal.toFixed(2)}%</td>
                    <td className="p-2 text-right">{formatNumber(row.bidFree)}</td>
                    <td className="p-2 text-right text-slate-500">{row.percentBidFree.toFixed(2)}%</td>
                    <td className="p-2 text-right font-bold bg-slate-50/80 print:bg-transparent">{formatNumber(row.creditAtContemplation)}</td>
                    <td className="p-2 text-right text-orange-600">{formatNumber(row.bidEmbedded)}</td>
                    <td className="p-2 text-right text-orange-500">{row.percentBidEmbedded.toFixed(2)}%</td>
                    <td className="p-2 text-right font-bold text-blue-700 bg-blue-50/30 print:bg-transparent">{formatNumber(row.valorRealCarta)}</td>
                    <td className="p-2 text-right text-blue-600 cursor-pointer print:cursor-default" onClick={() => { setEditingId({id: row.id, field: 'credit'}); setEditValue(row.creditManualAdjustment.toString().replace('.',',')); }}>{formatNumber(row.creditManualAdjustment)}</td>
                    <td className="p-2 text-right text-violet-600 cursor-pointer print:cursor-default" onClick={() => { setEditingId({id: row.id, field: 'correction'}); setEditValue(row.bidFreeCorrection.toString().replace('.',',')); }}>{formatNumber(row.bidFreeCorrection)}</td>
                    <td className="p-2 text-right font-bold bg-slate-50 print:bg-transparent">{formatNumber(row.creditoTotal)}</td>
                    <td className="p-2 text-right text-amber-700">{formatNumber(row.creditoUtilizado)}</td>
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50 border-l border-emerald-100 print:bg-transparent">{formatNumber(row.saldoDisponivel)}</td>
                    <td className="p-2 text-right text-slate-500">{row.isContemplated && row.contemplationDate ? new Date(row.contemplationDate + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold text-[9px] uppercase print:bg-slate-900">
                  <tr>
                      <td className="p-2 sticky left-0 bg-slate-900 border-r border-slate-700 print:static print:bg-transparent" colSpan={2}>Totais ({sortedData.length})</td>
                      <td className="p-2 text-right">{formatNumber(totals.creditValue)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.saldoVencido)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.saldoAVencer)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidTotal)}</td>
                      <td className="p-2 text-right"></td>
                      <td className="p-2 text-right">{formatNumber(totals.bidFree)}</td>
                      <td className="p-2 text-right"></td>
                      <td className="p-2 text-right bg-slate-800 print:bg-transparent">{formatNumber(totals.creditAtContemplation)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidEmbedded)}</td>
                      <td className="p-2 text-right"></td>
                      <td className="p-2 text-right bg-blue-900/40 print:bg-transparent">{formatNumber(totals.valorRealCarta)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.creditManualAdjustment)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidFreeCorrection)}</td>
                      <td className="p-2 text-right bg-slate-800 print:bg-transparent">{formatNumber(totals.creditoTotal)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.creditoUtilizado)}</td>
                      <td className="p-2 text-right bg-emerald-950 print:bg-transparent">{formatNumber(totals.saldoDisponivel)}</td>
                      <td className="p-2 text-right"></td>
                  </tr>
              </tfoot>
            </table>
          </div>
      </div>
      {editingId && (
          <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4 print:hidden">
              <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-sm:max-w-sm">
                  <h3 className="font-bold mb-4">Ajuste Manual de Crédito</h3>
                  <input autoFocus type="text" value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full border p-2 rounded mb-4" placeholder="0,00" />
                  <div className="flex gap-2">
                      <button onClick={() => setEditingId(null)} className="flex-1 p-2 border rounded">Cancelar</button>
                      <button onClick={handleSaveEdit} className="flex-1 p-2 bg-emerald-600 text-white rounded">Salvar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reports;