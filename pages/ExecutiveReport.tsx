
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import ConsortiumFilterBar from '../components/ConsortiumFilterBar';
import { generateSchedule, calculateCurrentCreditValue, calculateScheduleSummary } from '../services/calculationService';
import { db } from '../services/database';
import { formatNumber } from '../utils/formatters';
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldCheck, 
  Briefcase, 
  Activity, 
  Info,
  Download,
  FileText,
  Printer,
  ChevronRight,
  Target,
  Zap,
  DollarSign,
  PieChart,
  Loader,
  X,
  Calculator,
  LayoutDashboard,
  ArrowLeft,
  PlusCircle,
  LineChart as LineChartIcon,
  Calendar as CalendarIcon
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine
} from 'recharts';
import { Quota, ProductType, ProjectionConfig } from '../types';

interface ExecutiveAnalysis {
  quota: Quota;
  debtBalance: number;
  remainingInstallments: number;
  currentInstallment: number;
  availableCredit: number;
  totalDisbursed: number;
  paidTotal: number;
  paidBidEmbedded: number;
  paidManualEarnings: number;
  monthlyYield: number;
  cashFlowArbitrage: number;
  isArbitragePositive: boolean;
  opportunityCostCDI: number;
  realGainVsCDI: number;
  breakEvenAgio: number;
  cetBuyerRanges: {
    agio: number;
    cet: number;
    label: string;
  }[];
  recommendation: 'MANTER' | 'VENDER' | 'UTILIZAR';
  efficiencyScore: number;
  projection: {
    month: number;
    date: string;
    monthlyCost: number;
    monthlyInterest: number;
    monthlyYield: number;
    cumulativeCost: number;
    cumulativeInterest: number;
    totalCumulativeCost: number;
    cumulativeYield: number;
    netResult: number;
    monthLabel: string;
  }[];
  breakEvenMonth: number | null;
}

const ExecutiveReport = () => {
  const navigate = useNavigate();
  const { quotas, indices, allCreditUsages, administrators, companies, globalFilters, setGlobalFilters } = useConsortium();
  const [analysisData, setAnalysisData] = useState<ExecutiveAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [referenceDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedStrategy, setSelectedStrategy] = useState<ExecutiveAnalysis | null>(null);
  const [selectedCalculation, setSelectedCalculation] = useState<ExecutiveAnalysis | null>(null);
  const [selectedProjection, setSelectedProjection] = useState<ExecutiveAnalysis | null>(null);
  const [projectionConfig, setProjectionConfig] = useState<ProjectionConfig>({ enabled: false, periodMonths: 36 });
  const [showAllMonths, setShowAllMonths] = useState(false);

  const buildAnalysis = useCallback(async () => {
    setLoading(true);
    
    // Apply filters
    const filteredQuotas = quotas.filter(q => {
      const matchesAdmin = !globalFilters.administratorId || q.administratorId === globalFilters.administratorId;
      const matchesCompany = !globalFilters.companyId || q.companyId === globalFilters.companyId;
      
      let qProduct = q.productType;
      if (qProduct === 'VEHICLE') qProduct = ProductType.VEHICLE;
      if (qProduct === 'REAL_ESTATE') qProduct = ProductType.REAL_ESTATE;
      const matchesProduct = !globalFilters.productType || qProduct === globalFilters.productType;

      return q.isContemplated && matchesAdmin && matchesCompany && matchesProduct;
    });

    const data = await Promise.all(filteredQuotas.map(async (quota) => {
      const [quotaPayments, quotaManualTransactions] = await Promise.all([
        db.getPayments(quota.id),
        db.getManualTransactions(quota.id)
      ]);

      const schedule = generateSchedule({ ...quota, manualTransactions: quotaManualTransactions }, indices, quotaPayments, undefined, projectionConfig);
      const summary = calculateScheduleSummary(quota, schedule, quotaPayments);
      
      const debtBalance = summary.toPay.total || 0;
      const remainingInstallments = schedule.filter(i => !i.isPaid && i.installmentNumber > 0).length;
      
      // Current installment (next one to pay)
      const nextInstallment = schedule.find(i => !i.isPaid && i.installmentNumber > 0);
      const lastInstallment = schedule.length > 0 ? schedule[schedule.length - 1] : null;
      const currentInstallment = projectionConfig.enabled && lastInstallment ? lastInstallment.totalInstallment : (nextInstallment ? nextInstallment.totalInstallment : 0);

      // Available Credit (CRÉDITO TOTAL SEM CORREÇÃO na Contemplação)
      // Conforme solicitado pelo usuário: Valor da carta na data da contemplação menos o lance embutido.
      const lastInstallmentDate = schedule.length > 0 ? new Date(schedule[schedule.length - 1].dueDate) : new Date(referenceDate);
      const currentCredit = calculateCurrentCreditValue(
        quota, 
        indices, 
        projectionConfig.enabled ? lastInstallmentDate : new Date(referenceDate), 
        projectionConfig.enabled ? false : true, // Don't freeze if projecting future
        false, 
        projectionConfig
      ) || 0;
      const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id);
      const usedCredit = quotaUsages.reduce((sum, u) => sum + (u.amount || 0), 0);
      const availableCredit = currentCredit - (quota.bidEmbedded || 0) - usedCredit;

      // Total Disbursed (Paid installments + Bids)
      // summary.paid.total already includes paid bids and manual transactions
      // We subtract embedded bids and manual earnings as they are not out-of-pocket cash flow
      const totalDisbursed = (summary.paid.total || 0) - (summary.paid.bidEmbedded || 0) - (summary.paid.manualEarnings || 0);

      // 1. Rendimento Líquido (0.92% sobre o Saldo de Crédito)
      const monthlyYield = availableCredit * 0.0092;

      // 2. Arbitragem de Fluxo de Caixa (Rendimento - Parcela)
      const cashFlowArbitrage = monthlyYield - currentInstallment;
      const isArbitragePositive = cashFlowArbitrage > 0;

      // 3. Custo de Oportunidade (Backtesting vs 100% CDI)
      const totalMonths = Math.max(0, (quota.termMonths || 0) - remainingInstallments);
      const cdiIndices = indices.filter(idx => idx.type === 'CDI');
      const avgCDI = cdiIndices.length > 0 
        ? cdiIndices.reduce((sum, i) => sum + (Number(i.rate) || 0), 0) / cdiIndices.length 
        : 0.01;
      
      let opportunityCostCDI = 0;
      if (totalMonths > 0 && !isNaN(avgCDI)) {
        opportunityCostCDI = totalDisbursed * Math.pow(1 + (avgCDI / 100), totalMonths) - totalDisbursed;
      }
      
      if (isNaN(opportunityCostCDI)) opportunityCostCDI = 0;

      // 5. Projeção de Ponto de Equilíbrio
      const projection: { 
        month: number; 
        date: string;
        monthlyCost: number;
        monthlyInterest: number;
        monthlyYield: number;
        cumulativeCost: number; 
        cumulativeInterest: number;
        totalCumulativeCost: number;
        cumulativeYield: number; 
        netResult: number; 
        monthLabel: string; 
      }[] = [];
      let cumulativeCost = 0;
      let cumulativeInterest = 0;
      let cumulativeYield = 0;
      let breakEvenMonth: number | null = null;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Taxa mensal de juros (CDI médio)
      const monthlyInterestRate = (avgCDI || 1.0) / 100;

      // 1. Ponto inicial: Transações manuais no Início (Mês 0)
      const initialInstallments = schedule.filter(inst => inst.installmentNumber === 0);
      let initialCost = 0;
      initialInstallments.forEach(inst => {
        // Para o passado (ou início), usamos o valor efetivamente pago
        initialCost += inst.isPaid ? (inst.realAmountPaid || 0) : 0;
        if (inst.bidFreeApplied) initialCost += inst.bidFreeApplied;
      });

      cumulativeCost = initialCost;
      cumulativeInterest = 0;
      cumulativeYield = 0;
      
      projection.push({
        month: 0,
        date: quota.adhesionDate || quota.firstDueDate,
        monthlyCost: initialCost,
        monthlyInterest: 0,
        monthlyYield: 0,
        cumulativeCost: Number(cumulativeCost.toFixed(2)),
        cumulativeInterest: 0,
        totalCumulativeCost: Number(cumulativeCost.toFixed(2)),
        cumulativeYield: Number(cumulativeYield.toFixed(2)),
        netResult: Number((cumulativeYield - (cumulativeCost + cumulativeInterest)).toFixed(2)),
        monthLabel: 'Início'
      });

      // 2. Projeção mês a mês (Parcelas 1 em diante)
      const contemplationDate = quota.contemplationDate ? new Date(quota.contemplationDate) : null;
      
      for (let i = 1; i <= (quota.termMonths || 0); i++) {
        const inst = schedule.find(s => s.installmentNumber === i);
        if (!inst) continue;

        let cost = 0;
        const instDueDate = new Date(inst.dueDate);
        instDueDate.setHours(0, 0, 0, 0);

        // Regra: Valor efetivamente pago para o passado, previsto para o futuro
        if (instDueDate < today) {
          cost = inst.isPaid ? (inst.realAmountPaid || 0) : 0;
        } else {
          cost = inst.totalInstallment;
        }
        
        // Adiciona Lance Livre se aplicado neste mês (conforme solicitado: no mês do lance)
        if (inst.bidFreeApplied) {
          cost += inst.bidFreeApplied;
        }
        
        // Juros sobre o desembolso acumulado (custo de oportunidade)
        const monthlyInterestValue = cumulativeCost * monthlyInterestRate;
        cumulativeInterest += monthlyInterestValue;
        
        cumulativeCost += cost;
        
        // Rendimento só conta após a contemplação
        let isYielding = false;
        let monthlyYieldValue = 0;
        if (contemplationDate) {
          const instDate = inst ? new Date(inst.dueDate) : null;
          if (instDate && instDate >= contemplationDate) {
            isYielding = true;
          }
        }
        
        if (isYielding) {
          let currentAvailableCredit = availableCredit;
          if (projectionConfig.enabled && inst) {
            // Se estiver projetando, recalculamos o crédito para a data futura
            const projectedCredit = calculateCurrentCreditValue(quota, indices, new Date(inst.dueDate), false, false, projectionConfig);
            currentAvailableCredit = projectedCredit - (quota.bidEmbedded || 0) - usedCredit;
          }
          monthlyYieldValue = currentAvailableCredit * 0.0092;
          cumulativeYield += monthlyYieldValue;
        }

        const totalCumulativeCost = cumulativeCost + cumulativeInterest;
        const netResult = cumulativeYield - totalCumulativeCost;
        if (breakEvenMonth === null && netResult > 0) {
          breakEvenMonth = i;
        }

        projection.push({
          month: i,
          date: inst.dueDate,
          monthlyCost: cost,
          monthlyInterest: Number(monthlyInterestValue.toFixed(2)),
          monthlyYield: monthlyYieldValue,
          cumulativeCost: Number(cumulativeCost.toFixed(2)),
          cumulativeInterest: Number(cumulativeInterest.toFixed(2)),
          totalCumulativeCost: Number(totalCumulativeCost.toFixed(2)),
          cumulativeYield: Number(cumulativeYield.toFixed(2)),
          netResult: Number(netResult.toFixed(2)),
          monthLabel: `Mês ${i}`
        });
      }

      const finalProjection = projection[projection.length - 1];
      const realGainVsCDI = projectionConfig.enabled ? finalProjection.netResult : (availableCredit - debtBalance) - (totalDisbursed + opportunityCostCDI);

      // 4. Simulação de Ágio para Venda
      const breakEvenAgio = totalDisbursed + opportunityCostCDI;

      // CET para o comprador em 3 faixas
      const cetBuyerRanges = [
        { label: 'Ágio Baixo (10%)', agio: availableCredit * 0.10 },
        { label: 'Ágio Médio (15%)', agio: availableCredit * 0.15 },
        { label: 'Ágio Alto (20%)', agio: availableCredit * 0.20 },
      ].map(range => {
        const totalCostBuyer = range.agio + debtBalance;
        const totalRate = totalCostBuyer / availableCredit;
        // Simplificação do cálculo de CET anualizado
        const cet = remainingInstallments > 0 ? (Math.pow(totalRate, 12 / remainingInstallments) - 1) * 100 : 0;
        return { ...range, cet };
      });

      // Recomendação Estratégica
      let recommendation: 'MANTER' | 'VENDER' | 'UTILIZAR' = 'MANTER';
      let efficiencyScore = 0;

      if (isArbitragePositive) {
        recommendation = 'MANTER';
        efficiencyScore = 80 + Math.min(20, (cashFlowArbitrage / monthlyYield) * 100);
      } else if (availableCredit > debtBalance * 1.5) {
        recommendation = 'UTILIZAR';
        efficiencyScore = 70;
      } else {
        recommendation = 'VENDER';
        efficiencyScore = 40;
      }

      return {
        quota,
        debtBalance,
        remainingInstallments,
        currentInstallment,
        availableCredit,
        totalDisbursed,
        paidTotal: summary.paid.total || 0,
        paidBidEmbedded: summary.paid.bidEmbedded || 0,
        paidManualEarnings: summary.paid.manualEarnings || 0,
        monthlyYield,
        cashFlowArbitrage,
        isArbitragePositive,
        opportunityCostCDI,
        realGainVsCDI,
        breakEvenAgio,
        cetBuyerRanges,
        recommendation,
        efficiencyScore,
        projection,
        breakEvenMonth
      } as ExecutiveAnalysis;
    }));

    setAnalysisData(data);
    setLoading(false);
  }, [quotas, indices, allCreditUsages, referenceDate, globalFilters, projectionConfig]);

  useEffect(() => {
    buildAnalysis();
  }, [buildAnalysis, projectionConfig]);

  const portfolioSummary = useMemo(() => {
    if (analysisData.length === 0) return null;

    const totalCredit = analysisData.reduce((sum, d) => sum + d.availableCredit, 0);
    const totalDebt = analysisData.reduce((sum, d) => sum + d.debtBalance, 0);
    const totalYield = analysisData.reduce((sum, d) => sum + d.monthlyYield, 0);
    const totalInstallments = analysisData.reduce((sum, d) => sum + d.currentInstallment, 0);
    const avgEfficiency = analysisData.reduce((sum, d) => sum + d.efficiencyScore, 0) / analysisData.length;

    return {
      totalCredit,
      totalDebt,
      totalYield,
      totalInstallments,
      avgEfficiency,
      netCashFlow: totalYield - totalInstallments,
      healthStatus: avgEfficiency > 70 ? 'EXCELENTE' : avgEfficiency > 50 ? 'ESTÁVEL' : 'ALERTA'
    };
  }, [analysisData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader className="animate-spin text-emerald-600 mb-4" size={48} />
        <p className="text-slate-500 font-medium">Processando dados financeiros...</p>
      </div>
    );
  }

  if (analysisData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
        <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-300 mb-6 border border-slate-100 shadow-inner">
          <ShieldCheck size={40} />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Nenhuma Cota Contemplada</h2>
        <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
          O Relatório Executivo processa apenas cotas contempladas para análise de performance e arbitragem financeira. 
          Cadastre ou contemple uma cota para visualizar os dados.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          {(globalFilters.companyId || globalFilters.administratorId || globalFilters.productType) && (
            <button 
              onClick={() => setGlobalFilters({ companyId: '', administratorId: '', productType: '', status: '' })}
              className="px-8 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-bold hover:bg-amber-100 transition-all flex items-center gap-2"
            >
              <X size={18} />
              Limpar Filtros
            </button>
          )}
          <button 
            onClick={() => navigate('/new')}
            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center gap-2"
          >
            <PlusCircle size={18} />
            Cadastrar Cota
          </button>
          <button 
            onClick={() => navigate('/')}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
          >
            <LayoutDashboard size={18} />
            Ir para o Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <ConsortiumFilterBar 
        showQuotaFilter={false} 
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-slate-200 p-1 rounded-xl shadow-sm">
              <button 
                onClick={() => setProjectionConfig({ ...projectionConfig, enabled: false })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${!projectionConfig.enabled ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Valores Atuais
              </button>
              <button 
                onClick={() => setProjectionConfig({ ...projectionConfig, enabled: true })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${projectionConfig.enabled ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Projetar Futuro
              </button>
            </div>
            
            {projectionConfig.enabled && (
              <div className="flex items-center gap-2 bg-indigo-50 p-1 rounded-xl border border-indigo-100 h-9">
                <select 
                  value={projectionConfig.periodMonths}
                  onChange={(e) => setProjectionConfig({ ...projectionConfig, periodMonths: Number(e.target.value) })}
                  className="bg-transparent text-[10px] font-bold text-indigo-700 outline-none px-2"
                >
                  <option value={12}>12 Meses</option>
                  <option value={24}>24 Meses</option>
                  <option value={36}>36 Meses</option>
                </select>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <button className="flex items-center justify-center gap-2 px-3 h-9 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap">
                <Download size={16} />
                Exportar PDF
              </button>
              <button 
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 px-3 h-9 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm whitespace-nowrap"
              >
                <Printer size={16} />
                Imprimir
              </button>
            </div>
          </div>
        }
      />

      {/* Executive Summary Cards */}
      {portfolioSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <DollarSign size={20} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                portfolioSummary.healthStatus === 'EXCELENTE' ? 'bg-emerald-100 text-emerald-700' :
                portfolioSummary.healthStatus === 'ESTÁVEL' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
              }`}>
                {portfolioSummary.healthStatus}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{projectionConfig.enabled ? 'Liquidez Projetada' : 'Liquidez Total'}</p>
            <h3 className="text-xl font-black text-slate-900">{formatNumber(portfolioSummary.totalCredit)}</h3>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
              <Info size={12} />
              <span>{projectionConfig.enabled ? 'Crédito projetado ao fim do plano' : 'Crédito disponível atualizado'}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Activity size={20} />
              </div>
              <span className="text-[10px] font-bold text-blue-600">ROI MENSAL</span>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{projectionConfig.enabled ? 'Rendimento Projetado' : 'Rendimento Nominal'}</p>
            <h3 className="text-xl font-black text-slate-900">{formatNumber(portfolioSummary.totalYield)}</h3>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-600 font-bold">
              <ArrowUpRight size={12} />
              <span>{projectionConfig.enabled ? 'Rendimento mensal projetado' : '0.92% a.m. fixo'}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <TrendingUp size={20} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                portfolioSummary.netCashFlow > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {portfolioSummary.netCashFlow > 0 ? 'SUPERÁVIT' : 'DÉFICIT'}
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{projectionConfig.enabled ? 'Arbitragem Projetada' : 'Arbitragem Líquida'}</p>
            <h3 className="text-xl font-black text-slate-900">{formatNumber(portfolioSummary.netCashFlow)}</h3>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
              <span>{projectionConfig.enabled ? 'Rendimento - Parcelas (Projetado)' : 'Rendimento - Parcelas'}</span>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Target size={20} />
              </div>
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all" 
                    style={{ width: `${portfolioSummary.avgEfficiency}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold text-indigo-600">{portfolioSummary.avgEfficiency.toFixed(0)}%</span>
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Eficiência de Capital</p>
            <h3 className="text-xl font-black text-slate-900">Score Geral</h3>
            <div className="mt-2 flex items-center gap-1 text-[10px] text-slate-400">
              <span>Média ponderada da carteira</span>
            </div>
          </div>
        </div>
      )}

      {/* Individual Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:overflow-visible print:border-none print:shadow-none">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between print:hidden">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Performance Individual de Ativos</h3>
            <p className="text-sm text-slate-500">Detalhamento por cota contemplada e arbitragem de fluxo.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Arbitragem Positiva
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-400 ml-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              Arbitragem Negativa
            </span>
          </div>
        </div>
        <div className="overflow-x-auto print:overflow-visible">
          <table className="w-full text-left border-collapse print:text-[8px]">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-4">Ativo / Cota</th>
                <th className="px-6 py-4 text-right">CRÉDITO TOTAL SEM CORREÇÃO</th>
                <th className="px-6 py-4 text-right">Parcela Mensal</th>
                <th className="px-6 py-4 text-right">Rendimento (0.92%)</th>
                <th className="px-6 py-4 text-right">Arbitragem</th>
                <th className="px-6 py-4 text-center">Status Fluxo</th>
                <th className="px-6 py-4 text-center">Recomendação</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysisData.map((data, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                        data.quota.productType === ProductType.REAL_ESTATE ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {data.quota.productType === ProductType.REAL_ESTATE ? 'IM' : 'VE'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{data.quota.group} / {data.quota.quotaNumber}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase">{data.quota.administratorId || 'Administradora'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-slate-800">{formatNumber(data.availableCredit)}</p>
                    <p className="text-[10px] text-slate-400">{data.remainingInstallments} parcelas restantes</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-medium text-slate-600">{formatNumber(data.currentInstallment)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-sm font-bold text-emerald-600">+{formatNumber(data.monthlyYield)}</p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className={`text-sm font-black ${data.isArbitragePositive ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {data.isArbitragePositive ? '+' : ''}{formatNumber(data.cashFlowArbitrage)}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      data.isArbitragePositive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {data.isArbitragePositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {data.isArbitragePositive ? 'POSITIVO' : 'NEGATIVO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest ${
                        data.recommendation === 'MANTER' ? 'bg-emerald-600 text-white' :
                        data.recommendation === 'UTILIZAR' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {data.recommendation}
                      </span>
                      <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            data.efficiencyScore > 70 ? 'bg-emerald-500' : 
                            data.efficiencyScore > 50 ? 'bg-blue-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${data.efficiencyScore}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setSelectedCalculation(data)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Memória de Cálculo"
                      >
                        <Calculator size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedProjection(data);
                          setShowAllMonths(false);
                        }}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Projeção ROI"
                      >
                        <LineChartIcon size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Capital Cost & Opportunity Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <PieChart size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Análise de Custo de Capital</h3>
              <p className="text-sm text-slate-500">Backtesting: Consórcio vs. 100% CDI no período.</p>
            </div>
          </div>

          <div className="space-y-4">
            {analysisData.map((data, idx) => (
              <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-start mb-4">
                  <p className="text-sm font-bold text-slate-700">Cota {data.quota.group}/{data.quota.quotaNumber}</p>
                  <div className={`flex items-center gap-1 text-xs font-bold ${data.realGainVsCDI > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {data.realGainVsCDI > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {projectionConfig.enabled ? (data.realGainVsCDI > 0 ? 'ROI Projetado Positivo' : 'ROI Projetado Negativo') : (data.realGainVsCDI > 0 ? 'Acima do CDI' : 'Abaixo do CDI')}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Capital Imobilizado</p>
                    <p className="text-sm font-black text-slate-800">{formatNumber(data.totalDisbursed)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Custo Oportunidade (CDI)</p>
                    <p className="text-sm font-bold text-slate-600">+{formatNumber(data.opportunityCostCDI)}</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setSelectedCalculation(data)}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Memória de Cálculo"
                    >
                      <Calculator size={16} />
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedProjection(data);
                        setShowAllMonths(false);
                      }}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                      title="Projeção ROI"
                    >
                      <LineChartIcon size={16} />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{projectionConfig.enabled ? 'Ganho Projetado Final' : 'Ganho Real sobre Capital'}</p>
                    <p className={`text-lg font-black ${data.realGainVsCDI > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {formatNumber(data.realGainVsCDI)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Simulação de Arbitragem de Venda</h3>
              <p className="text-sm text-slate-500">Projeção de Ágio e CET para o mercado secundário.</p>
            </div>
          </div>

          <div className="space-y-6">
            {analysisData.map((data, idx) => (
              <div key={idx} className="space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-slate-700">Cota {data.quota.group}/{data.quota.quotaNumber}</p>
                  <button 
                    onClick={() => {
                      setSelectedProjection(data);
                      setShowAllMonths(false);
                    }}
                    className="text-xs font-medium text-slate-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                  >
                    Ponto de Equilíbrio: <span className="text-slate-700 font-bold group-hover:text-indigo-600 underline decoration-slate-200 underline-offset-2">{formatNumber(data.breakEvenAgio)}</span>
                    <LineChartIcon size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {data.cetBuyerRanges.map((range, rIdx) => (
                    <div key={rIdx} className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">{range.label}</p>
                      <p className="text-xs font-black text-slate-800 mb-1">{formatNumber(range.agio)}</p>
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">CET Comprador</p>
                        <p className="text-xs font-bold text-indigo-600">{range.cet.toFixed(2)}% a.a.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2 mb-2">
              <Info size={16} />
              Nota Estratégica
            </h4>
            <p className="text-xs text-indigo-700 leading-relaxed">
              O CET médio de financiamento bancário para {analysisData[0].quota.productType === ProductType.REAL_ESTATE ? 'Imóveis' : 'Veículos'} 
              está projetado em 10.5% a 18.2% a.a. Ativos com CET abaixo de 8% possuem alta liquidez no Marketplace.
            </p>
          </div>
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl overflow-hidden relative">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <Briefcase size={200} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl">
              <Target size={32} />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Diretrizes Estratégicas de Alocação</h3>
              <p className="text-slate-400">Diagnóstico final baseado na eficiência do capital imobilizado.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {analysisData.slice(0, 3).map((data, idx) => (
              <div key={idx} className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm">
                <div className="flex justify-between items-start mb-4">
                  <div className="px-3 py-1 bg-emerald-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest">
                    {data.recommendation}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Score</p>
                    <p className="text-lg font-black text-white">{data.efficiencyScore.toFixed(0)}</p>
                  </div>
                </div>
                
                <h4 className="text-lg font-bold mb-2">Cota {data.quota.group}/{data.quota.quotaNumber}</h4>
                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                  {data.recommendation === 'MANTER' ? 
                    'Ativo com arbitragem positiva. O rendimento mensal supera o custo da parcela, gerando lucro retido e preservando liquidez.' :
                    data.recommendation === 'UTILIZAR' ?
                    'Ativo com alto crédito disponível em relação ao saldo devedor. Recomendada a utilização para aquisição de bem ou capital de giro.' :
                    'Ativo com eficiência de capital reduzida. Recomendada a venda no mercado secundário para realização de ágio e realocação em novos grupos.'
                  }
                </p>

                <button 
                  onClick={() => setSelectedStrategy(data)}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 group"
                >
                  Ver Detalhes da Estratégia
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategy Detail Modal */}
      {selectedStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                  <Target size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Detalhamento da Estratégia</h3>
                  <p className="text-sm text-slate-500">Cota {selectedStrategy.quota.group} / {selectedStrategy.quota.quotaNumber}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStrategy(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Recommendation Header */}
              <div className="flex items-center justify-between p-6 bg-slate-900 rounded-2xl text-white">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Diagnóstico Recomendado</p>
                  <h4 className="text-2xl font-black text-emerald-400">{selectedStrategy.recommendation}</h4>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Eficiência de Capital</p>
                  <p className="text-3xl font-black">{selectedStrategy.efficiencyScore.toFixed(0)}<span className="text-sm font-normal text-slate-400 ml-1">/100</span></p>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Métricas de Arbitragem</h5>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm text-slate-600">Rendimento Mensal (0.92%)</span>
                      <span className="text-sm font-bold text-emerald-600">{formatNumber(selectedStrategy.monthlyYield)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm text-slate-600">Custo da Parcela Atual</span>
                      <span className="text-sm font-bold text-slate-800">{formatNumber(selectedStrategy.currentInstallment)}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="text-sm font-bold text-emerald-900">Arbitragem Líquida</span>
                      <span className={`text-lg font-black ${selectedStrategy.isArbitragePositive ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {selectedStrategy.isArbitragePositive ? '+' : ''}{formatNumber(selectedStrategy.cashFlowArbitrage)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Métricas de Liquidez</h5>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm text-slate-600">CRÉDITO TOTAL SEM CORREÇÃO Disponível</span>
                      <span className="text-sm font-bold text-slate-800">{formatNumber(selectedStrategy.availableCredit)}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-sm text-slate-600">Saldo Devedor Total</span>
                      <span className="text-sm font-bold text-slate-800">{formatNumber(selectedStrategy.debtBalance)}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <span className="text-sm font-bold text-indigo-900">Capital Imobilizado</span>
                      <span className="text-lg font-black text-indigo-600">{formatNumber(selectedStrategy.totalDisbursed)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Plan */}
              <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100">
                <h5 className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-3">
                  <Activity size={18} />
                  Plano de Ação Sugerido
                </h5>
                <ul className="space-y-3">
                  {selectedStrategy.recommendation === 'MANTER' ? (
                    <>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        Manter o ativo em carteira para aproveitar a arbitragem positiva acima da inflação.
                      </li>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        Reinvestir o lucro da arbitragem ({formatNumber(selectedStrategy.cashFlowArbitrage)}) em novos grupos de consórcio.
                      </li>
                    </>
                  ) : selectedStrategy.recommendation === 'UTILIZAR' ? (
                    <>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        O crédito disponível é significativamente superior ao saldo devedor.
                      </li>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        Considerar a utilização imediata do crédito para aquisição de ativos produtivos.
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        A eficiência do capital está abaixo do ideal para este ativo.
                      </li>
                      <li className="flex gap-3 text-sm text-amber-800">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        Avaliar propostas no mercado secundário com ágio próximo a {formatNumber(selectedStrategy.breakEvenAgio)}.
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedStrategy(null)}
                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calculation Memory Modal */}
      {selectedCalculation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
                  <Calculator size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Memória de Cálculo</h3>
                  <p className="text-sm text-slate-500">Detalhamento matemático da Cota {selectedCalculation.quota.group} / {selectedCalculation.quota.quotaNumber}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCalculation(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8">
              {projectionConfig.enabled && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3 text-indigo-700 text-sm font-medium">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <TrendingUp size={18} className="text-indigo-600" />
                  </div>
                  <p>Esta análise está utilizando <strong>projeções futuras</strong> baseadas na média dos últimos {projectionConfig.periodMonths} meses dos índices ({selectedCalculation.quota.correctionIndex}).</p>
                </div>
              )}

              {/* 1. CRÉDITO TOTAL SEM CORREÇÃO */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">1</div>
                  Cálculo do CRÉDITO TOTAL SEM CORREÇÃO (Base na Contemplação)
                </h4>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Valor da Carta (na contemplação)</span>
                    <span className="font-mono font-bold text-slate-700">{formatNumber(selectedCalculation.availableCredit + (selectedCalculation.quota.bidEmbedded || 0) + (allCreditUsages.filter(u => u.quotaId === selectedCalculation.quota.id).reduce((sum, u) => sum + (u.amount || 0), 0)))}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">(-) Lance Embutido</span>
                    <span className="font-mono font-bold text-red-500">-{formatNumber(selectedCalculation.quota.bidEmbedded || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">(-) Utilizações de Crédito</span>
                    <span className="font-mono font-bold text-red-500">-{formatNumber(allCreditUsages.filter(u => u.quotaId === selectedCalculation.quota.id).reduce((sum, u) => sum + (u.amount || 0), 0))}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">(=) CRÉDITO TOTAL SEM CORREÇÃO Disponível</span>
                    <span className="text-lg font-black text-indigo-600">{formatNumber(selectedCalculation.availableCredit)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 italic mt-2">
                    * {projectionConfig.enabled ? 'Valor projetado ao final do plano com base nos índices médios.' : 'Conforme regra de negócio: O valor da carta é congelado na data da contemplação, subtraindo-se o lance embutido e as utilizações efetivadas.'}
                  </p>
                </div>
              </section>

              {/* 2. Rendimento Mensal */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">2</div>
                  Cálculo do Rendimento Mensal (ROI)
                </h4>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Base de Cálculo (CRÉDITO TOTAL SEM CORREÇÃO)</span>
                    <span className="font-mono font-bold text-slate-700">{formatNumber(selectedCalculation.availableCredit)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">(x) Taxa de Rendimento (Fixo)</span>
                    <span className="font-mono font-bold text-slate-700">0,92% a.m.</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">(=) Rendimento Nominal Mensal</span>
                    <span className="text-lg font-black text-emerald-600">+{formatNumber(selectedCalculation.monthlyYield)}</span>
                  </div>
                </div>
              </section>

              {/* 3. Arbitragem de Fluxo */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">3</div>
                  Cálculo da Arbitragem de Fluxo de Caixa
                </h4>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Rendimento Mensal</span>
                    <span className="font-mono font-bold text-emerald-600">+{formatNumber(selectedCalculation.monthlyYield)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">(-) Valor da Próxima Parcela</span>
                    <span className="font-mono font-bold text-red-500">-{formatNumber(selectedCalculation.currentInstallment)}</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">(=) Arbitragem (Cash Flow)</span>
                    <span className={`text-lg font-black ${selectedCalculation.isArbitragePositive ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {selectedCalculation.isArbitragePositive ? '+' : ''}{formatNumber(selectedCalculation.cashFlowArbitrage)}
                    </span>
                  </div>
                </div>
              </section>

              {/* 4. Custo de Oportunidade */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">4</div>
                  Cálculo do Custo de Oportunidade (Backtesting CDI)
                </h4>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Total Pago (Sistema)</span>
                    <span className="font-mono font-bold text-slate-700">{formatNumber(selectedCalculation.paidTotal)}</span>
                  </div>
                  {selectedCalculation.paidBidEmbedded > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">(-) Lance Embutido (Não é desembolso)</span>
                      <span className="font-mono font-bold text-red-500">-{formatNumber(selectedCalculation.paidBidEmbedded)}</span>
                    </div>
                  )}
                  {selectedCalculation.paidManualEarnings > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">(-) Rendimentos Aplicados (Não é desembolso)</span>
                      <span className="font-mono font-bold text-red-500">-{formatNumber(selectedCalculation.paidManualEarnings)}</span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">(=) Capital Imobilizado (Efetivamente Pago)</span>
                    <span className="text-lg font-black text-slate-700">{formatNumber(selectedCalculation.totalDisbursed)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-4">
                    <span className="text-slate-500">Período de Investimento (Meses Decorridos)</span>
                    <span className="font-mono font-bold text-slate-700">{Math.max(0, (selectedCalculation.quota.termMonths || 0) - selectedCalculation.remainingInstallments)} meses</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Taxa CDI Média do Período (Projetada)</span>
                    <span className="font-mono font-bold text-slate-700">{(indices.filter(idx => idx.type === 'CDI').reduce((sum, i) => sum + (Number(i.rate) || 0), 0) / (indices.filter(idx => idx.type === 'CDI').length || 1)).toFixed(4)}% a.m.</span>
                  </div>
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">(=) Custo de Oportunidade CDI</span>
                    <span className="text-lg font-black text-slate-700">+{formatNumber(selectedCalculation.opportunityCostCDI)}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 italic mt-2">
                    Fórmula: Capital * (1 + CDI)^Meses - Capital
                  </p>
                </div>
              </section>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedCalculation(null)}
                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                Fechar Detalhamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Projeção ROI */}
      {selectedProjection && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <LineChartIcon size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Projeção de ROI e Ponto de Equilíbrio</h3>
                  <p className="text-indigo-100 text-sm">Cota {selectedProjection.quota.group} / {selectedProjection.quota.quotaNumber}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProjection(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {projectionConfig.enabled && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center gap-3 text-indigo-700 text-sm font-medium">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <TrendingUp size={18} className="text-indigo-600" />
                  </div>
                  <p>Esta projeção está utilizando <strong>índices projetados</strong> baseados na média dos últimos {projectionConfig.periodMonths} meses ({selectedProjection.quota.correctionIndex}).</p>
                </div>
              )}

              {/* Resumo do Ponto de Equilíbrio */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                  <div className="flex items-center gap-2 text-emerald-600 mb-2">
                    <Target size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">Ponto de Equilíbrio</span>
                  </div>
                  <p className="text-2xl font-black text-emerald-700">
                    {selectedProjection.breakEvenMonth ? `Mês ${selectedProjection.breakEvenMonth}` : 'Fora do Prazo'}
                  </p>
                  <p className="text-xs text-emerald-600/70 mt-1">
                    {selectedProjection.breakEvenMonth 
                      ? 'Momento em que o rendimento acumulado supera o custo total.' 
                      : 'O custo total supera o rendimento até o fim do plano.'}
                  </p>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 text-slate-500 mb-2">
                    <DollarSign size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">Investimento Total</span>
                  </div>
                  <p className="text-2xl font-black text-slate-700">
                    {formatNumber(selectedProjection.projection[selectedProjection.projection.length - 1].cumulativeCost)}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Soma de todas as parcelas + lance livre.</p>
                </div>

                <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
                  <div className="flex items-center gap-2 text-indigo-600 mb-2">
                    <TrendingUp size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">Resultado Final</span>
                  </div>
                  <p className={`text-2xl font-black ${selectedProjection.projection[selectedProjection.projection.length - 1].netResult > 0 ? 'text-indigo-700' : 'text-amber-700'}`}>
                    {formatNumber(selectedProjection.projection[selectedProjection.projection.length - 1].netResult)}
                  </p>
                  <p className="text-xs text-indigo-600/70 mt-1">Lucro/Prejuízo líquido ao final do plano.</p>
                </div>
              </div>

              {/* Gráfico de Projeção */}
              <section className="space-y-4">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  Evolução Patrimonial (Custo vs. Rendimento)
                </h4>
                <div className="h-[350px] w-full bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                    <AreaChart data={selectedProjection.projection}>
                      <defs>
                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorYield" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="month" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10}}
                        label={{ value: 'Meses', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#94a3b8' }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#94a3b8', fontSize: 10}}
                        tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [formatNumber(value), '']}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Area 
                        type="monotone" 
                        dataKey="totalCumulativeCost" 
                        name="Custo Total Acumulado" 
                        stroke="#ef4444" 
                        fillOpacity={1} 
                        fill="url(#colorCost)" 
                        strokeWidth={3}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="cumulativeYield" 
                        name="Rendimento Acumulado" 
                        stroke="#10b981" 
                        fillOpacity={1} 
                        fill="url(#colorYield)" 
                        strokeWidth={3}
                      />
                      {selectedProjection.breakEvenMonth && (
                        <ReferenceLine x={selectedProjection.breakEvenMonth} stroke="#6366f1" strokeDasharray="3 3" label={{ position: 'top', value: 'Break-even', fill: '#6366f1', fontSize: 10, fontWeight: 'bold' }} />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Tabela Detalhada */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-indigo-600" />
                    Detalhamento Financeiro Mensal
                  </h4>
                  <button 
                    onClick={() => setShowAllMonths(!showAllMonths)}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2"
                  >
                    <Activity size={14} />
                    {showAllMonths ? 'Recolher Detalhes' : 'Detalhar Mês a Mês'}
                  </button>
                </div>
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Mês</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">Data</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Valor Pago</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Juros (CDI)</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Rendimento</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Custo Acum.</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Rend. Acum.</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase text-right">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedProjection.projection.filter((_, idx) => showAllMonths || idx % 6 === 0 || idx === selectedProjection.projection.length - 1 || idx === selectedProjection.breakEvenMonth).map((row, idx) => (
                          <tr key={idx} className={row.month === selectedProjection.breakEvenMonth ? 'bg-emerald-50/50' : ''}>
                            <td className="px-4 py-3 text-sm font-medium text-slate-700">
                              {row.monthLabel}
                              {row.month === selectedProjection.breakEvenMonth && (
                                <span className="ml-2 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] rounded font-bold uppercase">Break-even</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">
                              {new Date(row.date).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="px-4 py-3 text-sm font-mono text-right text-slate-600">{formatNumber(row.monthlyCost)}</td>
                            <td className="px-4 py-3 text-sm font-mono text-right text-amber-600">{formatNumber(row.monthlyInterest)}</td>
                            <td className="px-4 py-3 text-sm font-mono text-right text-emerald-500">{formatNumber(row.monthlyYield)}</td>
                            <td className="px-4 py-3 text-sm font-mono text-right text-red-600">{formatNumber(row.totalCumulativeCost)}</td>
                            <td className="px-4 py-3 text-sm font-mono text-right text-emerald-600">{formatNumber(row.cumulativeYield)}</td>
                            <td className={`px-4 py-3 text-sm font-mono font-bold text-right ${row.netResult >= 0 ? 'text-indigo-600' : 'text-amber-600'}`}>
                              {row.netResult > 0 ? '+' : ''}{formatNumber(row.netResult)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 bg-slate-50 text-center">
                    <p className="text-[10px] text-slate-400 italic">
                      {showAllMonths ? 'Exibindo todos os meses do plano.' : 'Exibindo intervalos de 6 meses. Clique em "Detalhar Mês a Mês" para ver o fluxo completo.'}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => setSelectedProjection(null)}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Fechar Projeção
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveReport;
