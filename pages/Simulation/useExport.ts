import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quota, Administrator, ProjectionConfig, PaymentInstallment } from '../../types';
import { formatDate, formatNumber, formatCurrency } from '../../utils/formatters';

interface UseExportParams {
  currentQuota: Quota | null;
  installments: PaymentInstallment[];
  payments: Record<number, any>;
  administrators: Administrator[];
  projectionConfig: ProjectionConfig;
  currentAvgRate: number;
}

export function useExport({
  currentQuota, installments, payments, administrators, projectionConfig, currentAvgRate
}: UseExportParams) {

  const exportToExcel = () => {
    if (!currentQuota || !installments.length) return;

    const rows: any[] = [];
    installments.forEach(inst => {
      if (inst.correctionApplied) {
        rows.push({
          'P': 'CORR', 'Vencimento': inst.correctionIndexName || 'REAJUSTE',
          'Crédito': inst.correctedCreditValue, 'FC Mensal': inst.correctionAmountFC,
          '% FC': (inst.correctionFactor || 0) * 100, 'TA Mensal': inst.correctionAmountTA,
          '% TA': (inst.correctionFactor || 0) * 100, 'FR Mensal': inst.correctionAmountFR,
          '% FR': (inst.correctionFactor || 0) * 100, 'Seguro': 0, 'Amort.': 0,
          'Multa': 0, 'Juros': 0, 'Extra/Rend.': 0, 'Lance Livre': 0, 'Lance Emb.': 0,
          'Lance Total': 0, 'Abat. FC': 0, 'Abat. FR': 0, 'Abat. TA': 0, 'Data Lance': '',
          'Total': inst.correctionAmountTotal, 'Vlr Pago': 0, 'Data Pagto': '', 'Status': 'AJUSTE',
          'Saldo FC': inst.correctionBalanceFC, '% Saldo FC': inst.correctionPercentBalanceFC,
          'Saldo TA': inst.correctionBalanceTA, '% Saldo TA': inst.correctionPercentBalanceTA,
          'Saldo FR': inst.correctionBalanceFR, '% Saldo FR': inst.correctionPercentBalanceFR,
          'Saldo Devedor': inst.correctionBalanceTotal, '% Saldo Total': inst.correctionPercentBalanceTotal
        });
      }
      if ((inst.bidEmbeddedApplied || 0) > 0) {
        const bidPayment = payments[-1];
        rows.push({
          'P': 'LANCE', 'Vencimento': 'EMBUTIDO', 'Crédito': inst.correctedCreditValue,
          'FC Mensal': -inst.bidEmbeddedAbatementFC!, '% FC': -inst.bidEmbeddedPercentFC!,
          'TA Mensal': -inst.bidEmbeddedAbatementTA!, '% TA': -inst.bidEmbeddedPercentTA!,
          'FR Mensal': -inst.bidEmbeddedAbatementFR!, '% FR': -inst.bidEmbeddedPercentFR!,
          'Seguro': 0, 'Amort.': 0, 'Multa': 0, 'Juros': 0, 'Extra/Rend.': 0, 'Lance Livre': 0,
          'Lance Emb.': inst.bidEmbeddedApplied, 'Lance Total': inst.bidEmbeddedApplied,
          'Abat. FC': inst.bidEmbeddedAbatementFC, 'Abat. FR': inst.bidEmbeddedAbatementFR,
          'Abat. TA': inst.bidEmbeddedAbatementTA,
          'Data Lance': formatDate(bidPayment?.paymentDate || inst.bidDate),
          'Total': -inst.bidEmbeddedApplied!,
          'Vlr Pago': bidPayment?.status === 'PAGO' ? inst.bidEmbeddedApplied : 0,
          'Data Pagto': formatDate(bidPayment?.paymentDate), 'Status': bidPayment?.status || 'LANCE',
          'Saldo FC': inst.bidEmbeddedBalanceFC, '% Saldo FC': inst.bidEmbeddedPercentBalanceFC,
          'Saldo TA': inst.bidEmbeddedBalanceTA, '% Saldo TA': inst.bidEmbeddedPercentBalanceTA,
          'Saldo FR': inst.bidEmbeddedBalanceFR, '% Saldo FR': inst.bidEmbeddedPercentBalanceFR,
          'Saldo Devedor': inst.bidEmbeddedBalanceTotal, '% Saldo Total': inst.bidEmbeddedPercentBalanceTotal
        });
      }
      if ((inst.bidFreeApplied || 0) > 0) {
        const bidPayment = payments[0];
        rows.push({
          'P': 'LANCE', 'Vencimento': 'LIVRE', 'Crédito': inst.correctedCreditValue,
          'FC Mensal': -inst.bidFreeAbatementFC!, '% FC': -inst.bidFreePercentFC!,
          'TA Mensal': -inst.bidFreeAbatementTA!, '% TA': -inst.bidFreePercentTA!,
          'FR Mensal': -inst.bidFreeAbatementFR!, '% FR': -inst.bidFreePercentFR!,
          'Seguro': 0, 'Amort.': 0, 'Multa': 0, 'Juros': 0, 'Extra/Rend.': 0,
          'Lance Livre': inst.bidFreeApplied, 'Lance Emb.': 0, 'Lance Total': inst.bidFreeApplied,
          'Abat. FC': inst.bidFreeAbatementFC, 'Abat. FR': inst.bidFreeAbatementFR,
          'Abat. TA': inst.bidFreeAbatementTA,
          'Data Lance': formatDate(bidPayment?.paymentDate || inst.bidDate),
          'Total': -inst.bidFreeApplied!,
          'Vlr Pago': bidPayment?.status === 'PAGO' ? inst.bidFreeApplied : 0,
          'Data Pagto': formatDate(bidPayment?.paymentDate), 'Status': bidPayment?.status || 'LANCE',
          'Saldo FC': inst.bidFreeBalanceFC, '% Saldo FC': inst.bidFreePercentBalanceFC,
          'Saldo TA': inst.bidFreeBalanceTA, '% Saldo TA': inst.bidFreePercentBalanceTA,
          'Saldo FR': inst.bidFreeBalanceFR, '% Saldo FR': inst.bidFreePercentBalanceFR,
          'Saldo Devedor': inst.bidFreeBalanceTotal, '% Saldo Total': inst.bidFreePercentBalanceTotal
        });
      }
      rows.push({
        'P': inst.installmentNumber === 0 ? '000' : inst.installmentNumber,
        'Vencimento': formatDate(inst.dueDate), 'Crédito': inst.correctedCreditValue,
        'FC Mensal': inst.commonFund, '% FC': inst.monthlyRateFC,
        'TA Mensal': inst.adminFee, '% TA': inst.monthlyRateTA,
        'FR Mensal': inst.reserveFund, '% FR': inst.monthlyRateFR,
        'Seguro': inst.insurance, 'Amort.': inst.amortization,
        'Multa': inst.manualFine || 0, 'Juros': inst.manualInterest || 0,
        'Extra/Rend.': inst.manualEarnings || 0,
        'Lance Livre': 0, 'Lance Emb.': 0, 'Lance Total': 0,
        'Abat. FC': 0, 'Abat. FR': 0, 'Abat. TA': 0, 'Data Lance': '',
        'Total': inst.totalInstallment, 'Vlr Pago': inst.realAmountPaid || 0,
        'Data Pagto': formatDate(inst.paymentDate), 'Status': inst.status,
        'Saldo FC': inst.balanceFC, '% Saldo FC': inst.percentBalanceFC,
        'Saldo TA': inst.balanceTA, '% Saldo TA': inst.percentBalanceTA,
        'Saldo FR': inst.balanceFR, '% Saldo FR': inst.percentBalanceFR,
        'Saldo Devedor': inst.balanceTotal, '% Saldo Total': inst.percentBalanceTotal
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    if (projectionConfig.enabled) {
      const note = `* VALORES PROJETADOS: Simulação com base em ${projectionConfig.customRate ? `taxa fixa de ${projectionConfig.customRate}% a.a.` : `média de ${projectionConfig.periodMonths} meses (${currentAvgRate.toFixed(4)}% a.m.)`}.`;
      XLSX.utils.sheet_add_aoa(ws, [['']], { origin: -1 });
      XLSX.utils.sheet_add_aoa(ws, [[note]], { origin: -1 });
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
    XLSX.writeFile(wb, `Extrato_${currentQuota.group}_${currentQuota.quotaNumber}.xlsx`);
  };

  const exportToPDF = () => {
    if (!currentQuota || !installments.length) return;

    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text(`Extrato de Consórcio - Grupo: ${currentQuota.group} Cota: ${currentQuota.quotaNumber}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Administradora: ${administrators.find(a => a.id === currentQuota.administratorId)?.name || 'N/A'}`, 14, 22);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 14, 27);

    const tableColumn = [
      'P', 'Vencimento', 'Crédito', 'FC', 'TA', 'FR', 'Seguro', 'Amort.',
      'Multa', 'Juros', 'Extra', 'L. Livre', 'L. Emb', 'Abat. FC', 'Abat. FR', 'Abat. TA',
      'Total', 'Vlr Pago', 'Data Pagto', 'Status',
      'Saldo FC', 'Saldo TA', 'Saldo FR', 'Saldo Dev'
    ];
    const tableRows: any[] = [];

    installments.forEach(inst => {
      if (inst.correctionApplied) {
        tableRows.push([
          'CORR', inst.correctionIndexName || 'REAJUSTE', formatNumber(inst.correctedCreditValue),
          formatNumber(inst.correctionAmountFC), formatNumber(inst.correctionAmountTA),
          formatNumber(inst.correctionAmountFR),
          '-', '-', '-', '-', '-', '-', '-', '-', '-', '-',
          formatNumber(inst.correctionAmountTotal), '-', '-', 'AJUSTE',
          formatNumber(inst.correctionBalanceFC), formatNumber(inst.correctionBalanceTA),
          formatNumber(inst.correctionBalanceFR), formatNumber(inst.correctionBalanceTotal)
        ]);
      }
      if ((inst.bidEmbeddedApplied || 0) > 0) {
        const bidPayment = payments[-1];
        tableRows.push([
          'LANCE', 'EMBUTIDO', formatNumber(inst.correctedCreditValue),
          `(${formatNumber(inst.bidEmbeddedAbatementFC)})`,
          `(${formatNumber(inst.bidEmbeddedAbatementTA)})`,
          `(${formatNumber(inst.bidEmbeddedAbatementFR)})`,
          '-', '-', '-', '-', '-', '-',
          formatNumber(inst.bidEmbeddedApplied),
          formatNumber(inst.bidEmbeddedAbatementFC), formatNumber(inst.bidEmbeddedAbatementFR),
          formatNumber(inst.bidEmbeddedAbatementTA),
          `(${formatNumber(inst.bidEmbeddedApplied)})`,
          bidPayment?.status === 'PAGO' ? formatNumber(inst.bidEmbeddedApplied) : '-',
          formatDate(bidPayment?.paymentDate), bidPayment?.status || 'LANCE',
          formatNumber(inst.bidEmbeddedBalanceFC), formatNumber(inst.bidEmbeddedBalanceTA),
          formatNumber(inst.bidEmbeddedBalanceFR), formatNumber(inst.bidEmbeddedBalanceTotal)
        ]);
      }
      if ((inst.bidFreeApplied || 0) > 0) {
        const bidPayment = payments[0];
        tableRows.push([
          'LANCE', 'LIVRE', formatNumber(inst.correctedCreditValue),
          `(${formatNumber(inst.bidFreeAbatementFC)})`,
          `(${formatNumber(inst.bidFreeAbatementTA)})`,
          `(${formatNumber(inst.bidFreeAbatementFR)})`,
          '-', '-', '-', '-', '-',
          formatNumber(inst.bidFreeApplied), '-',
          formatNumber(inst.bidFreeAbatementFC), formatNumber(inst.bidFreeAbatementFR),
          formatNumber(inst.bidFreeAbatementTA),
          `(${formatNumber(inst.bidFreeApplied)})`,
          bidPayment?.status === 'PAGO' ? formatNumber(inst.bidFreeApplied) : '-',
          formatDate(bidPayment?.paymentDate), bidPayment?.status || 'LANCE',
          formatNumber(inst.bidFreeBalanceFC), formatNumber(inst.bidFreeBalanceTA),
          formatNumber(inst.bidFreeBalanceFR), formatNumber(inst.bidFreeBalanceTotal)
        ]);
      }
      tableRows.push([
        inst.installmentNumber === 0 ? '000' : inst.installmentNumber,
        formatDate(inst.dueDate), formatNumber(inst.correctedCreditValue),
        formatNumber(inst.commonFund), formatNumber(inst.adminFee), formatNumber(inst.reserveFund),
        formatNumber(inst.insurance), formatNumber(inst.amortization),
        formatNumber(inst.manualFine || 0), formatNumber(inst.manualInterest || 0),
        formatNumber(inst.manualEarnings || 0),
        '-', '-', '-', '-', '-',
        formatNumber(inst.totalInstallment), formatNumber(inst.realAmountPaid || 0),
        formatDate(inst.paymentDate), inst.status,
        formatNumber(inst.balanceFC), formatNumber(inst.balanceTA),
        formatNumber(inst.balanceFR), formatNumber(inst.balanceTotal)
      ]);
    });

    autoTable(doc, {
      head: [tableColumn], body: tableRows, startY: 40, theme: 'grid',
      styles: { fontSize: 4.5, cellPadding: 0.3 },
      headStyles: { fillColor: [16, 185, 129] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 17: { cellWidth: 12 } }
    });

    if (projectionConfig.enabled) {
      const note = `* VALORES PROJETADOS: Simulação com base em ${projectionConfig.customRate ? `taxa fixa de ${projectionConfig.customRate}% a.a.` : `média de ${projectionConfig.periodMonths} meses (${currentAvgRate.toFixed(4)}% a.m.)`}.`;
      autoTable(doc, {
        body: [[note]],
        startY: (doc as any).lastAutoTable.finalY + 5,
        theme: 'plain',
        styles: { fontSize: 6, textColor: [180, 83, 9], fontStyle: 'bold' }
      });
    }

    doc.save(`Extrato_${currentQuota.group}_${currentQuota.quotaNumber}.pdf`);
  };

  const handlePrint = () => window.print();

  return { exportToExcel, exportToPDF, handlePrint };
}
