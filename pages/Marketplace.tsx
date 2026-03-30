
import React, { useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { calculateMarketAnalysis } from '../services/marketService';
import { generateSchedule } from '../services/calculationService';
import { formatCurrency } from '../utils/formatters';
import { 
  Search, 
  Filter, 
  TrendingUp, 
  ArrowRight, 
  ShieldCheck, 
  Building2, 
  Calendar, 
  DollarSign,
  BadgeCheck,
  Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Marketplace = () => {
  const { quotas, indices, administrators, allCreditUpdates, allCreditUsages } = useConsortium();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');

  // Filtrando apenas cotas que foram "Anunciadas"
  const marketplaceQuotas = useMemo(() => {
    return quotas
      .filter(q => q.isAnnounced)
      .map(quota => {
        // Extrair dados do ágio e financeiros das notas se existir (formato JSON)
        let customAgio = 0;
        let paidAmount = 0;
        let debtBalance = 0;

        if (quota.marketNotes) {
          try {
            const data = JSON.parse(quota.marketNotes);
            customAgio = data.customAgio || 0;
            paidAmount = data.paidAmount || 0;
            debtBalance = data.debtBalance || 0;
            
            // Novos campos para o Raio-X
            quota.reserveFundAccumulated = data.reserveFundAccumulated || 0;
            quota.insuranceRate = data.insuranceRate || 0;
            quota.insuranceValue = data.insuranceValue || 0;
          } catch (e) {
            // Fallback para formato antigo de texto
            if (quota.marketNotes.includes('Ágio definido pelo vendedor:')) {
              const match = quota.marketNotes.match(/Ágio definido pelo vendedor: ([\d.]+)/);
              if (match) customAgio = parseFloat(match[1]);
            }
            
            // Se não tiver no JSON, calcula o básico (pode ser impreciso, mas é o fallback)
            const schedule = generateSchedule(quota, indices);
            paidAmount = schedule.filter(i => i.isPaid).reduce((sum, i) => sum + (i.realAmountPaid || i.totalInstallment) + (i.bidFreeApplied || 0), 0);
            debtBalance = schedule.filter(i => !i.isPaid).reduce((sum, i) => sum + i.totalInstallment, 0);
          }
        } else {
          // Sem notas, calcula o básico
          const schedule = generateSchedule(quota, indices);
          paidAmount = schedule.filter(i => i.isPaid).reduce((sum, i) => sum + (i.realAmountPaid || i.totalInstallment) + (i.bidFreeApplied || 0), 0);
          debtBalance = schedule.filter(i => !i.isPaid).reduce((sum, i) => sum + i.totalInstallment, 0);
        }

        const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === quota.id);
        const latestUpdateValue = quotaUpdates.length > 0 
          ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
          : 0;
        
        const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id);
        const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

        const analysis = calculateMarketAnalysis(
          quota, 
          indices, 
          paidAmount, 
          debtBalance, 
          customAgio,
          latestUpdateValue,
          creditoUtilizado
        );
        return { quota, analysis };
      });
  }, [quotas, indices, allCreditUpdates, allCreditUsages]);

  const filtered = marketplaceQuotas.filter(item => 
    item.quota.productType.toLowerCase().includes(filter.toLowerCase()) ||
    administrators.find(a => a.id === item.quota.administratorId)?.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Section */}
      <div className="bg-slate-900 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-6 border border-emerald-500/30">
            <ShieldCheck size={14} /> Intermediação Garantida
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">
            Oportunidades em <span className="text-emerald-500">Consórcios</span> Selecionados.
          </h1>
          <p className="text-slate-400 text-lg mb-8">
            Compre cotas contempladas e ativas com total segurança. A Grupo Líder garante a transferência e o pagamento.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              <input 
                type="text" 
                placeholder="Buscar por administradora ou tipo..." 
                className="w-full bg-white/10 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-white placeholder:text-slate-500"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
        </div>
        {/* Abstract Background Element */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-emerald-500/10 to-transparent pointer-events-none"></div>
      </div>

      {/* Trust Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <BadgeCheck size={24} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Cotas Auditadas</h4>
            <p className="text-slate-500 text-xs">Dados validados com a administradora.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Pagamento Escrow</h4>
            <p className="text-slate-500 text-xs">Seu dinheiro seguro até a transferência.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h4 className="font-bold text-slate-800 text-sm">Transferência Assistida</h4>
            <p className="text-slate-500 text-xs">Suporte jurídico em todo o processo.</p>
          </div>
        </div>
      </div>

      {/* Grid de Cotas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filtered.map((item) => (
          <div key={item.quota.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden hover:shadow-xl transition-all group flex flex-col">
            {/* Card Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 relative">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-wrap gap-2">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    item.quota.isContemplated ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.quota.isContemplated ? 'Contemplada' : 'Ativa'}
                  </div>
                  {item.analysis.isLowCET && (
                    <div className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                      <TrendingUp size={10} /> Baixo CET
                    </div>
                  )}
                  {item.analysis.isHighReserveFund && (
                    <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                      <Building2 size={10} /> Fundo Reserva Alto
                    </div>
                  )}
                </div>
                <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Ref: {item.quota.id.slice(0, 8).toUpperCase()}
                </div>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-1">
                Crédito {formatCurrency(item.analysis.availableCredit)}
              </h3>
              <p className="text-slate-500 text-sm font-medium">
                {administrators.find(a => a.id === item.quota.administratorId)?.name || 'Administradora'}
              </p>
            </div>

            {/* Card Body */}
            <div className="p-6 space-y-4 flex-1">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-emerald-600 uppercase font-black">Valor de Entrada</span>
                    <div className="flex items-center gap-1">
                      <ShieldCheck size={12} className="text-emerald-500" />
                      <span className="text-[8px] text-emerald-500 font-bold uppercase tracking-tighter tracking-widest">Garantia Escrow</span>
                    </div>
                  </div>
                  <div className="text-2xl font-black text-emerald-700">
                    {formatCurrency(item.analysis.buyerEntry)}
                  </div>
                  <p className="text-[9px] text-emerald-600 mt-1 font-medium italic">
                    * Ágio + Taxas de Intermediação
                  </p>
                </div>
                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full -mr-8 -mt-8"></div>
              </div>

              {/* Raio-X da Cota */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Search size={12} className="text-blue-500" />
                    Raio-X da Cota
                  </h4>
                  <div className="flex gap-1">
                    <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Análise Fintech</span>
                  </div>
                </div>

                {/* KPIs Principais */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
                    <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">CET Anual</span>
                    <span className="text-xs font-black text-slate-700">{item.analysis.cet.toFixed(1)}%</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
                    <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">Economia</span>
                    <span className="text-xs font-black text-emerald-600">{formatCurrency(item.analysis.realSavings).split(',')[0]}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-100 text-center">
                    <span className="text-[8px] text-slate-400 uppercase font-bold block mb-0.5">Devolução</span>
                    <span className="text-xs font-black text-blue-600">{formatCurrency(item.analysis.futureRefund).split(',')[0]}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Comparativo de Custo Total</span>
                    <span className="text-[10px] font-black text-emerald-600">Economia de {((item.analysis.realSavings / item.analysis.bankFinancingCost) * 100).toFixed(0)}%</span>
                  </div>
                  
                  {/* Gráfico de Comparação Simples */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] font-bold uppercase text-slate-400">
                        <span>Custo desta Cota</span>
                        <span>{formatCurrency(item.analysis.totalQuotaCost)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${(item.analysis.totalQuotaCost / item.analysis.bankFinancingCost) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[8px] font-bold uppercase text-slate-400">
                        <span>Financiamento Bancário</span>
                        <span>{formatCurrency(item.analysis.bankFinancingCost)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-400 rounded-full w-full"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Saldo Devedor</span>
                  <span className="text-sm font-bold text-slate-600">{formatCurrency(item.analysis.debtBalance)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Parcelas</span>
                  <span className="text-sm font-bold text-slate-600">{item.quota.termMonths} meses</span>
                </div>
              </div>
            </div>

            {/* Card Footer */}
            <div className="p-6 pt-0">
              <button 
                onClick={() => navigate(`/negotiation/${item.quota.id}`)}
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 group-hover:bg-emerald-600 transition-all shadow-lg shadow-slate-200 group-hover:shadow-emerald-200"
              >
                Analisar Oportunidade <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-100 p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-slate-400">
            <Info size={24} />
          </div>
          <p className="text-sm text-slate-600 max-w-md">
            Os valores de ágio e saldo devedor são atualizados diariamente com base nos índices de correção das administradoras.
          </p>
        </div>
        <div className="flex gap-4">
          <button className="text-slate-600 font-bold text-sm hover:underline">Termos de Uso</button>
          <button className="text-slate-600 font-bold text-sm hover:underline">Política de Privacidade</button>
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
