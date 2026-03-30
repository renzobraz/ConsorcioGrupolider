import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { JSDOM } from 'jsdom';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';

export async function generateReportPdf(data: any[], columns: any[], title: string, summary?: any, dateStr?: string) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  (global as any).window = dom.window;
  (global as any).document = dom.window.document;
  (global as any).HTMLCanvasElement = dom.window.HTMLCanvasElement;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(30, 41, 59);
  doc.text(title, 14, 15);
  
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const displayDate = dateStr ? formatDate(dateStr) : new Date().toLocaleDateString('pt-BR');
  doc.text(`Acompanhamento de saldos, lances e créditos em ${displayDate}`, 14, 22);

  let currentY = 28;

  // Summary Cards
  if (summary) {
    const cardWidth = 42;
    const cardHeight = 15;
    const gap = 2;
    let startX = 14;
    let currentX = startX;

    const cards = [
      { label: 'Quantidade de Cotas', value: summary.count.toString(), color: [71, 85, 105] },
      { label: 'Valor Total (Crédito)', value: formatNumber(summary.creditValue), color: [71, 85, 105] },
      { label: 'TOTAL PAGO', value: formatNumber(summary.paid), color: [5, 150, 105] },
      { label: 'Saldo Devedor (Total)', value: formatNumber(summary.toPay), color: [220, 38, 38] },
      { label: 'Lance Livre (Total)', value: formatNumber(summary.bids), color: [180, 83, 9] },
      { label: 'Crédito total Bruto', value: formatNumber(summary.creditBruto), color: [71, 85, 105] },
      { label: 'Crédito Total Líquido', value: formatNumber(summary.creditLiquido), color: [29, 78, 216] },
      { label: 'Crédito Total Com Aplicação', value: formatNumber(summary.creditTotal), color: [30, 41, 59] },
      { label: 'Crédito Utilizado', value: formatNumber(summary.creditUsed), color: [194, 65, 12] },
      { label: 'Crédito Total Disponível', value: formatNumber(summary.creditAvailable), color: [6, 95, 70] },
      { label: 'Créditos Disponível Utilização', value: formatNumber(summary.creditContemplatedAvailable), color: [55, 48, 163] },
    ];

    cards.forEach((card, index) => {
      if (index === 6) {
        currentY += cardHeight + gap;
        currentX = startX;
      }

      // Card Background
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(currentX, currentY, cardWidth, cardHeight, 1, 1, 'F');
      
      // Card Label
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(card.label, currentX + 2, currentY + 5);
      
      // Card Value
      doc.setFontSize(7);
      doc.setTextColor(card.color[0], card.color[1], card.color[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(String(card.value), currentX + 2, currentY + 11);
      doc.setFont('helvetica', 'normal');

      currentX += cardWidth + gap;
    });

    currentY += cardHeight + 5;
  }

  const tableColumn = columns.map(col => col.header);
  const tableRows = data.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      if (col.type === 'currency') return formatCurrency(value || 0);
      if (col.type === 'number') return formatNumber(value || 0);
      if (col.type === 'date') return value ? formatDate(value) : '-';
      if (col.type === 'percent') return `${formatNumber(value || 0)}%`;
      return value || '-';
    });
  });

  // Add Totals Row if summary exists
  if (summary) {
    const totalsRow = columns.map(col => {
      if (col.key === 'group') return 'TOTAIS';
      if (col.key === 'saldoVencido') return formatNumber(summary.paid);
      if (col.key === 'saldoAVencer') return formatNumber(summary.toPay);
      if (col.key === 'bidTotal') return formatNumber(summary.bids);
      if (col.key === 'creditAtContemplation') return formatNumber(summary.creditBruto);
      if (col.key === 'valorRealCarta') return formatNumber(summary.creditLiquido);
      if (col.key === 'creditoTotal') return formatNumber(summary.creditTotal);
      if (col.key === 'creditoUtilizado') return formatNumber(summary.creditUsed);
      if (col.key === 'saldoDisponivel') return formatNumber(summary.creditAvailable);
      return '';
    });
    tableRows.push(totalsRow);
  }

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: currentY,
    theme: 'grid',
    styles: { fontSize: columns.length > 12 ? 5 : 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: columns.reduce((acc, col, index) => {
      if (col.type === 'currency' || col.type === 'number' || col.type === 'percent') {
        acc[index] = { halign: 'right' };
      }
      return acc;
    }, {} as any),
    didParseCell: (data) => {
      const header = data.column.raw as string;
      if (data.section === 'body') {
        if (header === 'Valor Pago') data.cell.styles.textColor = [5, 150, 105];
        if (header === 'Valor a Pagar') data.cell.styles.textColor = [220, 38, 38];
        if (header === 'Lance Tot.') data.cell.styles.textColor = [180, 83, 9];
        if (header === 'Crédito Total Líquido') data.cell.styles.textColor = [29, 78, 216];
        if (header === 'Crédito Total Disponível') data.cell.styles.textColor = [6, 95, 70];

        // Highlight Totals Row
        if (summary && data.row.index === tableRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    }
  });

  return doc.output('arraybuffer');
}
