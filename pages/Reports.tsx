import React, { useEffect, useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule, calculateCDICorrection, calculateCurrentCreditValue } from '../services/calculationService';
import { db } from '../services/database';
import { FileBarChart, Loader, AlertTriangle, Filter, CheckCircle2, Clock, Sheet, Calendar, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, Printer } from 'lucide-react';

interface ReportRow {
  id: string;
  group: string;
  quotaNumber: string;
  creditValue: number;
  isContemplated: boolean;
  administratorId?: string;
  companyId?: string;

  saldoAVencer: number; 
  percentAVencer: number;
  saldoVencido: number; 
  percentVencido: number;

  bidTotal: number;
  percentBidTotal: number;
  bidFree: number;
  bidEmbedded: number;
  
  creditAtContemplation: number; 
  valorRealCarta: number; 
  creditManualAdjustment: number;
  creditoTotal: number;
  bidFreeCorrection: number;
  creditoUtilizado: number;
  saldoDisponivel: number;
}

const Reports = () => {
  const { quotas, indices, updateQuota, administrators, companies, allCreditUsages } = useConsortium();
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<{ id: string, field: 'credit' } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [filterAdmin, setFilterAdmin] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); 
  const [referenceDate, setReferenceDate] = useState(new Date().toISOString().split('T')[0]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ReportRow, direction: 'asc' | 'desc' } | null>(null);

  const formatNumber = (val: number) => val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  useEffect(() => {
    const buildReport = async () => {
      setLoading(true);
      const refDateStr = referenceDate;
      const refDate = new Date(refDateStr + 'T23:59:59');

      try {
        const allPayments = await db.getAllPaymentsDictionary();
        const rows = quotas.map(quota => {
          const schedule = generateSchedule(quota, indices);
          
          let vlrCartaAtual = quota.creditValue;
          if (schedule.length > 0) {
             const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= refDateStr);
             vlrCartaAtual = pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue : quota.creditValue;
          }

          let sumVencido = 0;
          let sumAVencer = 0;
          const paymentMap = allPayments[quota.id] || {};

          schedule.forEach(inst => {
              const instDateStr = inst.dueDate.split('T')[0];
              const isMatured = instDateStr <= refDateStr;
              const paymentData = paymentMap[inst.installmentNumber];

              if (isMatured) {
                  const fine = paymentData?.manualFine || inst.manualFine || 0;
                  const interest = paymentData?.manualInterest || inst.manualInterest || 0;
                  sumVencido += inst.commonFund + inst.reserveFund + inst.adminFee + fine + interest;
              } else {
                  sumAVencer += inst.commonFund + inst.reserveFund + inst.adminFee;
              }

              if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
                  sumVencido += (inst.bidAbatementFC || 0) + (inst.bidAbatementFR || 0) + (inst.bidAbatementTA || 0);
              }
          });

          const totalContractValue = sumVencido + sumAVencer || 1;
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
            administratorId: quota.administratorId,
            companyId: quota.companyId,
            saldoAVencer: sumAVencer,
            percentAVencer: (sumAVencer / totalContractValue) * 100,
            saldoVencido: sumVencido,
            percentVencido: (sumVencido / totalContractValue) * 100,
            bidTotal: quota.bidTotal || 0,
            percentBidTotal: vlrCartaAtual > 0 ? ((quota.bidTotal || 0) / vlrCartaAtual) * 100 : 0,
            bidFree: quota.bidFree || 0,
            bidEmbedded: bidEmbedded,
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
    const normalizedValue = editValue.replace(/\./g, '').replace(',', '.');
    const newVal = parseFloat(normalizedValue);
    if (isNaN(newVal)) { setEditingId(null); return; }
    const quota = quotas.find(q => q.id === editingId.id);
    if (quota) {
      try {
        await updateQuota({ ...quota, creditManualAdjustment: newVal });
        setEditingId(null);
      } catch (error) { setSaveError("Erro ao salvar."); }
    }
  };

  const filteredData = reportData.filter(row => {
    const matchAdmin = !filterAdmin || row.administratorId === filterAdmin;
    const matchComp = !filterCompany || row.companyId === filterCompany;
    let matchStatus = true;
    if (filterStatus === 'CONTEMPLATED') matchStatus = row.isContemplated;
    else if (filterStatus === 'ACTIVE') matchStatus = !row.isContemplated;
    return matchAdmin && matchComp && matchStatus;
  });

  const sortedData = useMemo(() => {
    let items = [...filteredData];
    if (sortConfig) {
      items.sort((a, b) => {
        if (sortConfig.key === 'quotaNumber') {
          return sortConfig.direction === 'asc' ? (parseInt(a.quotaNumber) - parseInt(b.quotaNumber)) : (parseInt(b.quotaNumber) - parseInt(a.quotaNumber));
        }
        return sortConfig.direction === 'asc' ? (a[sortConfig.key] > b[sortConfig.key] ? 1 : -1) : (a[sortConfig.key] < b[sortConfig.key] ? 1 : -1);
      });
    }
    return items;
  }, [filteredData, sortConfig]);

  const totals = sortedData.reduce((acc, row) => ({
    saldoAVencer: acc.saldoAVencer + row.saldoAVencer,
    saldoVencido: acc.saldoVencido + row.saldoVencido,
    bidTotal: acc.bidTotal + row.bidTotal,
    bidEmbedded: acc.bidEmbedded + row.bidEmbedded,
    creditAtContemplation: acc.creditAtContemplation + row.creditAtContemplation,
    valorRealCarta: acc.valorRealCarta + row.valorRealCarta,
    creditoTotal: acc.creditoTotal + row.creditoTotal,
    creditoUtilizado: acc.creditoUtilizado + row.creditoUtilizado,
    saldoDisponivel: acc.saldoDisponivel + row.saldoDisponivel,
    creditManualAdjustment: acc.creditManualAdjustment + row.creditManualAdjustment,
    bidFreeCorrection: acc.bidFreeCorrection + row.bidFreeCorrection
  }), { saldoAVencer: 0, saldoVencido: 0, bidTotal: 0, bidEmbedded: 0, creditAtContemplation: 0, valorRealCarta: 0, creditoTotal: 0, creditoUtilizado: 0, saldoDisponivel: 0, creditManualAdjustment: 0, bidFreeCorrection: 0 });

  const SortHeader = ({ label, sortKey, align = 'right', className = '' }: { label: string, sortKey: keyof ReportRow, align?: 'left'|'right', className?: string }) => (
      <th className={`px-2 py-3 cursor-pointer hover:bg-slate-800 transition-colors group select-none ${className} ${align === 'right' ? 'text-right' : 'text-left'}`} onClick={() => setSortConfig({ key: sortKey, direction: sortConfig?.key === sortKey && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>{label} <ArrowUpDown size={10} className="opacity-30 group-hover:opacity-100" /></div>
      </th>
  );

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 pb-10 print:p-0 print:space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-800 print:text-xl">Relatório por Cota</h1>
           <p className="text-slate-500 print:text-xs">Acompanhamento de saldos, lances e créditos disponíveis em {referenceDate}.</p>
        </div>
        <button onClick={handlePrint} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-medium print:hidden flex items-center gap-2">
           <Printer size={18} /> Imprimir Relatório
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Data Fechamento</label><input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none" /></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Empresa</label><select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Administradora</label><select value={filterAdmin} onChange={(e) => setFilterAdmin(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">{administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}<option value="">Todas</option></select></div>
          <div><label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Status</label><select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none"><option value="">Todas</option><option value="CONTEMPLATED">Contempladas</option><option value="ACTIVE">Em Andamento</option></select></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
              { label: 'Valor Pago', value: totals.saldoVencido, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Valor a Pagar', value: totals.saldoAVencer, color: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Total Lances', value: totals.bidTotal, color: 'text-amber-700', bg: 'bg-amber-50' },
              { label: 'Crédito Contemp.', value: totals.creditAtContemplation, color: 'text-slate-600', bg: 'bg-slate-50' },
              { label: 'Vlr Carta Líq.', value: totals.valorRealCarta, color: 'text-blue-700', bg: 'bg-blue-50' },
              { label: 'Crédito Total', value: totals.creditoTotal, color: 'text-slate-800', bg: 'bg-slate-100' },
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
                  <SortHeader label="Crédito" sortKey="creditAtContemplation" className="bg-slate-700 print:bg-slate-700" />
                  <SortHeader label="Lance Emb." sortKey="bidEmbedded" />
                  <SortHeader label="Vlr Líquido" sortKey="valorRealCarta" className="font-bold" />
                  <SortHeader label="Ajuste" sortKey="creditManualAdjustment" />
                  <SortHeader label="92% CDI" sortKey="bidFreeCorrection" />
                  <SortHeader label="Créd. Total" sortKey="creditoTotal" className="bg-slate-700 font-bold print:bg-slate-700" />
                  <SortHeader label="Utilizado" sortKey="creditoUtilizado" />
                  <SortHeader label="Saldo Disp." sortKey="saldoDisponivel" className="bg-emerald-900 border-l border-emerald-700 font-bold print:bg-emerald-900" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (<tr><td colSpan={15} className="p-10 text-center"><Loader className="animate-spin mx-auto mb-2" /> Carregando dados...</td></tr>) : 
                 sortedData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.group}</td>
                    <td className="p-2 font-bold text-slate-700 sticky left-[50px] bg-white border-r border-slate-100 shadow-sm print:static print:bg-transparent">{row.quotaNumber}</td>
                    <td className="p-2 text-right">{formatNumber(row.creditValue)}</td>
                    <td className="p-2 text-right font-medium text-emerald-700 bg-emerald-50/30 print:bg-transparent">{formatNumber(row.saldoVencido)}</td>
                    <td className="p-2 text-right font-medium text-red-600 bg-red-50/30 print:bg-transparent">{formatNumber(row.saldoAVencer)}</td>
                    <td className="p-2 text-right font-medium text-amber-600 bg-amber-50/30 print:bg-transparent">{formatNumber(row.bidTotal)}</td>
                    <td className="p-2 text-right text-amber-500 font-bold">{row.percentBidTotal.toFixed(2)}%</td>
                    <td className="p-2 text-right font-bold bg-slate-50/80 print:bg-transparent">{formatNumber(row.creditAtContemplation)}</td>
                    <td className="p-2 text-right text-orange-600">{formatNumber(row.bidEmbedded)}</td>
                    <td className="p-2 text-right font-bold text-blue-700 bg-blue-50/30 print:bg-transparent">{formatNumber(row.valorRealCarta)}</td>
                    <td className="p-2 text-right text-blue-600 cursor-pointer print:cursor-default" onClick={() => { setEditingId({id: row.id, field: 'credit'}); setEditValue(row.creditManualAdjustment.toString().replace('.',',')); }}>{formatNumber(row.creditManualAdjustment)}</td>
                    <td className="p-2 text-right text-violet-600">{formatNumber(row.bidFreeCorrection)}</td>
                    <td className="p-2 text-right font-bold bg-slate-50 print:bg-transparent">{formatNumber(row.creditoTotal)}</td>
                    <td className="p-2 text-right text-amber-700">{formatNumber(row.creditoUtilizado)}</td>
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50 border-l border-emerald-100 print:bg-transparent">{formatNumber(row.saldoDisponivel)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold text-[9px] uppercase print:bg-slate-900">
                  <tr>
                      <td className="p-2 sticky left-0 bg-slate-900 border-r border-slate-700 print:static print:bg-transparent" colSpan={2}>Totais ({sortedData.length})</td>
                      <td className="p-2 text-right"></td>
                      <td className="p-2 text-right">{formatNumber(totals.saldoVencido)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.saldoAVencer)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidTotal)}</td>
                      <td className="p-2 text-right"></td>
                      <td className="p-2 text-right bg-slate-800 print:bg-transparent">{formatNumber(totals.creditAtContemplation)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidEmbedded)}</td>
                      <td className="p-2 text-right bg-blue-900/40 print:bg-transparent">{formatNumber(totals.valorRealCarta)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.creditManualAdjustment)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.bidFreeCorrection)}</td>
                      <td className="p-2 text-right bg-slate-800 print:bg-transparent">{formatNumber(totals.creditoTotal)}</td>
                      <td className="p-2 text-right">{formatNumber(totals.creditoUtilizado)}</td>
                      <td className="p-2 text-right bg-emerald-950 print:bg-transparent">{formatNumber(totals.saldoDisponivel)}</td>
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