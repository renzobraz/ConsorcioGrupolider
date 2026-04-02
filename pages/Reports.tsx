import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule, calculateCDICorrection, calculateCurrentCreditValue, calculateScheduleSummary } from '../services/calculationService';
import { db } from '../services/database';
import { getTodayStr, formatNumber } from '../utils/formatters';
import { FileBarChart, Loader, AlertTriangle, Filter, CheckCircle2, Clock, Sheet, Calendar, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Printer, Download, FileText, BadgeCheck, X, Trash2, Mail, ArrowLeft } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SendEmailModal } from '../components/SendEmailModal';
import { AVAILABLE_REPORT_COLUMNS } from '../constants/reportAvailableColumns';

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
  const navigate = useNavigate();
  const { quotas, indices, updateQuota, administrators, companies, allCreditUsages, allCreditUpdates, addCreditUpdate, deleteCreditUpdate, globalFilters, setGlobalFilters, sendReportEmail, smtpConfig, addScheduledReport } = useConsortium();
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [editingId, setEditingId] = useState<{ id: string, field: string } | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Filters State removed (using globalFilters)
  const [referenceDate, setReferenceDate] = useState(getTodayStr());
  const [sortConfig, setSortConfig] = useState<{ key: keyof ReportRow, direction: 'asc' | 'desc' } | null>(null);

  const buildReport = useCallback(async (refDateStr: string) => {
    const refDate = new Date(refDateStr + 'T23:59:59');

    try {
      const rows = await Promise.all(quotas.map(async (quota) => {
        const [quotaPayments, quotaManualTransactions] = await Promise.all([
          db.getPayments(quota.id),
          db.getManualTransactions(quota.id)
        ]);

        const schedule = generateSchedule({ ...quota, manualTransactions: quotaManualTransactions }, indices, quotaPayments);
        
        const vlrCartaAtual = calculateCurrentCreditValue(quota, indices, refDate, false, true);

        const summary = calculateScheduleSummary(quota, schedule, quotaPayments);
        
        const sumVencido = summary.paid.total;
        const sumAVencer = summary.toPay.total;
        const percentVencido = summary.paid.percent;
        const percentAVencer = summary.toPay.percent;
        
        const correction92CDI = calculateCDICorrection(quota.bidFree || 0, quota.contemplationDate, indices, refDateStr);
        
        const creditAtContemplation = calculateCurrentCreditValue(quota, indices, refDate, true);
        
        const bidEmbedded = quota.bidEmbedded || 0;
        const valorLiquido = creditAtContemplation - bidEmbedded;
        
        const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === quota.id);
        const latestUpdateValue = quotaUpdates.length > 0 
          ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
          : 0;
        
        const creditoTotal = valorLiquido + latestUpdateValue;
        
        const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id && u.date <= refDateStr);
        const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

        const bidBase = quota.isContemplated ? creditAtContemplation : vlrCartaAtual;

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
          percentBidTotal: bidBase > 0 ? ((quota.bidTotal || 0) / bidBase) * 100 : 0,
          bidFree: quota.bidFree || 0,
          percentBidFree: bidBase > 0 ? ((quota.bidFree || 0) / bidBase) * 100 : 0,
          bidEmbedded: bidEmbedded,
          percentBidEmbedded: bidBase > 0 ? (bidEmbedded / bidBase) * 100 : 0,
          creditAtContemplation: creditAtContemplation,
          valorRealCarta: valorLiquido,
          creditManualAdjustment: latestUpdateValue,
          creditoTotal: creditoTotal,
          bidFreeCorrection: correction92CDI,
          creditoUtilizado,
          saldoDisponivel: creditoTotal - creditoUtilizado
        };
      }));
      return rows;
    } catch (err) { 
      console.error(err); 
      return [];
    }
  }, [quotas, indices, allCreditUsages, allCreditUpdates]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const rows = await buildReport(referenceDate);
      setReportData(rows);
      setLoading(false);
    };
    loadData();
  }, [buildReport, referenceDate]);

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
        // Manual editing for correction removed as it is now automatic
        
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
    const matchStatus = !globalFilters.status || (globalFilters.status === 'CONTEMPLATED' ? row.isContemplated : !row.isContemplated);
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

  const sums = sortedData.reduce((acc, row) => ({
    creditValue: acc.creditValue + (row.creditValue || 0),
    saldoAVencer: acc.saldoAVencer + (row.saldoAVencer || 0),
    saldoVencido: acc.saldoVencido + (row.saldoVencido || 0),
    bidTotal: acc.bidTotal + (row.bidTotal || 0),
    bidFree: acc.bidFree + (row.bidFree || 0),
    bidEmbedded: acc.bidEmbedded + (row.bidEmbedded || 0),
    creditAtContemplation: acc.creditAtContemplation + (row.creditAtContemplation || 0),
    valorRealCarta: acc.valorRealCarta + (row.valorRealCarta || 0),
    creditoTotal: acc.creditoTotal + (row.creditoTotal || 0),
    creditoUtilizado: acc.creditoUtilizado + (row.creditoUtilizado || 0),
    saldoDisponivel: acc.saldoDisponivel + (row.saldoDisponivel || 0),
    creditManualAdjustment: acc.creditManualAdjustment + (row.creditManualAdjustment || 0),
    bidFreeCorrection: acc.bidFreeCorrection + (row.bidFreeCorrection || 0),
    contemplatedAvailableCredit: acc.contemplatedAvailableCredit + (row.isContemplated ? (row.saldoDisponivel || 0) : 0),
    percentBidTotalSum: acc.percentBidTotalSum + (row.percentBidTotal || 0),
    percentBidFreeSum: acc.percentBidFreeSum + (row.percentBidFree || 0),
    percentBidEmbeddedSum: acc.percentBidEmbeddedSum + (row.percentBidEmbedded || 0),
    percentVencidoSum: acc.percentVencidoSum + (row.percentVencido || 0),
    percentAVencerSum: acc.percentAVencerSum + (row.percentAVencer || 0),
  }), { 
    creditValue: 0, saldoAVencer: 0, saldoVencido: 0, bidTotal: 0, bidFree: 0, bidEmbedded: 0, 
    creditAtContemplation: 0, valorRealCarta: 0, creditoTotal: 0, creditoUtilizado: 0, 
    saldoDisponivel: 0, creditManualAdjustment: 0, bidFreeCorrection: 0, 
    contemplatedAvailableCredit: 0,
    percentBidTotalSum: 0,
    percentBidFreeSum: 0,
    percentBidEmbeddedSum: 0,
    percentVencidoSum: 0,
    percentAVencerSum: 0,
  });

  const totals = {
    ...sums,
    percentBidTotalAvg: sortedData.length > 0 ? sums.percentBidTotalSum / sortedData.length : 0,
    percentBidFreeAvg: sortedData.length > 0 ? sums.percentBidFreeSum / sortedData.length : 0,
    percentBidEmbeddedAvg: sortedData.length > 0 ? sums.percentBidEmbeddedSum / sortedData.length : 0,
    percentVencidoAvg: sortedData.length > 0 ? sums.percentVencidoSum / sortedData.length : 0,
    percentAVencerAvg: sortedData.length > 0 ? sums.percentAVencerSum / sortedData.length : 0,
  };

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
      'Valor da Carta Atual': row.creditValue,
      'Valor Pago': row.saldoVencido,
      '% Pago (efetivado)': row.percentVencido,
      'Valor a Pagar': row.saldoAVencer,
      '% do valor a pagar': row.percentAVencer,
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
      'Crédito Total Com Aplicação': row.creditoTotal,
      'Crédito Utilizado': row.creditoUtilizado,
      'Crédito Total Disponível': row.saldoDisponivel,
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
    const title = `Relatório por Cota`;
    
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59);
    doc.text(title, 14, 15);
    
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Acompanhamento de saldos, lances e créditos em ${referenceDate}`, 14, 22);

    let currentY = 28;

    // Summary Cards
    const cardWidth = 42;
    const cardHeight = 15;
    const gap = 2;
    let startX = 14;
    let currentX = startX;

    const cards = [
      { label: 'Cotas', value: sortedData.length, color: [71, 85, 105] },
      { label: 'Valor da Carta Atual', value: formatNumber(totals.creditValue), color: [71, 85, 105] },
      { label: 'Valor Pago', value: formatNumber(totals.saldoVencido), color: [5, 150, 105] },
      { label: 'Valor a Pagar', value: formatNumber(totals.saldoAVencer), color: [220, 38, 38] },
      { label: 'Total Lances', value: formatNumber(totals.bidTotal), color: [180, 83, 9] },
      { label: 'Crédito', value: formatNumber(totals.creditAtContemplation), color: [71, 85, 105] },
      { label: 'Vlr Líquido', value: formatNumber(totals.valorRealCarta), color: [29, 78, 216] },
      { label: 'Crédito Total Com Aplicação', value: formatNumber(totals.creditoTotal), color: [30, 41, 59] },
      { label: 'Crédito Utilizado', value: formatNumber(totals.creditoUtilizado), color: [194, 65, 12] },
      { label: 'Crédito Total Disponível', value: formatNumber(totals.saldoDisponivel), color: [6, 95, 70] },
      { label: 'Créditos Disponível Utilização', value: formatNumber(totals.contemplatedAvailableCredit), color: [55, 48, 163] },
    ];

    cards.forEach((card, index) => {
      if (index === 6) {
        currentY += cardHeight + gap;
        currentX = startX;
      }
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(currentX, currentY, cardWidth, cardHeight, 1, 1, 'F');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label, currentX + 2, currentY + 5);
      doc.setFontSize(7);
      doc.setTextColor(card.color[0], card.color[1], card.color[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(String(card.value), currentX + 2, currentY + 11);
      doc.setFont('helvetica', 'normal');
      currentX += cardWidth + gap;
    });

    currentY += cardHeight + 5;

    const tableColumn = [
      "Grupo", "Cota", "Valor da Carta Atual", "Valor Pago", "% Pago", "Valor a Pagar", "% a Pagar", "Lance Tot.", "% Lance", 
      "Lance Livre", "% Liv", "Crédito", "Lance Emb.", "% Emb", "Vlr Líquido", "Aplicação", "92% CDI", 
      "Corrigido", "Crédito Utilizado", "Crédito Total Disponível", "Contemplação"
    ];
    
    const tableRows = sortedData.map(row => [
      row.group,
      row.quotaNumber,
      formatNumber(row.creditValue),
      formatNumber(row.saldoVencido),
      `${row.percentVencido.toFixed(2)}%`,
      formatNumber(row.saldoAVencer),
      `${row.percentAVencer.toFixed(2)}%`,
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
      startY: currentY,
      theme: 'grid',
      styles: { fontSize: 5, cellPadding: 0.5 },
      headStyles: { fillColor: [30, 41, 59] },
      didParseCell: (data) => {
        const header = data.column.raw as string;
        if (data.section === 'body') {
          if (header === 'Valor Pago') data.cell.styles.textColor = [5, 150, 105];
          if (header === 'Valor a Pagar') data.cell.styles.textColor = [220, 38, 38];
          if (header === 'Lance Tot.') data.cell.styles.textColor = [180, 83, 9];
          if (header === 'Vlr Líquido') data.cell.styles.textColor = [29, 78, 216];
          if (header === 'Crédito Total Disponível') data.cell.styles.textColor = [6, 95, 70];
        }
      }
    });

    doc.save(`Relatorio_por_Cota_${referenceDate}.pdf`);
  };

  const availableColumns = AVAILABLE_REPORT_COLUMNS;

  const handleSendEmail = async (config: {
    recipient: string;
    subject: string;
    message: string;
    selectedColumns: string[];
    filters: {
      referenceDate: string;
      companyId?: string;
      administratorId?: string;
      productType?: string;
    };
    saveAsScheduled: boolean;
    frequency: any;
    reportName: string;
  }) => {
    // If saving as scheduled, we need to save it to the database
    if (config.saveAsScheduled) {
      try {
        await addScheduledReport({
          id: crypto.randomUUID(),
          name: config.reportName,
          recipient: config.recipient,
          subject: config.subject,
          message: config.message,
          frequency: config.frequency,
          selectedColumns: config.selectedColumns,
          filters: config.filters,
          isActive: true,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error('Erro ao salvar relatório agendado:', error);
      }
    }

    if (!smtpConfig || !smtpConfig.host) {
      throw new Error('Configurações de SMTP não encontradas. Configure-as na página de Configurações.');
    }

    setSendingEmail(true);
    setEmailStatus(null);

    try {
      // Re-calculate or re-filter data based on modal filters
      let dataForEmail = reportData;
      
      // If reference date changed, we must re-calculate
      if (config.filters.referenceDate !== referenceDate) {
        dataForEmail = await buildReport(config.filters.referenceDate);
      }

      // Apply other filters from modal
      const filteredForEmail = dataForEmail.filter(row => {
        const matchAdmin = !config.filters.administratorId || row.administratorId === config.filters.administratorId;
        const matchComp = !config.filters.companyId || row.companyId === config.filters.companyId;
        
        let rowProduct = row.productType;
        if (rowProduct === 'VEHICLE') rowProduct = 'VEICULO';
        if (rowProduct === 'REAL_ESTATE') rowProduct = 'IMOVEL';
        
        const matchProduct = !config.filters.productType || rowProduct === config.filters.productType;
        return matchAdmin && matchComp && matchProduct;
      });

      if (filteredForEmail.length === 0) {
        throw new Error('Nenhuma cota encontrada com os filtros selecionados.');
      }

      // Calculate totals for the filtered data
      const emailTotals = filteredForEmail.reduce((acc, row) => ({
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
        bidFreeCorrection: acc.bidFreeCorrection + row.bidFreeCorrection,
        contemplatedAvailableCredit: acc.contemplatedAvailableCredit + (row.isContemplated ? row.saldoDisponivel : 0)
      }), { creditValue: 0, saldoAVencer: 0, saldoVencido: 0, bidTotal: 0, bidFree: 0, bidEmbedded: 0, creditAtContemplation: 0, valorRealCarta: 0, creditoTotal: 0, creditoUtilizado: 0, saldoDisponivel: 0, creditManualAdjustment: 0, bidFreeCorrection: 0, contemplatedAvailableCredit: 0 });

      const doc = new jsPDF('l', 'mm', 'a4');
      const title = config.subject || `Relatório por Cota`;
      
      doc.setFontSize(20);
      doc.setTextColor(30, 41, 59);
      doc.text(title, 14, 15);
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Acompanhamento de saldos, lances e créditos em ${config.filters.referenceDate}`, 14, 22);

      let currentY = 28;

      // Summary Cards
      const cardWidth = 42;
      const cardHeight = 15;
      const gap = 2;
      let startX = 14;
      let currentX = startX;

      const cards = [
        { label: 'Cotas', value: filteredForEmail.length, color: [71, 85, 105] },
        { label: 'Valor da Carta Atual', value: formatNumber(emailTotals.creditValue), color: [71, 85, 105] },
        { label: 'Valor Pago', value: formatNumber(emailTotals.saldoVencido), color: [5, 150, 105] },
        { label: 'Valor a Pagar', value: formatNumber(emailTotals.saldoAVencer), color: [220, 38, 38] },
        { label: 'Total Lances', value: formatNumber(emailTotals.bidTotal), color: [180, 83, 9] },
        { label: 'Crédito', value: formatNumber(emailTotals.creditAtContemplation), color: [71, 85, 105] },
        { label: 'Vlr Líquido', value: formatNumber(emailTotals.valorRealCarta), color: [29, 78, 216] },
        { label: 'Crédito Total Com Aplicação', value: formatNumber(emailTotals.creditoTotal), color: [30, 41, 59] },
        { label: 'Crédito Utilizado', value: formatNumber(emailTotals.creditoUtilizado), color: [194, 65, 12] },
        { label: 'Crédito Total Disponível', value: formatNumber(emailTotals.saldoDisponivel), color: [6, 95, 70] },
        { label: 'Créditos Disponível Utilização', value: formatNumber(emailTotals.contemplatedAvailableCredit), color: [55, 48, 163] },
      ];

      cards.forEach((card, index) => {
        if (index === 6) {
          currentY += cardHeight + gap;
          currentX = startX;
        }
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(currentX, currentY, cardWidth, cardHeight, 1, 1, 'F');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(card.label, currentX + 2, currentY + 5);
        doc.setFontSize(7);
        doc.setTextColor(card.color[0], card.color[1], card.color[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(String(card.value), currentX + 2, currentY + 11);
        doc.setFont('helvetica', 'normal');
        currentX += cardWidth + gap;
      });

      currentY += cardHeight + 5;

      // Map selected columns to headers and data
      const tableColumn = availableColumns
        .filter(col => config.selectedColumns.includes(col.id))
        .map(col => col.label);
      
      const tableRows = filteredForEmail.map(row => {
        const rowData: string[] = [];
        config.selectedColumns.forEach(colId => {
          const val = row[colId as keyof ReportRow];
          if (colId === 'contemplationDate') {
            rowData.push(row.isContemplated && row.contemplationDate ? new Date(row.contemplationDate + 'T12:00:00').toLocaleDateString('pt-BR') : '');
          } else if (colId.startsWith('percent')) {
            rowData.push(`${(val as number).toFixed(2)}%`);
          } else if (typeof val === 'number') {
            rowData.push(formatNumber(val));
          } else {
            rowData.push(String(val || ''));
          }
        });
        return rowData;
      });

      // Add Totals Row
      const totalsRow: string[] = [];
      config.selectedColumns.forEach(colId => {
        if (colId === 'group') {
          totalsRow.push('TOTAIS');
        } else if (['creditValue', 'saldoAVencer', 'saldoVencido', 'bidTotal', 'bidFree', 'bidEmbedded', 'creditAtContemplation', 'valorRealCarta', 'creditoTotal', 'creditoUtilizado', 'saldoDisponivel', 'creditManualAdjustment', 'bidFreeCorrection', 'contemplatedAvailableCredit'].includes(colId)) {
          totalsRow.push(formatNumber(emailTotals[colId as keyof typeof emailTotals]));
        } else {
          totalsRow.push('');
        }
      });
      tableRows.push(totalsRow);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: currentY,
        theme: 'grid',
        styles: { fontSize: config.selectedColumns.length > 12 ? 4 : 6, cellPadding: 0.5 },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: config.selectedColumns.reduce((acc, colId, index) => {
          const col = availableColumns.find(c => c.id === colId);
          if (col && (col.type === 'currency' || col.type === 'number' || col.type === 'percent')) {
            acc[index] = { halign: 'right' };
          }
          return acc;
        }, {} as any),
        didParseCell: (data) => {
          const header = data.column.raw as string;
          if (data.section === 'body') {
            // Apply colors to specific columns
            if (header === 'Valor Pago') data.cell.styles.textColor = [5, 150, 105];
            if (header === 'Valor a Pagar') data.cell.styles.textColor = [220, 38, 38];
            if (header === 'Lance Tot.') data.cell.styles.textColor = [180, 83, 9];
            if (header === 'Vlr Líquido') data.cell.styles.textColor = [29, 78, 216];
            if (header === 'Crédito Total Disponível') data.cell.styles.textColor = [6, 95, 70];

            // Highlight Totals Row
            if (data.row.index === tableRows.length - 1) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [241, 245, 249];
            }
          }
        }
      });

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const filename = `Relatorio_por_Cota_${config.filters.referenceDate}.pdf`;

      await sendReportEmail(
        config.subject,
        config.message,
        [{ filename, content: pdfBase64, encoding: 'base64' }],
        config.recipient
      );

      setEmailStatus({ type: 'success', message: 'Relatório enviado com sucesso por e-mail!' });
    } catch (error: any) {
      console.error('Erro ao enviar e-mail:', error);
      setEmailStatus({ type: 'error', message: `Erro ao enviar e-mail: ${error.message}` });
      throw error;
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6 pb-10 print:p-0 print:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/reports/executive')} 
            className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-lg border border-slate-200 print:hidden"
            title="Voltar ao relatório executivo"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
             <h1 className="text-2xl font-bold text-slate-800 print:text-xl">Relatório por Cota</h1>
             <p className="text-slate-500 print:text-xs">Acompanhamento de saldos, lances e créditos disponíveis em {referenceDate}.</p>
          </div>
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
            onClick={() => setIsEmailModalOpen(true)}
            disabled={sendingEmail}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors disabled:opacity-50"
            title="Enviar por E-mail"
          >
            {sendingEmail ? <Loader size={20} className="animate-spin" /> : <Mail size={20} />}
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

      {emailStatus && (
        <div className={`p-4 rounded-lg flex items-center justify-between ${emailStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            {emailStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span className="text-sm font-medium">{emailStatus.message}</span>
          </div>
          <button onClick={() => setEmailStatus(null)} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-4 print:hidden">
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fechamento</label><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Empresa</label><select value={globalFilters.companyId || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, companyId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Administradora</label><select value={globalFilters.administratorId || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, administratorId: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Produto</label><select value={globalFilters.productType || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, productType: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none"><option value="">Todos</option><option value="VEICULO">Veículo</option><option value="IMOVEL">Imóvel</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label><select value={globalFilters.status || ''} onChange={(e) => setGlobalFilters({ ...globalFilters, status: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none"><option value="">Todos</option><option value="ACTIVE">Ativas</option><option value="CONTEMPLATED">Contempladas</option></select></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3 print:hidden">
          {[
              { label: 'Cotas', value: sortedData.length, color: 'text-slate-700', bg: 'bg-white', isCurrency: false },
              { label: 'Valor da Carta Atual', value: totals.creditValue, color: 'text-slate-700', bg: 'bg-white', isCurrency: true },
              { label: 'Valor Pago', value: totals.saldoVencido, color: 'text-emerald-700', bg: 'bg-emerald-50', isCurrency: true },
              { label: 'Valor a Pagar', value: totals.saldoAVencer, color: 'text-red-700', bg: 'bg-red-50', isCurrency: true },
              { label: 'Total Lances', value: totals.bidTotal, color: 'text-amber-700', bg: 'bg-amber-50', isCurrency: true },
              { label: 'Crédito', value: totals.creditAtContemplation, color: 'text-slate-600', bg: 'bg-slate-50', isCurrency: true },
              { label: 'Vlr Líquido', value: totals.valorRealCarta, color: 'text-blue-700', bg: 'bg-blue-50', isCurrency: true },
              { label: 'Crédito Total Com Aplicação', value: totals.creditoTotal, color: 'text-slate-800', bg: 'bg-slate-100', isCurrency: true },
              { label: 'Crédito Utilizado', value: totals.creditoUtilizado, color: 'text-orange-700', bg: 'bg-orange-50', isCurrency: true },
              { label: 'Crédito Total Disponível', value: totals.saldoDisponivel, color: 'text-emerald-800', bg: 'bg-emerald-50', isCurrency: true },
              { label: 'Créditos Disponível Utilização', value: totals.contemplatedAvailableCredit, color: 'text-indigo-800', bg: 'bg-indigo-50 border-indigo-200', isCurrency: true },
          ].map((t, i) => (
              <div key={i} className={`${t.bg} border border-slate-200/60 p-3 rounded-lg shadow-sm print:shadow-none print:border print:border-slate-300 flex flex-col justify-between`}>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mb-1 leading-tight">{t.label}</p>
                  <p className={`text-sm font-black ${t.color}`}>
                    {t.isCurrency ? formatNumber(t.value) : t.value}
                  </p>
              </div>
          ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:overflow-visible print:border-none print:shadow-none">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-[10px] text-left border-collapse print:text-[8px]">
              <thead className="bg-slate-800 text-white uppercase tracking-tighter print:bg-slate-800">
                <tr>
                  <SortHeader label="Grupo" sortKey="group" align="left" className="sticky left-0 bg-slate-800 z-10 border-r border-slate-700 print:static" />
                  <SortHeader label="Cota" sortKey="quotaNumber" align="left" className="sticky left-[50px] bg-slate-800 z-10 border-r border-slate-700 print:static" />
                  <SortHeader label="Valor da Carta Atual" sortKey="creditValue" />
                  <SortHeader label="Valor Pago" sortKey="saldoVencido" className="bg-emerald-900/30" />
                  <SortHeader label="% Pago (efetivado)" sortKey="percentVencido" className="bg-emerald-900/20" />
                  <SortHeader label="Valor a Pagar" sortKey="saldoAVencer" className="bg-red-900/30" />
                  <SortHeader label="% do valor a pagar" sortKey="percentAVencer" className="bg-red-900/20" />
                  <SortHeader label="Lance Tot." sortKey="bidTotal" className="bg-amber-900/30" />
                  <SortHeader label="% Lance" sortKey="percentBidTotal" className="bg-amber-900/20" />
                  <SortHeader label="Lance Livre" sortKey="bidFree" />
                  <SortHeader label="% Liv" sortKey="percentBidFree" />
                  <SortHeader label="Crédito" sortKey="creditAtContemplation" className="bg-slate-700 print:bg-slate-700" />
                  <SortHeader label="Lance Emb." sortKey="bidEmbedded" />
                  <SortHeader label="% Emb" sortKey="percentBidEmbedded" />
                  <SortHeader label="Vlr Líquido" sortKey="valorRealCarta" className="font-bold" />
                  <SortHeader label="Aplicação financeira" sortKey="creditManualAdjustment" />
                  <SortHeader label="92% CDI" sortKey="bidFreeCorrection" />
                  <SortHeader label="Crédito Total Com Aplicação" sortKey="creditoTotal" className="bg-slate-700 font-bold print:bg-slate-700" />
                  <SortHeader label="Crédito Utilizado" sortKey="creditoUtilizado" />
                  <SortHeader label="Crédito Total Disponível" sortKey="saldoDisponivel" className="bg-emerald-900 border-l border-emerald-700 font-bold print:bg-emerald-900" />
                  <SortHeader label="Data Contemplação" sortKey="contemplationDate" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (<tr><td colSpan={21} className="p-10 text-center"><Loader className="animate-spin mx-auto mb-2" /> Carregando dados...</td></tr>) : 
                 sortedData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.group}</td>
                    <td className="p-2 font-bold text-slate-700 sticky left-[50px] bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.quotaNumber}</td>
                    <td className="p-2 text-right">{formatNumber(row.creditValue)}</td>
                    <td className="p-2 text-right font-medium text-emerald-700 bg-emerald-50/30 print:bg-transparent">{formatNumber(row.saldoVencido)}</td>
                    <td className="p-2 text-right text-emerald-600 font-bold">{row.percentVencido.toFixed(2)}%</td>
                    <td className="p-2 text-right font-medium text-red-600 bg-red-50/30 print:bg-transparent">{formatNumber(row.saldoAVencer)}</td>
                    <td className="p-2 text-right text-red-500 font-bold">{row.percentAVencer.toFixed(2)}%</td>
                    <td className="p-2 text-right font-medium text-amber-600 bg-amber-50/30 print:bg-transparent">{formatNumber(row.bidTotal)}</td>
                    <td className="p-2 text-right text-amber-500 font-bold">{row.percentBidTotal.toFixed(2)}%</td>
                    <td className="p-2 text-right">{formatNumber(row.bidFree)}</td>
                    <td className="p-2 text-right text-slate-500">{row.percentBidFree.toFixed(2)}%</td>
                    <td className="p-2 text-right font-bold bg-slate-50/80 print:bg-transparent">{formatNumber(row.creditAtContemplation)}</td>
                    <td className="p-2 text-right text-orange-600">{formatNumber(row.bidEmbedded)}</td>
                    <td className="p-2 text-right text-orange-500">{row.percentBidEmbedded.toFixed(2)}%</td>
                    <td className="p-2 text-right font-bold text-blue-700 bg-blue-50/30 print:bg-transparent">{formatNumber(row.valorRealCarta)}</td>
                    <td className="p-2 text-right text-blue-600 cursor-pointer print:cursor-default" onClick={() => setShowUpdateModal(row.id)}>{formatNumber(row.creditManualAdjustment)}</td>
                    <td className="p-2 text-right text-violet-600">{formatNumber(row.bidFreeCorrection)}</td>
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
                      <td className="p-2 text-right text-emerald-400">{totals.percentVencidoAvg.toFixed(2)}%</td>
                      <td className="p-2 text-right">{formatNumber(totals.saldoAVencer)}</td>
                      <td className="p-2 text-right text-red-400">{totals.percentAVencerAvg.toFixed(2)}%</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidTotal)}</td>
                      <td className="p-2 text-right text-amber-400">{totals.percentBidTotalAvg.toFixed(2)}%</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidFree)}</td>
                      <td className="p-2 text-right text-slate-400">{totals.percentBidFreeAvg.toFixed(2)}%</td>
                      <td className="p-2 text-right bg-slate-800 print:bg-transparent">{formatNumber(totals.creditAtContemplation)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidEmbedded)}</td>
                      <td className="p-2 text-right text-orange-400">{totals.percentBidEmbeddedAvg.toFixed(2)}%</td>
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
                  <h3 className="font-bold mb-4">Editar Campo</h3>
                  <input autoFocus type="text" value={editValue} onChange={e => setEditValue(e.target.value)} className="w-full border p-2 rounded mb-4" placeholder="0,00" />
                  <div className="flex gap-2">
                      <button onClick={() => setEditingId(null)} className="flex-1 p-2 border rounded">Cancelar</button>
                      <button onClick={handleSaveEdit} className="flex-1 p-2 bg-emerald-600 text-white rounded">Salvar</button>
                  </div>
              </div>
          </div>
      )}

      {showUpdateModal && (
        <CreditUpdateModal 
          quotaId={showUpdateModal} 
          onClose={() => setShowUpdateModal(null)} 
        />
      )}

      <SendEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={handleSendEmail}
        defaultRecipient={smtpConfig?.reportRecipient || ''}
        defaultSubject={`Relatório por Cota - ${referenceDate}`}
        availableColumns={availableColumns}
        currentFilters={{
          referenceDate,
          companyId: globalFilters.companyId,
          administratorId: globalFilters.administratorId,
          productType: globalFilters.productType
        }}
        companies={companies}
        administrators={administrators}
      />
    </div>
  );
};

const CreditUpdateModal = ({ quotaId, onClose }: { quotaId: string, onClose: () => void }) => {
  const { allCreditUpdates, addCreditUpdate, deleteCreditUpdate, quotas } = useConsortium();
  const [date, setDate] = useState(getTodayStr());
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const quota = quotas.find(q => q.id === quotaId);
  const updates = allCreditUpdates
    .filter(u => u.quotaId === quotaId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const handleAdd = async () => {
    const numVal = parseFloat(value.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numVal)) return;

    setIsSaving(true);
    try {
      await addCreditUpdate({
        id: crypto.randomUUID(),
        quotaId,
        date,
        value: numVal
      });
      setValue('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Histórico de Aplicação Financeira</h3>
            <p className="text-xs text-slate-500">Cota: {quota?.group} / {quota?.quotaNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-slate-100 bg-white">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data da Atualização</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Valor da Atualização</label>
              <input 
                type="text" 
                value={value} 
                onChange={e => setValue(e.target.value)}
                placeholder="0,00"
                className="w-full border border-slate-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>
          <button 
            onClick={handleAdd}
            disabled={isSaving || !value}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader size={16} className="animate-spin" /> : <DollarSign size={16} />}
            Adicionar Atualização
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3">Lançamentos Anteriores</h4>
          {updates.length === 0 ? (
            <div className="text-center py-8 text-slate-400 italic text-sm">Nenhum lançamento encontrado.</div>
          ) : (
            <div className="space-y-2">
              {updates.map((u, idx) => (
                <div key={u.id} className={`flex items-center justify-between p-3 rounded-xl border ${idx === 0 ? 'bg-emerald-50 border-emerald-100 ring-1 ring-emerald-500/20' : 'bg-white border-slate-200'}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">{formatNumber(u.value)}</p>
                      {idx === 0 && <span className="text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase">Atual</span>}
                    </div>
                    <p className="text-[10px] text-slate-500">{new Date(u.date + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                  </div>
                  <button 
                    onClick={() => deleteCreditUpdate(u.id)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 text-center">
          <button onClick={onClose} className="text-sm font-bold text-slate-600 hover:text-slate-800">Fechar</button>
        </div>
      </div>
    </div>
  );
};

export default Reports;