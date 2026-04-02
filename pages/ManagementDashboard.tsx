
import React, { useState, useEffect, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { 
  TrendingUp, DollarSign, PieChart, BarChart3, Calendar, 
  ArrowUpRight, ArrowDownRight, Activity, ShieldCheck, 
  AlertCircle, Building2, Briefcase, Filter, PiggyBank,
  ChevronRight, Download, Info, FileText
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, PieChart as RePieChart, 
  Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const ManagementDashboard = () => {
  const { quotas, indices, companies, administrators, globalFilters, setGlobalFilters } = useConsortium();
  const [selectedQuotaId, setSelectedQuotaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [realTotals, setRealTotals] = useState({
    totalPaid: 0,
    totalFC: 0,
    totalFees: 0, // TA + FR + Insurance
    totalEncargos: 0, // Fine + Interest
    totalBids: 0,
    countPaid: 0,
    avgInstallment: 0,
    efficiency: 0
  });

  const [monthlyEvolution, setMonthlyEvolution] = useState<any[]>([]);
  const [compositionData, setCompositionData] = useState<any[]>([]);
  const [adminPerformance, setAdminPerformance] = useState<any[]>([]);

  useEffect(() => {
    const calculateManagementData = async () => {
      setLoading(true);
      try {
        const allUsages = await db.getAllCreditUsages();
        const allPayments = await db.getAllPaymentsDictionary();
        
        let accTotalPaid = 0;
        let accFC = 0;
        let accFees = 0;
        let accEncargos = 0;
        let accBids = 0;
        let accCount = 0;
        let accProjectedForPaid = 0;

        const monthMap: Record<string, any> = {};
        const adminMap: Record<string, any> = {};

        quotas.forEach(quota => {
          // Apply Global Filters
          const matchCompany = !globalFilters.companyId || quota.companyId === globalFilters.companyId;
          const matchAdmin = !globalFilters.administratorId || quota.administratorId === globalFilters.administratorId;
          const matchProduct = !globalFilters.productType || quota.productType === globalFilters.productType;
          const matchQuota = !selectedQuotaId || quota.id === selectedQuotaId;
          
          if (!matchCompany || !matchAdmin || !matchProduct || !matchQuota) return;

          const schedule = generateSchedule(quota, indices);
          const paymentMap = allPayments[quota.id] || {};
          const adminName = administrators.find(a => a.id === quota.administratorId)?.name || 'Outras';

          schedule.forEach(inst => {
            const paymentData = paymentMap[inst.installmentNumber];
            // Strict check: must have status 'PAGO' and a payment date
            const isPaid = !!paymentData && 
                          (paymentData.status === 'PAGO' || paymentData.isPaid === true) && 
                          !!paymentData.paymentDate;

            if (isPaid) {
              const fc = paymentData.manualFC ?? inst.commonFund;
              const fr = paymentData.manualFR ?? inst.reserveFund;
              const ta = paymentData.manualTA ?? inst.adminFee;
              const ins = paymentData.manualInsurance ?? inst.insurance;
              const fine = paymentData.manualFine ?? 0;
              const interest = paymentData.manualInterest ?? 0;
              const bid = inst.bidFreeApplied || 0;

              const totalInst = fc + fr + ta + ins + fine + interest;
              
              accTotalPaid += totalInst;
              accFC += fc;
              accFees += (fr + ta + ins);
              accEncargos += (fine + interest);
              accCount++;
              accProjectedForPaid += inst.totalInstallment;

              // Monthly Evolution
              const monthKey = (paymentData.paymentDate || inst.dueDate).slice(0, 7);
              if (!monthMap[monthKey]) {
                monthMap[monthKey] = { month: monthKey, real: 0, projected: 0, fc: 0, fees: 0 };
              }
              monthMap[monthKey].real += totalInst;
              monthMap[monthKey].projected += inst.totalInstallment;
              monthMap[monthKey].fc += fc;
              monthMap[monthKey].fees += (fr + ta + ins + fine + interest);

              // Admin Performance
              if (!adminMap[adminName]) {
                adminMap[adminName] = { name: adminName, total: 0, count: 0 };
              }
              adminMap[adminName].total += totalInst;
              adminMap[adminName].count++;
            }
          });

          // Handle Bids separately (once per quota)
          const freeBidPayment = paymentMap[0];
          if (freeBidPayment && (freeBidPayment.status === 'PAGO' || freeBidPayment.isPaid === true) && freeBidPayment.paymentDate) {
            const bidAmount = freeBidPayment.bidFreeApplied || 0;
            accBids += bidAmount;
            
            const bidMonthKey = freeBidPayment.paymentDate.slice(0, 7);
            if (!monthMap[bidMonthKey]) {
              monthMap[bidMonthKey] = { month: bidMonthKey, real: 0, projected: 0, fc: 0, fees: 0, bids: 0 };
            }
            if (!monthMap[bidMonthKey].bids) monthMap[bidMonthKey].bids = 0;
            monthMap[bidMonthKey].bids += bidAmount;
          }
        });

        // Format charts
        const sortedMonths = Object.keys(monthMap).sort().map(key => ({
          ...monthMap[key],
          monthName: formatDate(key + '-01').split('/')[1] + '/' + key.split('-')[0].slice(2)
        })).slice(-12); // Last 12 months

        setMonthlyEvolution(sortedMonths);

        setCompositionData([
          { name: 'Fundo Comum (Patrimônio)', value: accFC },
          { name: 'Taxas e Seguros', value: accFees },
          { name: 'Multas e Juros', value: accEncargos },
          { name: 'Lances Aplicados', value: accBids }
        ]);

        setAdminPerformance(Object.values(adminMap).sort((a, b) => b.total - a.total));

        setRealTotals({
          totalPaid: accTotalPaid + accBids,
          totalFC: accFC,
          totalFees: accFees,
          totalEncargos: accEncargos,
          totalBids: accBids,
          countPaid: accCount,
          avgInstallment: accCount > 0 ? accTotalPaid / accCount : 0,
          efficiency: accProjectedForPaid > 0 ? (accTotalPaid / accProjectedForPaid) : 1
        });

      } catch (error) {
        console.error("Error calculating management dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    calculateManagementData();
  }, [quotas, indices, globalFilters, administrators, selectedQuotaId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        <p className="text-slate-500 font-medium">Processando dados reais...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="text-emerald-600" />
            Dashboard Gerencial <span className="text-sm font-normal text-slate-500 ml-2">(Dados Efetivados)</span>
          </h1>
          <p className="text-slate-500">Análise financeira baseada exclusivamente em pagamentos realizados.</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2">
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <Building2 size={18} className="text-slate-400 ml-2" />
              <select 
                value={globalFilters.companyId} 
                onChange={(e) => {
                  setGlobalFilters({ ...globalFilters, companyId: e.target.value });
                  setSelectedQuotaId(''); 
                }}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-36 cursor-pointer"
              >
                <option value="">Empresa (Todas)</option>
                {companies.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <Filter size={18} className="text-slate-400 ml-2" />
              <select 
                value={globalFilters.administratorId} 
                onChange={(e) => {
                  setGlobalFilters({ ...globalFilters, administratorId: e.target.value });
                  setSelectedQuotaId(''); 
                }}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-40 cursor-pointer"
              >
                <option value="">Admin (Todas)</option>
                {administrators.map(adm => (
                  <option key={adm.id} value={adm.id}>{adm.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <Filter size={18} className="text-slate-400 ml-2" />
              <select 
                value={globalFilters.productType} 
                onChange={(e) => {
                  setGlobalFilters({ ...globalFilters, productType: e.target.value });
                  setSelectedQuotaId(''); 
                }}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-32 cursor-pointer"
              >
                <option value="">Produto (Todos)</option>
                <option value="VEICULO">Veículo</option>
                <option value="IMOVEL">Imóvel</option>
              </select>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <FileText size={18} className="text-slate-400 ml-2" />
              <select 
                value={selectedQuotaId} 
                onChange={(e) => setSelectedQuotaId(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-48 cursor-pointer"
              >
                <option value="">Todas as Cotas</option>
                {quotas
                  .filter(q => {
                    const matchCompany = !globalFilters.companyId || q.companyId === globalFilters.companyId;
                    const matchAdmin = !globalFilters.administratorId || q.administratorId === globalFilters.administratorId;
                    const matchProduct = !globalFilters.productType || q.productType === globalFilters.productType;
                    return matchCompany && matchAdmin && matchProduct;
                  })
                  .map(q => (
                  <option key={q.id} value={q.id}>
                    {q.group} / {q.quotaNumber} {q.companyId ? `(${companies.find(c => c.id === q.companyId)?.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <DollarSign size={20} />
            </div>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Realizado</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Total Desembolsado</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(realTotals.totalPaid)}</h3>
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
            <Info size={12} />
            <span>Inclui parcelas e lances pagos</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <PiggyBank size={20} />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Patrimônio (Fundo Comum)</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(realTotals.totalFC)}</h3>
          <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <ArrowUpRight size={12} />
            <span>{formatPercent((realTotals.totalFC / realTotals.totalPaid) * 100)} do total</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <ShieldCheck size={20} />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Custo (Taxas/Seguros)</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(realTotals.totalFees)}</h3>
          <div className="mt-3 flex items-center gap-1 text-xs text-amber-600">
             <span>{formatPercent((realTotals.totalFees / realTotals.totalPaid) * 100)} do total</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <p className="text-sm text-slate-500 font-medium">Encargos (Multas/Juros)</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{formatCurrency(realTotals.totalEncargos)}</h3>
          <div className="mt-3 flex items-center gap-1 text-xs text-rose-600">
            {realTotals.totalEncargos > 0 ? (
              <>
                <ArrowUpRight size={12} />
                <span>Custo extra por atrasos</span>
              </>
            ) : (
              <span>Nenhum encargo registrado</span>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Evolution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 size={18} className="text-emerald-600" />
              Evolução de Desembolso Mensal
            </h3>
          </div>
          <div className="h-80 min-h-[320px]">
            {monthlyEvolution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyEvolution}>
                  <defs>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="monthName" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(value) => `R$ ${value/1000}k`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Area type="monotone" dataKey="real" name="Total Pago" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorReal)" />
                  <Line type="monotone" dataKey="projected" name="Projetado" stroke="#94a3b8" strokeDasharray="5 5" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem dados para exibir evolução
              </div>
            )}
          </div>
        </div>

        {/* Composition Pie */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <PieChart size={18} className="text-emerald-600" />
              Composição do Desembolso Real
            </h3>
          </div>
          <div className="h-80 min-h-[320px] flex flex-col md:flex-row items-center">
            <div className="w-full md:w-1/2 h-full min-h-[200px]">
              {compositionData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={compositionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {compositionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </RePieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  Sem dados de composição
                </div>
              )}
            </div>
            <div className="w-full md:w-1/2 space-y-4">
              {compositionData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-sm text-slate-600">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{formatPercent((item.value / realTotals.totalPaid) * 100)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Admin Performance & Efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Building2 size={18} className="text-emerald-600" />
            Desembolso por Administradora
          </h3>
          <div className="space-y-4">
            {adminPerformance.map((admin, index) => (
              <div key={admin.name} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-700">{admin.name}</span>
                  <span className="text-slate-500">{formatCurrency(admin.total)} ({admin.count} parcelas)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-1000" 
                    style={{ width: `${(admin.total / adminPerformance[0].total) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-emerald-900 text-white p-6 rounded-xl shadow-lg flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp size={120} />
          </div>
          
          <div>
            <h3 className="text-emerald-300 font-medium mb-1">Custo Médio por Parcela</h3>
            <p className="text-3xl font-bold">{formatCurrency(realTotals.avgInstallment)}</p>
          </div>

          <div className="mt-8 space-y-4">
            <div className="p-4 bg-white/10 rounded-lg backdrop-blur-sm">
              <p className="text-emerald-300 text-xs uppercase tracking-wider font-bold mb-1">Eficiência Financeira</p>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold">{formatPercent(realTotals.efficiency * 100)}</span>
                <span className="text-xs text-emerald-200 mb-1">vs. Plano Original</span>
              </div>
              <div className="mt-2 w-full bg-white/20 rounded-full h-1.5">
                <div 
                  className={`h-1.5 rounded-full ${realTotals.efficiency <= 1 ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  style={{ width: `${Math.min(100, realTotals.efficiency * 100)}%` }}
                ></div>
              </div>
            </div>
            
            <p className="text-xs text-emerald-300/80 italic">
              * A eficiência acima de 100% indica que o custo real está superando o projetado devido a reajustes de índices ou encargos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagementDashboard;
