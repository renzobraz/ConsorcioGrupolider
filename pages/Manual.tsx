
import React from 'react';
import { BookOpen, AlertCircle, CheckCircle2, Calculator, TrendingUp, PieChart, Info, Percent } from 'lucide-react';

const Manual = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
           < BookOpen className="text-emerald-600" /> Manual de Regras de Cálculo
        </h1>
        <p className="text-slate-500">Documentação técnica sobre as fórmulas e lógicas financeiras do ConsorcioManager Pro.</p>
      </div>

      {/* Seção 0: Composição da Parcela */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
         <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <PieChart size={20} className="text-emerald-600"/> 1. Estrutura da Parcela Mensal
         </h2>
         <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
               Toda parcela mensal no sistema é composta por três elementos fundamentais rateados individualmente:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Fundo Comum (FC)</span>
                    <p className="text-xs text-slate-500 mt-1">Destinado à formação da poupança para aquisição dos bens.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Taxa Adm (TA)</span>
                    <p className="text-xs text-slate-500 mt-1">Remuneração da administradora pela gestão do grupo.</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="font-bold text-slate-900">Fundo Reserva (FR)</span>
                    <p className="text-xs text-slate-500 mt-1">Garantia para cobrir eventuais inadimplências ou insuficiência de caixa.</p>
                </div>
            </div>
         </div>
      </section>

      {/* Seção 1: Cálculo de Percentuais */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
         <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Percent size={20} className="text-blue-600"/> 2. Como os Percentuais (%) são calculados?
         </h2>
         <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
               Diferente de financiamentos, no consórcio a base de cálculo é sempre o <strong>Valor do Crédito Atualizado</strong>.
            </p>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <h4 className="font-bold text-blue-800 mb-2">Fórmula do Percentual Mensal:</h4>
                <p className="font-mono text-xs">
                    % Mensal = (Valor Monetário do Componente / Crédito Atual da Cota) × 100
                </p>
            </div>
            <p className="text-xs text-slate-500 italic">
                * Nota: Se a cota sofre correção anual de 5%, o valor monetário da parcela sobe, mas o percentual exibido permanece o mesmo, pois o divisor (Crédito) também subiu na mesma proporção.
            </p>
         </div>
      </section>

      {/* Seção 2: Planos de Pagamento */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
         <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Calculator size={20} className="text-emerald-600"/> 3. Regras dos Planos de Pagamento
         </h2>
         <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
               <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <strong className="text-slate-900 uppercase text-xs tracking-wider">Plano Normal</strong>
               </div>
               <p className="text-sm text-slate-600">
                  O saldo devedor percentual (inicialmente 100% de FC + Taxas Totais) é dividido linearmente pelo prazo contratado. 
                  A cada mês, amortiza-se <code>(Saldo Percentual / Meses Restantes)</code>.
               </p>
            </div>
            
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
               <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-blue-600" />
                    <strong className="text-blue-900 uppercase text-xs tracking-wider">Parcela Reduzida</strong>
               </div>
               <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
                  <li><strong>Até a Contemplação:</strong> Paga-se apenas 50% do valor do Fundo Comum (FC). TA e FR são cobrados integralmente (100%).</li>
                  <li><strong>Diferimento:</strong> Os 50% não pagos do FC são acumulados no saldo devedor.</li>
                  <li><strong>Pós-Contemplação:</strong> O sistema realiza o <strong>reparcelamento automático</strong>. O saldo devedor acumulado é diluído nas parcelas restantes, que passam a cobrar 100% de todos os componentes.</li>
               </ul>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
               <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 size={16} className="text-amber-600" />
                    <strong className="text-amber-900 uppercase text-xs tracking-wider">Parcela Semestral (Regra Atualizada)</strong>
               </div>
               <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
                  <li><strong>Meses 1 a 5 do Semestre:</strong> Paga-se 50% de <strong>todos</strong> os componentes (FC, TA e FR).</li>
                  <li><strong>Mês 6 (Parcela Balão):</strong> Cobra-se a parcela integral (100%) mais a soma de todos os 50% que foram diferidos nos 5 meses anteriores.</li>
                  <li><strong>Objetivo:</strong> Reduzir o desembolso mensal de fluxo de caixa, concentrando a liquidação da diferença a cada semestre.</li>
               </ul>
            </div>
         </div>
      </section>

      {/* Seção 3: Correção Anual */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
         <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-blue-600"/> 4. Correção Anual (Aniversário da Cota)
         </h2>
         <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
               A correção ocorre a cada 12 meses (mês 13, 25, 37...) baseando-se na <strong>Data de Adesão</strong>.
            </p>
            <ul className="list-disc pl-5 space-y-2">
               <li>
                  <strong>Índices Acumulados:</strong> O sistema utiliza a multiplicação dos índices mensais dos últimos 12 meses (Juros Compostos).
               </li>
               <li>
                  <strong>Valor da Carta:</strong> É corrigido apenas até a data de contemplação. Uma vez contemplada, o valor do crédito disponível congela (para fins de histórico de compra), mas continua rendendo em aplicações financeiras se não for utilizado.
               </li>
               <li>
                  <strong>Saldo Devedor:</strong> Continua sendo corrigido anualmente pelo índice do contrato até a quitação total da cota.
               </li>
            </ul>
         </div>
      </section>

      {/* Seção 4: Abatimento de Lances */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
         <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle2 size={20} className="text-purple-600"/> 5. Lances e Amortização
         </h2>
         <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
            <p>
               O abatimento do lance segue uma hierarquia matemática para manter o equilíbrio do grupo:
            </p>
            <div className="space-y-3">
               <div className="flex items-start gap-2">
                  <div className="min-w-[24px] h-6 flex items-center justify-center bg-slate-100 rounded text-[10px] font-bold">A</div>
                  <div>
                     <strong>Rateio Proporcional:</strong> O valor do lance é decomposto em FC, TA e FR usando pesos baseados na dívida total inicial. 
                     Ex: Se a dívida total era 120% (100 FC + 18 TA + 2 FR), o lance abaterá 83.3% em FC, 15% em TA e 1.7% em FR.
                  </div>
               </div>

               <div className="flex items-start gap-2">
                  <div className="min-w-[24px] h-6 flex items-center justify-center bg-slate-100 rounded text-[10px] font-bold">B</div>
                  <div>
                     <strong>Reparcelamento Pós-Lance:</strong> Após o abatimento do lance, o sistema recalcula o valor das parcelas futuras dividindo o novo saldo percentual remanescente pelo número de meses que ainda faltam.
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* Seção 5: Arredondamentos */}
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex items-start gap-3 text-sm text-yellow-800">
         <AlertCircle className="shrink-0 mt-0.5" size={18} />
         <div>
            <strong>Padrões de Precisão:</strong>
            <ul className="list-disc pl-5 mt-1 space-y-1 text-xs">
                <li><strong>Valores Monetários (R$):</strong> Arredondados para 2 casas decimais.</li>
                <li><strong>Percentuais (%) Mensais:</strong> Calculados com 4 casas decimais para evitar perdas acumuladas de rateio.</li>
                <li><strong>Índices de Correção:</strong> Aplicados com a precisão total cadastrada no banco de dados.</li>
            </ul>
         </div>
      </div>

    </div>
  );
};

export default Manual;
