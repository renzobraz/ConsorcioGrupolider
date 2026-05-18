
import React, { useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatDate } from '../utils/formatters';
import { 
  CheckCircle2, 
  XCircle, 
  FileText, 
  ExternalLink, 
  AlertTriangle, 
  Search,
  ShieldCheck,
  Eye,
  MessageSquare,
  Clock,
  Building2,
  TrendingUp,
  DollarSign
} from 'lucide-react';
import { generateSchedule, calculateScheduleSummary } from '../services/calculationService';
import { calculateMarketAnalysis } from '../services/marketService';
import { db } from '../services/database';
import { Loader } from 'lucide-react';

const AdModeration = () => {
  const { quotas, administrators, updateQuota, indices, allCreditUpdates, allCreditUsages } = useConsortium();
  const [filter, setFilter] = useState('');
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Carregar análise detalhada quando uma cota é selecionada
  const loadAnalysis = async (quota: any) => {
    setIsLoading(true);
    try {
      const [payments, manualTransactions] = await Promise.all([
        db.getPayments(quota.id),
        db.getManualTransactions(quota.id)
      ]);
      
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
          
          // Se não tiver no JSON, usa o que foi calculado agora
          const schedule = generateSchedule({ ...quota, manualTransactions }, indices, payments);
          const summary = calculateScheduleSummary(quota, schedule, payments);
          paidAmount = summary.paid.total;
          debtBalance = summary.toPay.total;
        }
      } else {
        // Sem notas, usa o que foi calculado agora
        const schedule = generateSchedule({ ...quota, manualTransactions }, indices, payments);
        const summary = calculateScheduleSummary(quota, schedule, payments);
        paidAmount = summary.paid.total;
        debtBalance = summary.toPay.total;
      }

      const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === quota.id);
      const latestUpdateValue = quotaUpdates.length > 0 
        ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
        : 0;
      
      const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id);
      const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

      const result = calculateMarketAnalysis(
        quota, 
        indices, 
        paidAmount, 
        debtBalance, 
        customAgio,
        latestUpdateValue,
        creditoUtilizado
      );
      setAnalysis(result);
    } catch (err) {
      console.error("Failed to load analysis", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrando cotas que estão pendentes de aprovação no marketplace
  const pendingAds = useMemo(() => {
    return quotas.filter(q => q.marketStatus === 'PENDING' || q.isAnnounced);
  }, [quotas]);

  const filteredAds = pendingAds.filter(q => 
    q.group.includes(filter) || 
    q.quotaNumber.includes(filter) ||
    (q.contractNumber && q.contractNumber.includes(filter))
  );

  const handleApprove = async (quota: any) => {
    try {
      const updated = {
        ...quota,
        marketStatus: 'PUBLISHED',
        isAnnounced: true
      };
      await updateQuota(updated);
      setSelectedAd(null);
      alert('Anúncio aprovado e publicado no marketplace!');
    } catch (err) {
      console.error(err);
      alert('Erro ao aprovar anúncio.');
    }
  };

  const handleReject = async (quota: any) => {
    const reason = prompt('Motivo da reprovação:');
    if (!reason) return;

    try {
      const updated = {
        ...quota,
        marketStatus: 'DRAFT',
        isAnnounced: false,
        marketNotes: reason
      };
      await updateQuota(updated);
      setSelectedAd(null);
      alert('Anúncio reprovado e vendedor notificado.');
    } catch (err) {
      console.error(err);
      alert('Erro ao reprovar anúncio.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Moderação de Anúncios</h1>
          <p className="text-slate-500">Valide os dados das cotas e os extratos anexados antes da publicação</p>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold text-sm border border-amber-100">
          <Clock size={18} />
          {pendingAds.length} anúncios aguardando revisão
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Anúncios Pendentes */}
        <div className="lg:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Filtrar por Grupo/Cota..." 
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm max-h-[600px] overflow-y-auto custom-scrollbar">
            {filteredAds.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredAds.map((ad) => (
                  <button 
                    key={ad.id}
                    onClick={() => {
                      setSelectedAd(ad);
                      loadAnalysis(ad);
                    }}
                    className={`w-full p-4 text-left hover:bg-slate-50 transition-colors flex items-center justify-between group ${selectedAd?.id === ad.id ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : ''}`}
                  >
                    <div>
                      <div className="font-bold text-slate-800">Gp: {ad.group} / Cota: {ad.quotaNumber}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1 mt-1">
                        <Building2 size={10} />
                        {administrators.find(a => a.id === ad.administratorId)?.name || 'Administradora'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-600">{formatCurrency(ad.marketValueOverride || 0)}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold">Ágio Sugerido</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                <ShieldCheck size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Nenhum anúncio pendente</p>
              </div>
            )}
          </div>
        </div>

        {/* Área de Moderação (Split View) */}
        <div className="lg:col-span-2">
          {selectedAd ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <Eye size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Revisão de Cota</h3>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">ID: {selectedAd.id.slice(0,8)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleReject(selectedAd)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-sm hover:bg-red-100 transition-colors"
                  >
                    <XCircle size={18} /> Reprovar
                  </button>
                  <button 
                    onClick={() => handleApprove(selectedAd)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100"
                  >
                    <CheckCircle2 size={18} /> Aprovar e Publicar
                  </button>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-x divide-slate-100">
                {/* Dados Digitados */}
                <div className="p-6 space-y-6 overflow-y-auto">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <FileText size={14} /> Dados Declarados
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Crédito Disponível</span>
                      <span className="text-sm font-bold text-slate-700">{analysis ? formatCurrency(analysis.availableCredit) : '...'}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Status</span>
                      <span className="text-sm font-bold text-emerald-600">{selectedAd.isContemplated ? 'Contemplada' : 'Ativa'}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Investido</span>
                      <span className="text-sm font-bold text-slate-700">{analysis ? formatCurrency(analysis.investedAmount) : '...'}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Ágio Pedido</span>
                      <span className="text-sm font-black text-blue-600">{formatCurrency(selectedAd.marketValueOverride || 0)}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Fundo Reserva Acum.</span>
                      <span className="text-sm font-bold text-slate-700">{formatCurrency(selectedAd.reserveFundAccumulated || 0)}</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Seguro (%)</span>
                      <span className="text-sm font-bold text-slate-700">{(selectedAd.insuranceRate || 0).toFixed(2)}%</span>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                      <Loader className="animate-spin mb-2" size={24} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Calculando...</p>
                    </div>
                  ) : analysis && (
                    <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-lg">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Simulação de Liquidação</span>
                        <DollarSign size={14} className="text-emerald-400" />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Preço de Repasse (Comprador)</span>
                          <span className="font-bold">{formatCurrency(analysis.buyerEntry)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Comissão Líder</span>
                          <span className="font-bold text-red-400">-{formatCurrency(analysis.platformFee)}</span>
                        </div>
                        <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                          <span className="text-sm font-bold">Líquido Vendedor</span>
                          <span className="text-lg font-black text-emerald-400">{formatCurrency(analysis.investedAmount + analysis.sellerNetPayout)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-3">
                    <h5 className="text-xs font-bold text-blue-800 flex items-center gap-2">
                      <ShieldCheck size={14} /> Análise de Segurança
                    </h5>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-blue-600">Vendedor Validado (KYC)</span>
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-blue-600">Cota sem restrições</span>
                        <CheckCircle2 size={12} className="text-emerald-500" />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      <AlertTriangle size={12} className="inline mr-1 mb-0.5" />
                      Confira se o valor do crédito e o saldo devedor no extrato batem com o que foi cadastrado. Divergências acima de 1% devem ser reprovadas.
                    </p>
                  </div>
                </div>

                {/* Visualizador de Documento */}
                <div className="bg-slate-100 flex flex-col items-center justify-center p-8 text-center relative">
                  {selectedAd.contractFileUrl ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                      <div className="w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center text-red-500">
                        <FileText size={48} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">Extrato_Cota_{selectedAd.group}_{selectedAd.quotaNumber}.pdf</p>
                        <p className="text-xs text-slate-400">Documento anexado pelo vendedor</p>
                      </div>
                      <a 
                        href={selectedAd.contractFileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-4 flex items-center gap-2 px-6 py-3 bg-white text-slate-800 rounded-xl font-bold text-sm shadow-md hover:bg-slate-50 transition-all"
                      >
                        <ExternalLink size={18} /> Abrir em Nova Aba
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-400">
                        <AlertTriangle size={40} />
                      </div>
                      <p className="text-slate-500 font-medium">Nenhum extrato anexado</p>
                      <button className="text-emerald-600 font-bold text-sm hover:underline flex items-center gap-1 mx-auto">
                        <MessageSquare size={16} /> Solicitar Extrato via Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[600px] bg-white rounded-2xl border border-slate-200 border-dashed flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck size={64} className="opacity-10" />
              </div>
              <h3 className="text-xl font-bold text-slate-600 mb-2">Selecione um anúncio</h3>
              <p className="max-w-xs">Escolha uma cota na lista ao lado para iniciar o processo de moderação e auditoria.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdModeration;
