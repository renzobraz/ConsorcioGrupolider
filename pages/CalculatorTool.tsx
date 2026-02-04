
import React, { useState, useEffect } from 'react';
import { Calculator, TrendingUp, PieChart, DollarSign, ArrowRight, RefreshCw } from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/formatters';

const CalculatorTool = () => {
  // State for Inputs
  const [creditValue, setCreditValue] = useState(100000);
  const [adminFeeRate, setAdminFeeRate] = useState(16);
  const [reserveFundRate, setReserveFundRate] = useState(4);
  const [termMonths, setTermMonths] = useState(80);
  const [currentMonth, setCurrentMonth] = useState(14);
  const [correctionIndexRate, setCorrectionIndexRate] = useState(5.0); // 5%
  const [reductionPercent, setReductionPercent] = useState(25); // 25% reduction
  const [manualPaidAmount, setManualPaidAmount] = useState<number | ''>(''); // Optional override

  // State for Results
  const [results, setResults] = useState<any>(null);

  const calculate = () => {
    // 1. Atualização do Crédito (Valor Base)
    let currentCredit = creditValue;
    const isCorrectionApplied = currentMonth > 12;
    
    if (isCorrectionApplied) {
        currentCredit = creditValue * (1 + (correctionIndexRate / 100));
    }

    // 2. Definição da Dívida Total Percentual
    const totalDebtPercent = 100 + adminFeeRate + reserveFundRate;

    // 3. Cálculo dos Fatores Relativos (Coeficientes)
    const factorFC = 100 / totalDebtPercent;
    const factorTA = adminFeeRate / totalDebtPercent;
    const factorFR = reserveFundRate / totalDebtPercent;

    // 4. Cálculo da Parcela Cheia Teórica
    // Dívida Total Monetária
    const totalDebtMonetary = currentCredit * (totalDebtPercent / 100);
    const fullInstallment = totalDebtMonetary / termMonths;

    // 5. Definição do Valor Pago
    // Se o usuário digitou um valor manual (ex: Lance), usa ele. 
    // Se não, calcula a parcela reduzida baseada na % de redução informada.
    let amountPaid = 0;
    let calculationType = '';

    if (manualPaidAmount !== '' && Number(manualPaidAmount) > 0) {
        amountPaid = Number(manualPaidAmount);
        calculationType = 'Valor Manual (Lance/Outro)';
    } else {
        const reductionFactor = 1 - (reductionPercent / 100);
        amountPaid = fullInstallment * reductionFactor;
        calculationType = `Parcela Reduzida (${reductionPercent}%)`;
    }

    // 6. Decomposição (Aplicação dos Fatores)
    const splitFC = amountPaid * factorFC;
    const splitTA = amountPaid * factorTA;
    const splitFR = amountPaid * factorFR;

    setResults({
        isCorrectionApplied,
        currentCredit,
        totalDebtPercent,
        factors: {
            fc: factorFC,
            ta: factorTA,
            fr: factorFR
        },
        fullInstallment,
        amountPaid,
        calculationType,
        split: {
            fc: splitFC,
            ta: splitTA,
            fr: splitFR
        }
    });
  };

  // Auto-calculate on change
  useEffect(() => {
    calculate();
  }, [creditValue, adminFeeRate, reserveFundRate, termMonths, currentMonth, correctionIndexRate, reductionPercent, manualPaidAmount]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
           <Calculator className="text-emerald-600" /> Calculadora Avulsa (Decomposição)
        </h1>
        <p className="text-slate-500">
            Simule a decomposição matemática de uma parcela ou lance baseada nos pesos percentuais (Fundo Comum vs Taxas).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* INPUTS COLUMN */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
              <h2 className="text-lg font-bold text-slate-700 mb-4 border-b pb-2 flex items-center gap-2">
                  <RefreshCw size={18} /> Variáveis do Cenário
              </h2>
              
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valor da Carta (Original)</label>
                      <input type="number" value={creditValue} onChange={e => setCreditValue(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Taxa Adm Total (%)</label>
                        <input type="number" step="0.01" value={adminFeeRate} onChange={e => setAdminFeeRate(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fundo Reserva Total (%)</label>
                        <input type="number" step="0.01" value={reserveFundRate} onChange={e => setReserveFundRate(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prazo (Meses)</label>
                        <input type="number" value={termMonths} onChange={e => setTermMonths(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mês Atual</label>
                        <input type="number" value={currentMonth} onChange={e => setCurrentMonth(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Índice Correção Acumulado (%)</label>
                      <input type="number" step="0.0001" value={correctionIndexRate} onChange={e => setCorrectionIndexRate(Number(e.target.value))} className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-emerald-500 outline-none" />
                      <p className="text-[10px] text-slate-400 mt-1">Aplicado se Mês Atual {'>'} 12</p>
                  </div>

                  <div className="border-t border-slate-100 pt-4 mt-2">
                      <label className="block text-xs font-bold text-blue-600 uppercase mb-1">Simular Pagamento</label>
                      
                      <div className="mb-3">
                         <span className="text-xs text-slate-500">Opção A: Calcular Parcela Reduzida</span>
                         <div className="flex items-center gap-2 mt-1">
                             <span className="text-sm text-slate-600">Redução:</span>
                             <input type="number" value={reductionPercent} onChange={e => setReductionPercent(Number(e.target.value))} className="w-20 border border-slate-300 rounded p-1 text-right" />
                             <span className="text-sm text-slate-600">%</span>
                         </div>
                      </div>

                      <div>
                         <span className="text-xs text-slate-500">Opção B: Valor Fixo (Ex: Lance)</span>
                         <input 
                            type="number" 
                            step="0.01"
                            placeholder="Digite um valor para simular..." 
                            value={manualPaidAmount} 
                            onChange={e => setManualPaidAmount(e.target.value === '' ? '' : Number(e.target.value))} 
                            className="w-full border border-blue-300 bg-blue-50 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none text-blue-800 font-bold" 
                         />
                         <p className="text-[10px] text-blue-400 mt-1">Se preenchido, ignora a redução percentual acima.</p>
                      </div>
                  </div>
              </div>
          </div>

          {/* RESULTS COLUMN */}
          <div className="lg:col-span-2 space-y-6">
              {/* Top Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 uppercase font-bold flex items-center gap-1">
                         <TrendingUp size={14} /> Crédito Base Atual
                      </p>
                      <p className="text-xl font-bold text-emerald-600">
                          {results && formatCurrency(results.currentCredit)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                          {results?.isCorrectionApplied ? `Corrigido (${correctionIndexRate}%)` : 'Sem correção (Mês <= 12)'}
                      </p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-xs text-slate-500 uppercase font-bold flex items-center gap-1">
                         <PieChart size={14} /> Dívida Total (%)
                      </p>
                      <p className="text-xl font-bold text-slate-700">
                          {results && results.totalDebtPercent.toFixed(4)}%
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                          100% FC + {adminFeeRate}% TA + {reserveFundRate}% FR
                      </p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm bg-blue-50 border-blue-100">
                      <p className="text-xs text-blue-600 uppercase font-bold flex items-center gap-1">
                         <DollarSign size={14} /> Valor Simulado
                      </p>
                      <p className="text-xl font-bold text-blue-700">
                          {results && formatCurrency(results.amountPaid)}
                      </p>
                      <p className="text-xs text-blue-400 mt-1">
                          {results?.calculationType}
                      </p>
                  </div>
              </div>

              {/* Factors Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-700">Fatores de Decomposição (Pesos)</h3>
                      <span className="text-xs text-slate-500">Fator = Taxa Componente / Dívida Total %</span>
                  </div>
                  <div className="p-6 grid grid-cols-3 gap-8 text-center">
                      <div>
                          <div className="text-sm font-semibold text-slate-500 mb-1">Fator Fundo Comum</div>
                          <div className="text-2xl font-bold text-slate-800">{results && results.factors.fc.toFixed(6)}</div>
                          <div className="text-xs text-slate-400 mt-1">({results && (results.factors.fc * 100).toFixed(4)}%)</div>
                      </div>
                      <div>
                          <div className="text-sm font-semibold text-slate-500 mb-1">Fator Taxa Adm</div>
                          <div className="text-2xl font-bold text-slate-800">{results && results.factors.ta.toFixed(6)}</div>
                          <div className="text-xs text-slate-400 mt-1">({results && (results.factors.ta * 100).toFixed(4)}%)</div>
                      </div>
                      <div>
                          <div className="text-sm font-semibold text-slate-500 mb-1">Fator Fundo Reserva</div>
                          <div className="text-2xl font-bold text-slate-800">{results && results.factors.fr.toFixed(6)}</div>
                          <div className="text-xs text-slate-400 mt-1">({results && (results.factors.fr * 100).toFixed(4)}%)</div>
                      </div>
                  </div>
              </div>

              {/* Final Breakdown */}
              <div className="bg-emerald-50 rounded-xl border border-emerald-100 shadow-sm overflow-hidden">
                  <div className="bg-emerald-100 p-4 border-b border-emerald-200 flex items-center justify-between">
                      <h3 className="font-bold text-emerald-800">Resultado da Decomposição</h3>
                      <span className="text-xs text-emerald-600">Aplicação dos fatores sobre o valor pago</span>
                  </div>
                  
                  {results && (
                  <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-emerald-700 bg-emerald-50/50">
                          <tr>
                              <th className="px-6 py-3 text-left">Componente</th>
                              <th className="px-6 py-3 text-left">Fórmula</th>
                              <th className="px-6 py-3 text-right">Valor Destinado</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100">
                          <tr>
                              <td className="px-6 py-4 font-bold text-slate-700">Fundo Comum (FC)</td>
                              <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                  {formatCurrency(results.amountPaid)} × {results.factors.fc.toFixed(6)}
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-emerald-700 text-lg">
                                  {formatCurrency(results.split.fc)}
                              </td>
                          </tr>
                          <tr>
                              <td className="px-6 py-4 font-bold text-slate-700">Taxa Adm (TA)</td>
                              <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                  {formatCurrency(results.amountPaid)} × {results.factors.ta.toFixed(6)}
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-emerald-700 text-lg">
                                  {formatCurrency(results.split.ta)}
                              </td>
                          </tr>
                          <tr>
                              <td className="px-6 py-4 font-bold text-slate-700">Fundo Reserva (FR)</td>
                              <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                                  {formatCurrency(results.amountPaid)} × {results.factors.fr.toFixed(6)}
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-emerald-700 text-lg">
                                  {formatCurrency(results.split.fr)}
                              </td>
                          </tr>
                          <tr className="bg-emerald-200/50">
                              <td className="px-6 py-4 font-bold text-emerald-900">TOTAL CONFERÊNCIA</td>
                              <td className="px-6 py-4"></td>
                              <td className="px-6 py-4 text-right font-black text-emerald-900 text-xl">
                                  {formatCurrency(results.split.fc + results.split.ta + results.split.fr)}
                              </td>
                          </tr>
                      </tbody>
                  </table>
                  )}
              </div>

              <div className="flex items-start gap-3 p-4 bg-slate-100 rounded-lg text-xs text-slate-500">
                  <ArrowRight className="shrink-0 mt-0.5" size={16} />
                  <p>
                      <strong>Prova Real:</strong> Este cálculo valida que, independentemente do valor pago pelo consorciado, o sistema aloca os recursos mantendo a proporcionalidade exata do contrato, garantindo o equilíbrio atuarial do grupo (Decomposição Proporcional Linear).
                  </p>
              </div>
          </div>
      </div>
    </div>
  );
};

export default CalculatorTool;
