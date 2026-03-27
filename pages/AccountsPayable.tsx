
import React, { useState, useMemo, useEffect } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { generateSchedule, calculateScheduleSummary } from '../services/calculationService';
import { db } from '../services/database';
import { PaymentStatus } from '../types';
import { formatCurrency, formatDate, formatPercent } from '../utils/formatters';
import { 
  CalendarClock, Search, Filter, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Download, FileText, Printer, Building2, Briefcase, BadgeCheck, Clock, AlertCircle,
  Check, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PayableInstallment {
  id: string;
  quotaId: string;
  group: string;
  quotaNumber: string;
  companyId?: string;
  administratorId?: string;
  productType?: string;
  quotaStatus?: string;
  
  installmentNumber: number;
  dueDate: string;
  creditValue: number;
  fc: number;
  ta: number;
  fr: number;
  insurance: number;
  amortization: number;
  fine: number;
  interest: number;
  extra: number;
  totalAmount: number;
  
  paidAmount: number;
  balanceFC: number;
  balanceTA: number;
  balanceFR: number;
  balanceTotal: number;
  
  status: string;
  isPaid: boolean;
}

const AccountsPayable = () => {
  const { quotas, companies, administrators, indices, globalFilters, setGlobalFilters } = useConsortium();
  const [installments, setInstallments] = useState<PayableInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Local Filters
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [quickFilter, setQuickFilter] = useState('MES_ATUAL');
  const [searchQuota, setSearchQuota] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'PENDING' | 'PAID' | 'ALL'>('PENDING');
  const [columnFilters, setColumnFilters] = useState({
    quotaNumber: '',
    group: '',
    installmentNumber: '',
  });
  const [showColumnFilters, setShowColumnFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PayableInstallment, direction: 'asc' | 'desc' } | null>({ key: 'dueDate', direction: 'asc' });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [effectuating, setEffectuating] = useState<PayableInstallment | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({
    status: 'PAGO',
    paymentDate: new Date().toISOString().split('T')[0],
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

  const loadData = async () => {
    setLoading(true);
    try {
      const allPayables: PayableInstallment[] = [];
      
      // Fetch all data in parallel to avoid N+1 queries
      const [allPayments, allManualTransactions] = await Promise.all([
        db.getAllPaymentsDictionary(),
        db.getAllManualTransactions()
      ]);
      
      console.log(`Loaded ${Object.keys(allPayments).length} quotas with payments.`);
      
      // Group manual transactions by quotaId for efficient access
      const manualTransactionsByQuota: Record<string, any[]> = {};
      allManualTransactions.forEach(tx => {
        if (!manualTransactionsByQuota[tx.quotaId]) {
          manualTransactionsByQuota[tx.quotaId] = [];
        }
        manualTransactionsByQuota[tx.quotaId].push(tx);
      });
      
      // Deduplicate quotas to prevent duplicate installments in the report
      const uniqueQuotas = Array.from(new Map(quotas.map(q => [q.id, q])).values()) as typeof quotas;
      
      for (const quota of uniqueQuotas) {
        const payments = allPayments[quota.id] || {};
        const manualTransactions = manualTransactionsByQuota[quota.id] || [];
        
        const schedule = generateSchedule({ ...quota, manualTransactions }, indices, payments);
        
        schedule.forEach(inst => {
          // Double check: if there's a payment record in our dictionary, it should probably be paid
          const paymentRecord = payments[inst.installmentNumber];
          const hasPaymentRecord = paymentRecord && 
            (['PAGO', 'EFETIVADO', 'QUITADO', 'CONCILIADO'].includes((paymentRecord.status || '').trim().toUpperCase()) || 
             (paymentRecord.amount && paymentRecord.amount > 0));

          const isPaid = inst.isPaid || !!hasPaymentRecord;
          const currentStatus = paymentRecord?.status || inst.status;

          allPayables.push({
            id: `${quota.id}-${inst.installmentNumber}-${inst.isManualTransaction ? 'manual' : 'regular'}`,
            quotaId: quota.id,
            group: quota.group,
            quotaNumber: quota.quotaNumber,
            companyId: quota.companyId,
            administratorId: quota.administratorId,
            productType: quota.productType,
            quotaStatus: quota.isContemplated ? 'CONTEMPLADA' : 'ATIVA',
            
            installmentNumber: inst.installmentNumber,
            dueDate: inst.dueDate.split('T')[0],
            creditValue: inst.correctedCreditValue || quota.creditValue,
            fc: inst.commonFund,
            ta: inst.adminFee,
            fr: inst.reserveFund,
            insurance: inst.insurance || 0,
            amortization: inst.amortization || 0,
            fine: inst.manualFine || 0,
            interest: inst.manualInterest || 0,
            extra: inst.manualEarnings || 0,
            totalAmount: inst.totalInstallment,
            
            paidAmount: inst.realAmountPaid || 0,
            balanceFC: inst.commonFund - (inst.manualFC || 0),
            balanceTA: inst.adminFee - (inst.manualTA || 0),
            balanceFR: inst.reserveFund - (inst.manualFR || 0),
            balanceTotal: inst.totalInstallment - (inst.realAmountPaid || 0),
            
            status: currentStatus,
            isPaid: isPaid
          });
        });
      }
      
      setInstallments(allPayables);
    } catch (err) {
      console.error("Error loading accounts payable:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [quotas, indices]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let start = '';
    let end = '';
    
    const formatDateStr = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (quickFilter) {
      case 'VENCIDOS':
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        end = formatDateStr(yesterday);
        break;
      case 'MES_ANTERIOR':
        const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        start = formatDateStr(firstDayLastMonth);
        end = formatDateStr(lastDayLastMonth);
        break;
      case 'DIA_ATUAL':
        start = formatDateStr(today);
        end = formatDateStr(today);
        break;
      case 'SEMANA_CORRENTE':
        const dayOfWeek = today.getDay(); // 0 is Sunday
        const firstDayWeek = new Date(today);
        firstDayWeek.setDate(today.getDate() - dayOfWeek);
        const lastDayWeek = new Date(firstDayWeek);
        lastDayWeek.setDate(firstDayWeek.getDate() + 6);
        start = formatDateStr(firstDayWeek);
        end = formatDateStr(lastDayWeek);
        break;
      case 'MES_ATUAL':
        const firstDayMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        start = formatDateStr(firstDayMonth);
        end = formatDateStr(lastDayMonth);
        break;
      case 'PROXIMO_MES':
        const firstDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const lastDayNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);
        start = formatDateStr(firstDayNextMonth);
        end = formatDateStr(lastDayNextMonth);
        break;
      case 'PROXIMOS_60':
        const sixtyDays = new Date(today);
        sixtyDays.setDate(today.getDate() + 60);
        start = formatDateStr(today);
        end = formatDateStr(sixtyDays);
        break;
      case 'TODAS':
      default:
        start = '';
        end = '';
        break;
    }
    
    setDateStart(start);
    setDateEnd(end);
  }, [quickFilter]);

  const filteredData = useMemo(() => {
    return installments.filter(item => {
      const matchCompany = !globalFilters.companyId || item.companyId === globalFilters.companyId;
      const matchAdmin = !globalFilters.administratorId || item.administratorId === globalFilters.administratorId;
      const matchProduct = !globalFilters.productType || item.productType === globalFilters.productType;
      const matchStatus = !globalFilters.status || item.quotaStatus === globalFilters.status;
      const matchQuota = !searchQuota || item.quotaNumber.includes(searchQuota) || item.group.includes(searchQuota);
      
      const matchDateStart = !dateStart || item.dueDate >= dateStart;
      const matchDateEnd = !dateEnd || item.dueDate <= dateEnd;
      
      const matchQuotaCol = !columnFilters.quotaNumber || item.quotaNumber.toLowerCase().includes(columnFilters.quotaNumber.toLowerCase());
      const matchGroupCol = !columnFilters.group || item.group.toLowerCase().includes(columnFilters.group.toLowerCase());
      const matchInstCol = !columnFilters.installmentNumber || item.installmentNumber.toString().includes(columnFilters.installmentNumber);

      const matchPaymentStatus = 
        paymentStatusFilter === 'ALL' ? true :
        paymentStatusFilter === 'PAID' ? item.isPaid :
        !item.isPaid;

      return matchCompany && matchAdmin && matchProduct && matchStatus && matchQuota && 
             matchDateStart && matchDateEnd && matchQuotaCol && matchGroupCol && matchInstCol &&
             matchPaymentStatus;
    });
  }, [installments, globalFilters, searchQuota, dateStart, dateEnd, columnFilters, paymentStatusFilter]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [filteredData, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredData, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const handleSort = (key: keyof PayableInstallment) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const openEffectuateModal = (inst: PayableInstallment) => {
    const toStr = (v: number) => v.toFixed(2).replace('.', ',');
    setEffectuating(inst);
    setPaymentFormData({
      status: 'PAGO',
      paymentDate: new Date().toISOString().split('T')[0],
      amount: toStr(inst.totalAmount),
      fc: toStr(inst.fc),
      fr: toStr(inst.fr),
      ta: toStr(inst.ta),
      insurance: toStr(inst.insurance),
      amortization: toStr(inst.amortization),
      fine: toStr(inst.fine),
      interest: toStr(inst.interest),
      manualEarnings: toStr(inst.extra)
    });
  };

  const handlePaymentFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'status' || name === 'paymentDate') {
      setPaymentFormData(prev => ({ ...prev, [name]: value }));
    } else {
      const sanitizedValue = value.replace(/[^0-9,.]/g, '');
      setPaymentFormData(prev => {
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

  const handleEffectuate = async () => {
    if (!effectuating) return;
    
    setProcessing(true);
    try {
      const parse = (v: string) => parseFloat(v.replace(',', '.')) || 0;
      
      await db.savePayment(effectuating.quotaId, effectuating.installmentNumber, {
        status: paymentFormData.status,
        paymentDate: paymentFormData.paymentDate,
        amount: parse(paymentFormData.amount),
        manualFC: parse(paymentFormData.fc),
        manualFR: parse(paymentFormData.fr),
        manualTA: parse(paymentFormData.ta),
        manualFine: parse(paymentFormData.fine),
        manualInterest: parse(paymentFormData.interest),
        manualInsurance: parse(paymentFormData.insurance),
        manualAmortization: parse(paymentFormData.amortization),
        manualEarnings: parse(paymentFormData.manualEarnings)
      });
      
      await loadData();
      setEffectuating(null);
    } catch (err) {
      console.error("Error effectuating payment:", err);
      alert("Erro ao efetivar pagamento. Tente novamente.");
    } finally {
      setProcessing(false);
    }
  };

  const exportToExcel = () => {
    const data = sortedData.map(item => ({
      'Cota': item.quotaNumber,
      'Grupo': item.group,
      'P': item.installmentNumber,
      'Vencimento': formatDate(item.dueDate),
      'Crédito': item.creditValue,
      'FC Mensal': item.fc,
      'TA Mensal': item.ta,
      'FR Mensal': item.fr,
      'Seguro': item.insurance,
      'Amort.': item.amortization,
      'Multa': item.fine,
      'Juros': item.interest,
      'Extra/Rend.': item.extra,
      'Vlr Pago': item.paidAmount,
      'Saldo FC': item.balanceFC,
      'Saldo TA': item.balanceTA,
      'Saldo FR': item.balanceFR,
      'Saldo Total': item.balanceTotal
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Pagar');
    XLSX.writeFile(wb, 'Contas_a_Pagar.xlsx');
  };

  const exportToPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.text('Relatório de Contas a Pagar', 14, 15);
    
    const tableData = sortedData.map(item => [
      `${item.group}/${item.quotaNumber}`,
      item.installmentNumber,
      formatDate(item.dueDate),
      formatCurrency(item.fc),
      formatCurrency(item.ta),
      formatCurrency(item.fr),
      formatCurrency(item.balanceTotal)
    ]);
    
    autoTable(doc, {
      head: [['Cota/Grupo', 'P', 'Vencimento', 'FC', 'TA', 'FR', 'Saldo Total']],
      body: tableData,
      startY: 20,
      styles: { fontSize: 8 }
    });
    
    doc.save('Contas_a_Pagar.pdf');
  };

  const totals = useMemo(() => {
    return sortedData.reduce((acc, curr) => ({
      total: acc.total + curr.totalAmount,
      balance: acc.balance + curr.balanceTotal,
      paid: acc.paid + curr.paidAmount,
      count: acc.count + 1
    }), { total: 0, balance: 0, paid: 0, count: 0 });
  }, [sortedData]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarClock className="text-emerald-600" /> Contas a Pagar
          </h1>
          <p className="text-slate-500">Visualização de parcelas do consórcio por período e status.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors" title="Exportar Excel">
            <Download size={20} />
          </button>
          <button onClick={exportToPDF} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors" title="Exportar PDF">
            <FileText size={20} />
          </button>
          <button onClick={() => window.print()} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors" title="Imprimir">
            <Printer size={20} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-8 gap-4 print:hidden">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Filtro Padrão</label>
          <select 
            value={quickFilter} 
            onChange={e => setQuickFilter(e.target.value)} 
            className="w-full bg-emerald-50 border border-emerald-200 rounded p-2 text-sm outline-none font-medium text-emerald-800"
          >
            <option value="VENCIDOS">Vencidos</option>
            <option value="MES_ANTERIOR">Mês Anterior</option>
            <option value="DIA_ATUAL">Dias Atual</option>
            <option value="SEMANA_CORRENTE">Semana corrente</option>
            <option value="MES_ATUAL">Mês atual</option>
            <option value="PROXIMO_MES">Próximo Mês</option>
            <option value="PROXIMOS_60">Próximos 60 dias</option>
            <option value="TODAS">Todas Datas</option>
            {quickFilter === 'CUSTOM' && <option value="CUSTOM">Personalizado</option>}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Status Pagamento</label>
          <select 
            value={paymentStatusFilter} 
            onChange={e => setPaymentStatusFilter(e.target.value as any)} 
            className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none font-medium text-slate-800"
          >
            <option value="PENDING">Pendentes</option>
            <option value="PAID">Efetivados</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Período Início</label>
          <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setQuickFilter('CUSTOM'); }} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Período Fim</label>
          <input type="date" value={dateEnd} onChange={e => { setDateEnd(e.target.value); setQuickFilter('CUSTOM'); }} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Empresa</label>
          <select value={globalFilters.companyId} onChange={e => setGlobalFilters({...globalFilters, companyId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">
            <option value="">Todas</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Administradora</label>
          <select value={globalFilters.administratorId} onChange={e => setGlobalFilters({...globalFilters, administratorId: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">
            <option value="">Todas</option>
            {administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Status Cota</label>
          <select value={globalFilters.status} onChange={e => setGlobalFilters({...globalFilters, status: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-sm outline-none">
            <option value="">Todos</option>
            <option value="ATIVA">Em Andamento</option>
            <option value="CONTEMPLADA">Contempladas</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Cota / Grupo</label>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchQuota} onChange={e => setSearchQuota(e.target.value)} placeholder="Buscar..." className="w-full bg-slate-50 border border-slate-200 rounded pl-8 pr-2 py-2 text-sm outline-none" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-full text-blue-600"><Clock size={24} /></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Total de Parcelas</p>
            <p className="text-2xl font-bold text-slate-800">{totals.count}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-full text-amber-600"><AlertCircle size={24} /></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Valor Total Bruto</p>
            <p className="text-2xl font-bold text-slate-800">{formatCurrency(totals.total)}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-full text-emerald-600"><BadgeCheck size={24} /></div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase">Saldo a Pagar</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(totals.balance)}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] text-left border-collapse">
            <thead className="bg-slate-800 text-white uppercase tracking-tighter">
              <tr>
                <th className="px-2 py-3">
                  <div className="flex items-center gap-1">
                    <span className="cursor-pointer hover:text-slate-300 flex items-center gap-1" onClick={() => handleSort('quotaNumber')}>
                      Número da conta {sortConfig?.key === 'quotaNumber' && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </span>
                    <button onClick={() => setShowColumnFilters(!showColumnFilters)} className="ml-auto text-slate-400 hover:text-emerald-400 transition-colors">
                      <Filter size={10} />
                    </button>
                  </div>
                  {showColumnFilters && (
                    <input 
                      type="text" 
                      value={columnFilters.quotaNumber}
                      onChange={(e) => setColumnFilters({...columnFilters, quotaNumber: e.target.value})}
                      placeholder="Filtrar..."
                      className="mt-1 w-full p-1 text-[9px] font-normal border border-slate-600 bg-slate-700 text-white rounded outline-none focus:ring-1 focus:ring-emerald-500 normal-case"
                    />
                  )}
                </th>
                <th className="px-2 py-3">
                  <div className="flex items-center gap-1">
                    <span className="cursor-pointer hover:text-slate-300 flex items-center gap-1" onClick={() => handleSort('group')}>
                      Grupo {sortConfig?.key === 'group' && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </span>
                  </div>
                  {showColumnFilters && (
                    <input 
                      type="text" 
                      value={columnFilters.group}
                      onChange={(e) => setColumnFilters({...columnFilters, group: e.target.value})}
                      placeholder="Filtrar..."
                      className="mt-1 w-full p-1 text-[9px] font-normal border border-slate-600 bg-slate-700 text-white rounded outline-none focus:ring-1 focus:ring-emerald-500 normal-case"
                    />
                  )}
                </th>
                <th className="px-2 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="cursor-pointer hover:text-slate-300 flex items-center gap-1" onClick={() => handleSort('installmentNumber')}>
                      P {sortConfig?.key === 'installmentNumber' && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                    </span>
                  </div>
                  {showColumnFilters && (
                    <input 
                      type="text" 
                      value={columnFilters.installmentNumber}
                      onChange={(e) => setColumnFilters({...columnFilters, installmentNumber: e.target.value})}
                      placeholder="Filtrar..."
                      className="mt-1 w-full p-1 text-[9px] font-normal border border-slate-600 bg-slate-700 text-white rounded outline-none focus:ring-1 focus:ring-emerald-500 normal-case text-center"
                    />
                  )}
                </th>
                <th onClick={() => handleSort('dueDate')} className="px-2 py-3 cursor-pointer hover:bg-slate-700 transition-colors">
                  <div className="flex items-center gap-1">Vencimento {sortConfig?.key === 'dueDate' && (sortConfig.direction === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}</div>
                </th>
                <th className="px-2 py-3 text-right">Crédito</th>
                <th className="px-2 py-3 text-right">FC Mensal (%)</th>
                <th className="px-2 py-3 text-right">TA Mensal (%)</th>
                <th className="px-2 py-3 text-right">FR Mensal (%)</th>
                <th className="px-2 py-3 text-right">Seguro</th>
                <th className="px-2 py-3 text-right">Amort.</th>
                <th className="px-2 py-3 text-right">Multa</th>
                <th className="px-2 py-3 text-right">Juros</th>
                <th className="px-2 py-3 text-right">Extra/Rend.</th>
                <th className="px-2 py-3 text-right">Vlr Previsto</th>
                <th className="px-2 py-3 text-right">Saldo FC (%)</th>
                <th className="px-2 py-3 text-right">Saldo TA (%)</th>
                <th className="px-2 py-3 text-right">Saldo FR (%)</th>
                <th className="px-2 py-3 text-right bg-emerald-900 font-bold">Saldo Total (%)</th>
                <th className="px-2 py-3 text-right bg-emerald-900 font-bold">Vlr Efetivado</th>
                <th className="px-2 py-3 text-center print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={19} className="p-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-slate-500">Carregando parcelas...</p>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={19} className="p-10 text-center text-slate-400">
                    Nenhuma parcela pendente encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-2 py-2 font-bold text-slate-700">{item.quotaNumber}</td>
                    <td className="px-2 py-2 text-slate-600">{item.group}</td>
                    <td className="px-2 py-2 text-center font-medium">{item.installmentNumber}</td>
                    <td className={`px-2 py-2 font-medium ${new Date(item.dueDate) < new Date() ? 'text-red-600' : 'text-slate-600'}`}>
                      {formatDate(item.dueDate)}
                    </td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.creditValue)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.fc)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.ta)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.fr)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.insurance)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.amortization)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.fine)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.interest)}</td>
                    <td className="px-2 py-2 text-right text-emerald-600">{formatCurrency(item.extra)}</td>
                    <td className="px-2 py-2 text-right font-medium text-emerald-700">{formatCurrency(item.totalAmount)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.balanceFC)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.balanceTA)}</td>
                    <td className="px-2 py-2 text-right">{formatCurrency(item.balanceFR)}</td>
                    <td className="px-2 py-2 text-right font-bold text-emerald-800 bg-emerald-50">{formatCurrency(item.balanceTotal)}</td>
                    <td className="px-2 py-2 text-right font-bold text-emerald-800 bg-emerald-50">{formatCurrency(item.paidAmount)}</td>
                    <td className="px-2 py-2 text-center print:hidden">
                      <button 
                        onClick={() => openEffectuateModal(item)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Efetivar Pagamento"
                      >
                        <BadgeCheck size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-900 text-white font-bold uppercase">
              <tr>
                <td colSpan={4} className="px-2 py-3">Totais ({sortedData.length})</td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right bg-emerald-950">{formatCurrency(totals.total)}</td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right"></td>
                <td className="px-2 py-3 text-right bg-emerald-950">{formatCurrency(totals.balance)}</td>
                <td className="px-2 py-3 text-right bg-emerald-950">{formatCurrency(totals.paid)}</td>
                <td className="px-2 py-3 print:hidden"></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-slate-200 sm:px-6 rounded-b-xl">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
              >
                Próximo
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-700">
                  Mostrando <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> até <span className="font-medium">{Math.min(currentPage * itemsPerPage, sortedData.length)}</span> de{' '}
                  <span className="font-medium">{sortedData.length}</span> resultados
                </p>
              </div>
              <div className="flex items-center gap-4">
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-sm border-slate-300 rounded-md shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
                >
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                  <option value={100}>100 por página</option>
                  <option value={200}>200 por página</option>
                </select>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Primeira</span>
                    <ChevronLeft size={16} className="mr-[-8px]" /><ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Anterior</span>
                    <ChevronLeft size={16} />
                  </button>
                  
                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? 'z-10 bg-emerald-50 border-emerald-500 text-emerald-600'
                            : 'bg-white border-slate-300 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Próximo</span>
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="sr-only">Última</span>
                    <ChevronRight size={16} /><ChevronRight size={16} className="ml-[-8px]" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Effectuate Modal */}
      {effectuating && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BadgeCheck className="text-emerald-600" size={20} />
                Efetivar Parcela {effectuating.installmentNumber} - {effectuating.group}/{effectuating.quotaNumber}
              </h3>
              <button 
                onClick={() => setEffectuating(null)} 
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors"
                disabled={processing}
              >
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
                        disabled={processing}
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
                        disabled={processing}
                      />
                    </div>
                  </div>
                </div>

                {/* Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Principais</h4>
                  
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fundo Comum (FC)</label>
                      <input
                        type="text"
                        name="fc"
                        value={paymentFormData.fc}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        disabled={processing}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Taxa de Administração (TA)</label>
                      <input
                        type="text"
                        name="ta"
                        value={paymentFormData.ta}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        disabled={processing}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fundo de Reserva (FR)</label>
                      <input
                        type="text"
                        name="fr"
                        value={paymentFormData.fr}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        disabled={processing}
                      />
                    </div>
                </div>

                {/* Additional Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Adicionais</h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Seguro</label>
                    <input
                      type="text"
                      name="insurance"
                      value={paymentFormData.insurance}
                      onChange={handlePaymentFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      disabled={processing}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amortização</label>
                    <input
                      type="text"
                      name="amortization"
                      value={paymentFormData.amortization}
                      onChange={handlePaymentFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      disabled={processing}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Multa</label>
                      <input
                        type="text"
                        name="fine"
                        value={paymentFormData.fine}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        disabled={processing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Juros</label>
                      <input
                        type="text"
                        name="interest"
                        value={paymentFormData.interest}
                        onChange={handlePaymentFormChange}
                        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        disabled={processing}
                      />
                    </div>
                  </div>

                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Rendimentos Manuais (Abate Saldo FC)</label>
                    <input
                      type="text"
                      name="manualEarnings"
                      value={paymentFormData.manualEarnings}
                      onChange={handlePaymentFormChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      disabled={processing}
                    />
                  </div>

                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">Valor Total Pago</label>
                    <input
                      type="text"
                      name="amount"
                      value={paymentFormData.amount}
                      onChange={handlePaymentFormChange}
                      className="w-full px-3 py-2 border-2 border-emerald-200 bg-emerald-50 rounded-md text-emerald-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      disabled={processing}
                    />
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setEffectuating(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                disabled={processing}
              >
                Cancelar
              </button>
              <button
                onClick={handleEffectuate}
                disabled={processing}
                className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  <>
                    <Clock className="animate-spin" size={16} />
                    Processando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Confirmar Pagamento
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountsPayable;
