
import React, { useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { calculateMarketAnalysis } from '../services/marketService';
import { generateSchedule } from '../services/calculationService';
import { formatCurrency } from '../utils/formatters';
import { TrendingUp, Tag, DollarSign, PieChart, ArrowUpRight, Briefcase, Info } from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import ConsortiumFilterBar from '../components/ConsortiumFilterBar';

const SellerDashboard = () => {
  const { quotas, indices, globalFilters } = useConsortium();

  const filteredQuotas = useMemo(() => {
    return quotas.filter(q => {
      const matchCompany = !globalFilters.companyId || q.companyId === globalFilters.companyId;
      const matchAdmin = !globalFilters.administratorId || q.administratorId === globalFilters.administratorId;
      const matchProduct = !globalFilters.productType || q.productType === globalFilters.productType;
      const matchStatus = !globalFilters.status || (globalFilters.status === 'CONTEMPLATED' ? q.isContemplated : !q.isContemplated);
      const matchQuota = !globalFilters.quotaId || q.id === globalFilters.quotaId;
      return matchCompany && matchAdmin && matchProduct && matchStatus && matchQuota;
    });
  }, [quotas, globalFilters]);

  const portfolioAnalysis = useMemo(() => {
    return filteredQuotas.map(quota => {
      const schedule = generateSchedule(quota, indices);
      const paidAmount = schedule.filter(i => i.isPaid).reduce((sum, i) => sum + (i.realAmountPaid || i.totalInstallment) + (i.bidFreeApplied || 0), 0);
      const debtBalance = schedule.filter(i => !i.isPaid).reduce((sum, i) => sum + i.totalInstallment, 0);
      const analysis = calculateMarketAnalysis(quota, indices, paidAmount, debtBalance);
      return { quota, analysis };
    });
  }, [filteredQuotas, indices]);

  const totals = useMemo(() => {
    return portfolioAnalysis.reduce((acc, item) => ({
      totalPaid: acc.totalPaid + item.analysis.paidAmount,
      totalMarketValue: acc.totalMarketValue + item.analysis.suggestedMarketValue,
      totalProfit: acc.totalProfit + item.analysis.estimatedProfit,
      contemplatedCount: acc.contemplatedCount + (item.quota.isContemplated ? 1 : 0),
      activeCount: acc.activeCount + (item.quota.isContemplated ? 0 : 1),
    }), { totalPaid: 0, totalMarketValue: 0, totalProfit: 0, contemplatedCount: 0, activeCount: 0 });
  }, [portfolioAnalysis]);

  const chartData = [
    { name: 'Contempladas', value: totals.contemplatedCount, color: '#10b981' },
    { name: 'Ativas', value: totals.activeCount, color: '#64748b' },
  ];

  const topOpportunities = [...portfolioAnalysis]
    .sort((a, b) => b.analysis.estimatedProfit - a.analysis.estimatedProfit)
    .slice(0, 5);

  return (
    <div className="space-y-6 pt-4">
      {/* Normalized Filters */}
      <ConsortiumFilterBar showQuotaFilter={true} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <DollarSign size={24} />
            </div>
            <div>
              <span className="text-sm text-slate-500 font-medium">Patrimônio em Cotas</span>
              <h3 className="text-2xl font-black text-slate-800">{formatCurrency(totals.totalMarketValue)}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-emerald-600 font-bold">
            <ArrowUpRight size={14} />
            <span>Valor estimado de revenda</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <TrendingUp size={24} />
            </div>
            <div>
              <span className="text-sm text-slate-500 font-medium">Lucro Potencial (Ágio)</span>
              <h3 className="text-2xl font-black text-blue-600">{formatCurrency(totals.totalProfit)}</h3>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Baseado em médias de mercado para {totals.contemplatedCount} cotas contempladas
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <Tag size={24} />
            </div>
            <div>
              <span className="text-sm text-slate-500 font-medium">Total Investido</span>
              <h3 className="text-2xl font-black text-slate-800">{formatCurrency(totals.totalPaid)}</h3>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            Soma de todas as parcelas e lances pagos
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Composition */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <PieChart size={20} className="text-slate-400" />
              Composição da Carteira
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Opportunities */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Briefcase size={20} className="text-slate-400" />
              Melhores Oportunidades
            </h3>
          </div>
          <div className="space-y-4">
            {topOpportunities.map((item, index) => (
              <div key={item.quota.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 text-slate-500 rounded-lg flex items-center justify-center font-bold text-xs">
                    0{index + 1}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-700">Cota {item.quota.group}/{item.quota.quotaNumber}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">
                      {item.quota.isContemplated ? 'Contemplada' : 'Ativa'}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-emerald-600">+{formatCurrency(item.analysis.estimatedProfit)}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Lucro Estimado</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-4 items-start">
        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0">
          <Info size={20} />
        </div>
        <div>
          <h4 className="font-bold text-blue-900 text-sm mb-1">Como funciona a revenda?</h4>
          <p className="text-blue-800 text-xs leading-relaxed">
            Cotas contempladas possuem alto valor de mercado pois permitem o uso imediato do crédito. O valor de revenda (ágio) é calculado somando o valor que você já pagou a uma porcentagem do crédito total. Cotas ativas (não contempladas) geralmente são vendidas com um pequeno desconto sobre o valor pago.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SellerDashboard;
