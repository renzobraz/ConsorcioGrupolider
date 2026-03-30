
import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, 
  MessageSquare, 
  DollarSign, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Lock,
  Send,
  AlertTriangle,
  Download,
  ArrowRightLeft,
  Info,
  PlusCircle
} from 'lucide-react';
import { calculateSettlement, COMMISSION_CONFIG, getRefundAmount } from '../services/commissionService';
import { formatCurrency } from '../utils/formatters';

const NegotiationRoom = () => {
  const [step, setStep] = useState(3); // Passo 3: Pagamento Escrow Realizado
  const [message, setMessage] = useState('');
  const agioValue = 42000; // Valor negociado

  const settlement = useMemo(() => calculateSettlement(agioValue), [agioValue]);

  const steps = [
    { id: 1, label: 'Proposta', icon: <MessageSquare size={18} /> },
    { id: 2, label: 'KYC / Documentos', icon: <ShieldCheck size={18} /> },
    { id: 3, label: 'Pagamento Escrow', icon: <Lock size={18} /> },
    { id: 4, label: 'Transferência', icon: <FileText size={18} /> },
    { id: 5, label: 'Finalizado', icon: <CheckCircle2 size={18} /> },
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 bg-slate-50 min-h-screen">
      {/* Header da Negociação */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-slate-800">Negociação #88291</h1>
            <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">ID: GL-9920</span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Cota Porto Seguro - Crédito R$ 250.000,00 | Grupo 1202 Cota 441</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full font-bold text-sm border border-emerald-100 shadow-sm">
          <ShieldCheck size={20} />
          Intermediação Blindada Ativa
        </div>
      </div>

      {/* Stepper Visual */}
      <div className="grid grid-cols-5 gap-4">
        {steps.map((s) => (
          <div key={s.id} className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all ${
            step === s.id ? 'bg-emerald-600 text-white shadow-lg scale-105 ring-4 ring-emerald-100' : 
            step > s.id ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
            'bg-white text-slate-400 border border-slate-200'
          }`}>
            {s.id < step ? <CheckCircle2 size={18} /> : s.icon}
            <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna da Esquerda: Chat e Certificado */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          {/* Certificado de Reserva (Aparece após o pagamento) */}
          {step >= 3 && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden border border-slate-700">
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">
                    <Lock size={12} /> Recurso Bloqueado em Escrow
                  </div>
                  <h2 className="text-2xl font-black">Certificado de Reserva Emitido</h2>
                  <p className="text-slate-400 text-sm max-w-md">
                    O comprador depositou <span className="text-white font-bold">{formatCurrency(agioValue)}</span>. 
                    O valor está garantido pela Grupo Líder. Inicie a transferência agora.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full md:w-auto">
                  <button className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all shadow-lg">
                    <Download size={18} /> Baixar Certificado
                  </button>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                    <Clock size={14} /> Prazo: {COMMISSION_CONFIG.TRANSFER_DEADLINE_DAYS} dias úteis
                  </div>
                </div>
              </div>
              {/* Background Decoration */}
              <div className="absolute -right-10 -bottom-10 opacity-10">
                <ShieldCheck size={200} />
              </div>
            </div>
          )}

          {/* Chat Seguro */}
          <div className="flex-1 flex flex-col h-[500px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-bold text-slate-600">Canal de Comunicação Seguro</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold uppercase">
                <AlertTriangle size={12} /> Proibido trocar contatos
              </div>
            </div>
            
            <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-slate-50/30">
              <div className="bg-white p-4 rounded-2xl rounded-tl-none max-w-[80%] text-sm text-slate-700 shadow-sm border border-slate-100">
                Olá! Tenho interesse na sua cota. O valor do ágio é negociável?
              </div>
              <div className="bg-emerald-600 p-4 rounded-2xl rounded-tr-none max-w-[80%] ml-auto text-sm text-white shadow-md">
                Olá! Podemos chegar em R$ 42.000,00 para fecharmos agora via Escrow.
              </div>
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-center">
                <div className="flex items-center justify-center gap-2 text-blue-700 font-bold text-xs mb-1">
                  <Lock size={14} /> PAGAMENTO CONFIRMADO
                </div>
                <p className="text-[10px] text-blue-600">O valor de {formatCurrency(agioValue)} está em custódia na conta garantia da Grupo Líder.</p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex gap-2">
              <input 
                type="text" 
                placeholder="Digite sua mensagem..." 
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-all shadow-md active:scale-95">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Coluna da Direita: Liquidação e Split */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <ArrowRightLeft size={20} className="text-emerald-600" />
              Liquidação da Transação
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Valor Bruto (Ágio)</span>
                <span className="font-bold text-slate-800">{formatCurrency(settlement.agioValue)}</span>
              </div>
              
              <div className="flex justify-between text-sm items-center">
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Comissão Intermediação</span>
                  {settlement.minCommissionApplied && (
                    <div className="group relative">
                      <Info size={12} className="text-slate-400 cursor-help" />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Aplicado valor mínimo operacional de {formatCurrency(COMMISSION_CONFIG.MIN_VALUE)}
                      </div>
                    </div>
                  )}
                </div>
                <span className="font-bold text-red-500">-{formatCurrency(settlement.commissionValue)}</span>
              </div>

              <div className="h-[1px] bg-slate-100 my-2"></div>
              
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Líquido Vendedor</span>
                  <span className="font-black text-emerald-600 text-xl">{formatCurrency(settlement.sellerNetValue)}</span>
                </div>
                <p className="text-[10px] text-emerald-600/70 font-medium">Liberação imediata após upload do termo assinado.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Taxas de Gateway</span>
                <span className="text-xs font-bold text-slate-500">{formatCurrency(settlement.gatewayFees)}</span>
              </div>
            </div>
          </div>

          {/* Status da Transferência */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Próximo Passo</h4>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Enviar Termo de Cessão</p>
                <p className="text-xs text-slate-500">Anexe o documento validado pela administradora para liberar o pagamento.</p>
              </div>
            </div>
            <button className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg flex items-center justify-center gap-2">
              <PlusCircle size={18} /> FAZER UPLOAD DO TERMO
            </button>
          </div>

          {/* Alerta de Estorno */}
          <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-3">
            <AlertTriangle size={20} className="text-red-500 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-red-700">Política de Estorno</h5>
              <p className="text-[10px] text-red-600 mt-1">
                Caso a transferência seja negada pela administradora, o comprador será reembolsado em {formatCurrency(getRefundAmount(agioValue))}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NegotiationRoom;
