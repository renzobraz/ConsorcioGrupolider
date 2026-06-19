import React from 'react';
import { TrendingUp, Calculator } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { Quota, ProjectionConfig } from '../../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SummarySectionProps {
  currentQuota: Quota;
  detailedSummary: any;
  projectionConfig: ProjectionConfig;
  currentAvgRate: number;
  originalTotal: number;
  projectedTotal: number;
  inflationCost: number;
  finalProjectedCredit: number;
  currentDisplayCredit: number;
  chartData: any[];
}

const SummarySection: React.FC<SummarySectionProps> = ({
  detailedSummary, projectionConfig, currentAvgRate,
  originalTotal, projectedTotal, inflationCost, finalProjectedCredit,
  currentDisplayCredit, chartData
}) => {
  const fmtPct = (val: number) => ((val / (currentDisplayCredit || 1)) * 100).toFixed(4) + '%';

  const summaryRow = (label: string, paid: number, toPay: number, showPct = true) => (
    <div className="flex justify-between items-center">
      <span>{label}:</span>
      <div className="flex gap-12">
        <span>{paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        {showPct && <span className="font-black w-16 text-right">{fmtPct(paid)}</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print:border-none relative">
      {projectionConfig.enabled && (
        <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 px-4 py-1 text-[10px] text-amber-700 font-bold flex items-center justify-center gap-2">
          <TrendingUp size={12} />
          VALORES PROJETADOS: Simulação com base em {projectionConfig.customRate
            ? `taxa fixa de ${projectionConfig.customRate}% a.a.`
            : `média de ${projectionConfig.periodMonths} meses (${currentAvgRate.toFixed(4)}% a.m.)`}.
        </div>
      )}

      {/* Resumo Pago */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo Pago (Histórico)</h3>
        <div className="space-y-1.5 text-xs font-medium text-slate-800">
          {summaryRow('Fundo Comum', detailedSummary?.paid?.fc || 0, 0)}
          {summaryRow('Taxa Adm', detailedSummary?.paid?.ta || 0, 0)}
          {summaryRow('Fundo Reserva', detailedSummary?.paid?.fr || 0, 0)}
          {summaryRow('Seguro', detailedSummary?.paid?.insurance || 0, 0, false)}
          {summaryRow('Amortização', detailedSummary?.paid?.amortization || 0, 0, false)}
          {summaryRow('Multa', detailedSummary?.paid?.fine || 0, 0, false)}
          {summaryRow('Juros', detailedSummary?.paid?.interest || 0, 0, false)}
          <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm">
            <span>TOTAL PAGO</span>
            <div className="flex gap-12">
              <span>{(detailedSummary?.paid?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              <span className="w-16 text-right">{fmtPct(detailedSummary?.paid?.total || 0)}</span>
            </div>
          </div>
        </div>

        {projectionConfig.enabled && (
          <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
              <Calculator size={12} /> Impacto da Projeção
            </h4>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Total s/ Projeção:</span>
                <span className="font-medium">{formatCurrency(originalTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total c/ Projeção:</span>
                <span className="font-medium">{formatCurrency(projectedTotal)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-amber-700 font-bold">
                <span>Custo da Inflação:</span>
                <span>{formatCurrency(inflationCost)}</span>
              </div>
            </div>
            <div className="pt-2 flex justify-between items-center text-[10px]">
              <span className="text-slate-500">Crédito Final Est.:</span>
              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{formatCurrency(finalProjectedCredit)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Resumo a Pagar + Gráfico */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo a Pagar (Saldo)</h3>
        <div className="space-y-1.5 text-xs font-medium text-slate-800">
          {summaryRow('Fundo Comum', detailedSummary?.toPay?.fc || 0, 0)}
          {summaryRow('Taxa Adm', detailedSummary?.toPay?.ta || 0, 0)}
          {summaryRow('Fundo Reserva', detailedSummary?.toPay?.fr || 0, 0)}
          {summaryRow('Seguro', detailedSummary?.toPay?.insurance || 0, 0, false)}
          {summaryRow('Amortização', detailedSummary?.toPay?.amortization || 0, 0, false)}
          {summaryRow('Multa', detailedSummary?.toPay?.fine || 0, 0, false)}
          {summaryRow('Juros', detailedSummary?.toPay?.interest || 0, 0, false)}
          <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm">
            <span>TOTAL A VENCER</span>
            <div className="flex gap-12">
              <span>{(detailedSummary?.toPay?.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              <span className="w-16 text-right">{fmtPct(detailedSummary?.toPay?.total || 0)}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-300 flex justify-between text-xs font-black">
          <span>Qtde Parcelas Restantes:</span>
          <span className="text-sm">{(detailedSummary?.counts?.total ?? 0).toFixed(2).replace('.', ',')}</span>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <TrendingUp size={12} /> Evolução das Parcelas
          </h4>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [formatCurrency(value), 'Parcela']}
                />
                <Area type="monotone" dataKey="valor" stroke="#3b82f6" fillOpacity={1} fill="url(#colorVal)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SummarySection;
