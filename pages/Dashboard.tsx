
import React, { useState, useEffect } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { Building2, Gavel, DollarSign, Wallet, CheckCircle2, AlertCircle, Loader, PlayCircle, TrendingUp, Percent, FileText, CalendarClock, X, ArrowRight, Filter, PieChart, Layers, PiggyBank, ShoppingBag, BadgeCheck } from 'lucide-react';

// Função para calcular a TIR (Taxa Interna de Retorno) / IRR
// Método de Newton-Raphson
const calculateIRR = (cashFlows: number[], guess = 0.01): number | null => {
  const maxIter = 1000;
  const precision = 1e-7;
  let rate = guess;

  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dNpv = 0;
    
    for (let t = 0; t < cashFlows.length; t++) {
      const div = Math.pow(1 + rate, t);
      npv += cashFlows[t] / div;
      dNpv -= (t * cashFlows[t]) / (div * (1 + rate));
    }

    if ((Math.abs(npv) < precision) || (Math.abs(dNpv) < precision)) {
      return rate;
    }

    const newRate = rate - npv / dNpv;
    if (Math.abs(newRate - rate) < precision) return newRate;
    
    rate = newRate;
  }
  return null; // Não convergiu
};

const Dashboard = () => {
  const { quotas, companies, indices } = useConsortium();
  
  // Filters State
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedQuotaId, setSelectedQuotaId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(''); // '' | 'ACTIVE' | 'CONTEMPLATED'
  
  const [loading, setLoading] = useState(true);
  
  // State for Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nextMaturitiesList, setNextMaturitiesList] = useState<any[]>([]);

  const [totals, setTotals] = useState({
    contemplatedCount: 0,
    activeCount: 0,
    
    totalCredit: 0, // Crédito Líquido Total
    totalContemplatedCredit: 0, // Crédito Líquido Contempladas
    
    bidFree: 0,
    bidEmbedded: 0,
    
    avgTotalBidPct: 0,
    avgFreeBidPct: 0,

    totalCreditUpdate: 0,
    totalReserveFund: 0, // Fundo Reserva Total a Receber
    totalCreditUsed: 0,  // Crédito Utilizado (Compras)
    totalAvailableCredit: 0, // Saldo Disponível Potencial (Tudo)
    totalAvailableContemplatedOnly: 0, // NOVO: Saldo Liberado Real (Apenas Contempladas)

    // Métricas Alinhadas com Simulação
    globalTotalPaid: 0,       // "TOTAL PAGO" (Vencidos + Lances)
    globalTotalToPay: 0,      // "Saldo Devedor" (Futuros)
    
    globalPercentPaid: 0,
    globalPercentToPay: 0,

    weightedMonthlyCET: 0,
    weightedAnnualCET: 0,

    // Next Maturities
    totalNextMaturityValue: 0
  });

  useEffect(() => {
    const calculateDashboard = async () => {
      setLoading(true);
      
      const todayObj = new Date();
      const todayStr = todayObj.getFullYear() + '-' + String(todayObj.getMonth() + 1).padStart(2, '0') + '-' + String(todayObj.getDate()).padStart(2, '0');

      try {
        const allUsages = await db.getAllCreditUsages();

        const filteredQuotas = quotas.filter(q => {
          const matchCompany = !selectedCompany || q.companyId === selectedCompany;
          const matchQuota = !selectedQuotaId || q.id === selectedQuotaId;
          
          let matchStatus = true;
          if (selectedStatus === 'ACTIVE') matchStatus = !q.isContemplated;
          if (selectedStatus === 'CONTEMPLATED') matchStatus = q.isContemplated;

          return matchCompany && matchQuota && matchStatus;
        });

        let accContemplated = 0;
        let accActive = 0;
        
        let accCreditLiquidTotal = 0;
        let accCreditLiquidContemplated = 0;
        
        let accBidFree = 0;
        let accBidEmbedded = 0;
        
        let sumTotalBidPct = 0;
        let sumFreeBidPct = 0;
        let bidCount = 0;

        let accCreditUpdate = 0;
        let accTotalReserveFund = 0;
        let accCreditUsed = 0;
        let accAvailableContemplatedOnly = 0;

        let accGlobalPaid = 0;
        let accGlobalToPay = 0;

        let accumulatedMonthlyCostWeighted = 0;
        let accumulatedAnnualCostWeighted = 0;
        let totalCreditForWeighting = 0;

        const nextInstallments: any[] = [];

        filteredQuotas.forEach(quota => {
          const schedule = generateSchedule(quota, indices);
          let baseCreditValue = quota.creditValue;

          if (schedule.length > 0) {
             const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= todayStr);
             if (pastOrPresent.length > 0) {
                 baseCreditValue = pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || quota.creditValue;
             } else {
                 baseCreditValue = schedule[0].correctedCreditValue || quota.creditValue;
             }
          }
          
          const embeddedBid = quota.bidEmbedded || 0;
          const netCredit = baseCreditValue - embeddedBid;
          const manualAdj = (quota.creditManualAdjustment || 0);

          const quotaUsages = allUsages.filter(u => u.quotaId === quota.id);
          const usageSum = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

          if (quota.isContemplated) {
            accContemplated++;
            accCreditLiquidContemplated += netCredit;
            
            // Cálculo do Disponível apenas se contemplada: (Carta + Ajuste - Embutido) - Uso
            const availInQuota = (netCredit + manualAdj) - usageSum;
            accAvailableContemplatedOnly += Math.max(0, availInQuota);
          } else {
            accActive++;
          }

          accCreditLiquidTotal += netCredit;
          accBidFree += (quota.bidFree || 0);
          accBidEmbedded += embeddedBid;
          accCreditUpdate += manualAdj;
          accCreditUsed += usageSum;

          if (quota.isContemplated && baseCreditValue > 0 && quota.bidTotal && quota.bidTotal > 0) {
              const totalPct = (quota.bidTotal / baseCreditValue) * 100;
              const freePct = (quota.bidFree || 0) / baseCreditValue * 100;
              sumTotalBidPct += totalPct;
              sumFreeBidPct += freePct;
              bidCount++;
          }
          
          let quotaPaid = 0;
          let quotaToPay = 0;
          let nextInstallmentFound = false;

          schedule.forEach(inst => {
              const instDateStr = inst.dueDate.split('T')[0];
              const isMatured = instDateStr <= todayStr;
              accTotalReserveFund += inst.reserveFund;

              if (isMatured) {
                  quotaPaid += inst.commonFund + inst.reserveFund + inst.adminFee + (inst.manualFine || 0) + (inst.manualInterest || 0);
              } else {
                  quotaToPay += inst.commonFund + inst.reserveFund + inst.adminFee;
                  if (!nextInstallmentFound) {
                      nextInstallments.push({
                          quotaId: quota.id,
                          group: quota.group,
                          quotaNumber: quota.quotaNumber,
                          companyId: quota.companyId,
                          dueDate: instDateStr,
                          amount: inst.totalInstallment,
                          installmentNumber: inst.installmentNumber
                      });
                      nextInstallmentFound = true;
                  }
              }

              if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
                  const bidFR = (inst.bidAbatementFR || 0);
                  quotaPaid += (inst.bidAbatementFC || 0) + bidFR + (inst.bidAbatementTA || 0);
                  accTotalReserveFund += bidFR;
              }
          });

          accGlobalPaid += quotaPaid;
          accGlobalToPay += quotaToPay;

          const cashFlows = [netCredit];
          schedule.forEach(inst => {
              cashFlows.push(-inst.totalInstallment);
          });

          const irrMonthly = calculateIRR(cashFlows);
          if (irrMonthly !== null && !isNaN(irrMonthly) && netCredit > 0) {
              const irrAnnual = Math.pow(1 + irrMonthly, 12) - 1;
              accumulatedMonthlyCostWeighted += (irrMonthly * netCredit);
              accumulatedAnnualCostWeighted += (irrAnnual * netCredit);
              totalCreditForWeighting += netCredit;
          } else if (netCredit > 0) {
              const totalCostRate = (quota.adminFeeRate || 0) + (quota.reserveFundRate || 0);
              const term = quota.termMonths || 1;
              const monthlySimple = (totalCostRate / term) / 100;
              const annualSimple = monthlySimple * 12;
              accumulatedMonthlyCostWeighted += (monthlySimple * netCredit);
              accumulatedAnnualCostWeighted += (annualSimple * netCredit);
              totalCreditForWeighting += netCredit;
          }
        });

        const avgTotalBid = bidCount > 0 ? sumTotalBidPct / bidCount : 0;
        const avgFreeBid = bidCount > 0 ? sumFreeBidPct / bidCount : 0;
        const avgMonthlyCET = totalCreditForWeighting > 0 ? accumulatedMonthlyCostWeighted / totalCreditForWeighting : 0;
        const avgAnnualCET = totalCreditForWeighting > 0 ? accumulatedAnnualCostWeighted / totalCreditForWeighting : 0;

        const globalTotalContract = accGlobalPaid + accGlobalToPay || 1;
        const pctPaid = (accGlobalPaid / globalTotalContract) * 100;
        const pctToPay = (accGlobalToPay / globalTotalContract) * 100;

        nextInstallments.sort((a,b) => a.dueDate.localeCompare(b.dueDate));
        const sumNextMaturities = nextInstallments.reduce((acc, curr) => acc + curr.amount, 0);
        const totalAvailable = (accCreditLiquidTotal + accCreditUpdate) - accCreditUsed;

        setTotals({
          contemplatedCount: accContemplated,
          activeCount: accActive,
          totalCredit: accCreditLiquidTotal,
          totalContemplatedCredit: accCreditLiquidContemplated,
          bidFree: accBidFree,
          bidEmbedded: accBidEmbedded,
          avgTotalBidPct: avgTotalBid,
          avgFreeBidPct: avgFreeBid,
          totalCreditUpdate: accCreditUpdate,
          totalReserveFund: accTotalReserveFund,
          totalCreditUsed: accCreditUsed,
          totalAvailableCredit: totalAvailable,
          totalAvailableContemplatedOnly: accAvailableContemplatedOnly,
          globalTotalPaid: accGlobalPaid,
          globalTotalToPay: accGlobalToPay,
          globalPercentPaid: pctPaid,
          globalPercentToPay: pctToPay,
          weightedMonthlyCET: avgMonthlyCET,
          weightedAnnualCET: avgAnnualCET,
          totalNextMaturityValue: sumNextMaturities
        });

      } catch (err) {
        console.error("Dashboard calculation error:", err);
      } finally {
        setLoading(false);
      }
    };

    calculateDashboard();
  }, [quotas, selectedCompany, selectedQuotaId, selectedStatus, indices]);

  // --- SECTIONS CONFIGURATION ---
  const sections = [
    {
      title: "Resumo Operacional",
      icon: <CalendarClock size={20} className="text-violet-600"/>,
      cards: [
        {
          title: "Próximos Vencimentos (Total)",
          value: totals.totalNextMaturityValue,
          icon: <CalendarClock size={24} className="text-violet-600" />,
          bg: "bg-violet-50 cursor-pointer hover:bg-violet-100",
          border: "border-violet-100",
          textColor: "text-violet-700",
          isCurrency: true,
          onClick: () => setIsModalOpen(true)
        },
        {
          title: "Cotas Ativas",
          value: totals.activeCount,
          icon: <PlayCircle size={24} className="text-blue-600" />,
          bg: "bg-blue-50",
          border: "border-blue-100",
          textColor: "text-slate-900",
          isCurrency: false
        },
        {
          title: "Cotas Contempladas",
          value: totals.contemplatedCount,
          icon: <CheckCircle2 size={24} className="text-emerald-600" />,
          bg: "bg-emerald-50",
          border: "border-emerald-100",
          textColor: "text-slate-900",
          isCurrency: false
        }
      ]
    },
    {
      title: "Carteira e Créditos",
      icon: <DollarSign size={20} className="text-slate-600"/>,
      cards: [
        {
          title: "Crédito Disponível (Contempladas)",
          value: totals.totalAvailableContemplatedOnly,
          icon: <BadgeCheck size={24} className="text-indigo-600" />,
          bg: "bg-indigo-50 border-indigo-200",
          border: "border-indigo-200",
          textColor: "text-indigo-800",
          isCurrency: true,
          description: "Saldo liberado e pronto para uso"
        },
        {
          title: "Crédito Líquido Total",
          value: totals.totalCredit,
          icon: <DollarSign size={24} className="text-slate-600" />,
          bg: "bg-white",
          border: "border-slate-200",
          textColor: "text-slate-800",
          isCurrency: true
        },
        {
          title: "Total Atualização (+)",
          value: totals.totalCreditUpdate,
          icon: <TrendingUp size={24} className="text-blue-600" />,
          bg: "bg-blue-50",
          border: "border-blue-100",
          textColor: "text-blue-700",
          isCurrency: true
        },
        {
          title: "Crédito Utilizado (Total)",
          value: totals.totalCreditUsed,
          icon: <ShoppingBag size={24} className="text-amber-600" />,
          bg: "bg-amber-50",
          border: "border-amber-100",
          textColor: "text-amber-700",
          isCurrency: true
        },
        {
          title: "Saldo Disponível (Total)",
          value: totals.totalAvailableCredit,
          icon: <Wallet size={24} className="text-emerald-600" />,
          bg: "bg-emerald-50",
          border: "border-emerald-100",
          textColor: "text-emerald-700",
          isCurrency: true
        },
        {
          title: "Fundo Reserva (A Receber)",
          value: totals.totalReserveFund,
          icon: <PiggyBank size={24} className="text-indigo-600" />,
          bg: "bg-indigo-50",
          border: "border-indigo-100",
          textColor: "text-indigo-700",
          isCurrency: true
        },
      ]
    },
    {
      title: "Posição Financeira (Fluxo)",
      icon: <Wallet size={20} className="text-emerald-600"/>,
      cards: [
        {
          title: "TOTAL PAGO",
          value: totals.globalTotalPaid,
          icon: <AlertCircle size={24} className="text-emerald-600" />,
          bg: "bg-emerald-50",
          border: "border-emerald-100",
          textColor: "text-emerald-700",
          isCurrency: true
        },
        {
          title: "% TOTAL PAGO",
          value: formatPercent(totals.globalPercentPaid),
          icon: <Percent size={24} className="text-emerald-600" />,
          bg: "bg-emerald-50",
          border: "border-emerald-100",
          textColor: "text-emerald-700",
          isCurrency: false,
          isRaw: true
        },
        {
          title: "Saldo Devedor (Total)",
          value: totals.globalTotalToPay,
          icon: <Wallet size={24} className="text-red-600" />,
          bg: "bg-red-50",
          border: "border-red-100",
          textColor: "text-red-700",
          isCurrency: true
        },
        {
          title: "% Saldo a Pagar",
          value: formatPercent(totals.globalPercentToPay),
          icon: <Percent size={24} className="text-red-600" />,
          bg: "bg-red-50",
          border: "border-red-100",
          textColor: "text-red-700",
          isCurrency: false,
          isRaw: true
        }
      ]
    },
    {
      title: "Análise de Lances e Custos",
      icon: <Gavel size={20} className="text-amber-600"/>,
      cards: [
        {
          title: "Lance Livre (Total)",
          value: totals.bidFree,
          icon: <Gavel size={24} className="text-amber-600" />,
          bg: "bg-amber-50",
          border: "border-amber-100",
          textColor: "text-slate-700",
          isCurrency: true
        },
        {
          title: "% Médio Lance (S/ Emb)",
          value: formatPercent(totals.avgFreeBidPct),
          icon: <Percent size={24} className="text-cyan-600" />,
          bg: "bg-cyan-50",
          border: "border-cyan-100",
          textColor: "text-cyan-700",
          isCurrency: false,
          isRaw: true
        },
        {
          title: "Lance Embutido (Total)",
          value: totals.bidEmbedded,
          icon: <Gavel size={24} className="text-orange-600" />,
          bg: "bg-orange-50",
          border: "border-orange-100",
          textColor: "text-slate-700",
          isCurrency: true
        },
        {
          title: "CET Anual (TIR Médio)",
          value: formatPercent(totals.weightedAnnualCET * 100),
          icon: <TrendingUp size={24} className="text-pink-600" />,
          bg: "bg-pink-50",
          border: "border-pink-100",
          textColor: "text-pink-700",
          isCurrency: false,
          isRaw: true
        },
      ]
    }
  ];

  return (
    <div className="space-y-8 relative pb-10">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard Gerencial</h1>
          <p className="text-slate-500">Indicadores financeiros, operacionais e Custo Efetivo Total (CET)</p>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2">
            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <Building2 size={18} className="text-slate-400 ml-2" />
              <select 
                value={selectedCompany} 
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-48 cursor-pointer"
              >
                <option value="">Todas as Empresas</option>
                {companies.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <Filter size={18} className="text-slate-400 ml-2" />
              <select 
                value={selectedStatus} 
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-40 cursor-pointer"
              >
                <option value="">Todos os Status</option>
                <option value="ACTIVE">Em Andamento</option>
                <option value="CONTEMPLATED">Contempladas</option>
              </select>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
              <FileText size={18} className="text-slate-400 ml-2" />
              <select 
                value={selectedQuotaId} 
                onChange={(e) => setSelectedQuotaId(e.target.value)}
                className="bg-transparent text-sm text-slate-700 outline-none p-2 w-full md:w-56 cursor-pointer"
              >
                <option value="">Todas as Cotas</option>
                {quotas.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.group} / {q.quotaNumber} {q.companyId ? `(${companies.find(c => c.id === q.companyId)?.name})` : ''}
                  </option>
                ))}
              </select>
            </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-400 gap-2">
           <Loader className="animate-spin" /> Atualizando indicadores...
        </div>
      ) : quotas.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed">
             Nenhuma cota encontrada para gerar indicadores.
          </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section, idx) => (
            <div key={idx}>
               <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2 pl-1">
                  {section.icon}
                  {section.title}
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {section.cards.map((card, cIdx) => (
                    <div 
                      key={cIdx} 
                      onClick={card.onClick ? card.onClick : undefined}
                      className={`p-6 rounded-xl border shadow-sm flex items-center gap-5 transition-transform hover:scale-[1.01] ${card.bg} ${card.border}`}
                    >
                      <div className="p-4 bg-white rounded-full shadow-sm">
                          {card.icon}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{card.title}</p>
                        <p className={`text-2xl font-bold ${card.textColor}`}>
                          {card.isCurrency ? formatCurrency(card.value as number) : (card.isRaw ? card.value : card.value)}
                        </p>
                        {(card as any).description && (
                            <p className="text-[10px] text-slate-400 mt-1">{(card as any).description}</p>
                        )}
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          ))}
        </div>
      )}

      {/* DETAIL MODAL FOR NEXT MATURITIES */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-violet-50">
                      <h3 className="text-lg font-bold text-violet-800 flex items-center gap-2">
                          <CalendarClock size={20} /> Detalhe de Próximos Vencimentos
                      </h3>
                      <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-xs sticky top-0">
                              <tr>
                                  <th className="px-6 py-3">Vencimento</th>
                                  <th className="px-6 py-3">Cota / Grupo</th>
                                  <th className="px-6 py-3">Empresa</th>
                                  <th className="px-6 py-3 text-right">Valor Parcela</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {nextMaturitiesList.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                      <td className="px-6 py-3 font-medium text-slate-700">
                                          {formatDate(item.dueDate)}
                                      </td>
                                      <td className="px-6 py-3 text-slate-600">
                                          {item.group} / {item.quotaNumber}
                                      </td>
                                      <td className="px-6 py-3 text-slate-500 text-xs">
                                          {companies.find(c => c.id === item.companyId)?.name || '-'}
                                      </td>
                                      <td className="px-6 py-3 text-right font-bold text-violet-700">
                                          {formatCurrency(item.amount)}
                                      </td>
                                  </tr>
                              ))}
                              {nextMaturitiesList.length === 0 && (
                                  <tr>
                                      <td colSpan={4} className="p-8 text-center text-slate-400">
                                          Nenhum vencimento futuro encontrado.
                                      </td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                      <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-medium">
                          Fechar
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
