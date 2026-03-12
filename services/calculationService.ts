
import { Quota, PaymentInstallment, PaymentPlanType, MonthlyIndex, CorrectionIndex, BidBaseType, CalculationMethod } from '../types';
import { addMonths, getNextBusinessDay } from '../utils/formatters';

const createLocalDate = (dateStr: string): Date => {
  if(!dateStr) return new Date();
  const cleanDate = dateStr.split('T')[0];
  const [year, month, day] = cleanDate.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const calculateCDICorrection = (value: number, startDateStr: string | undefined, indices: MonthlyIndex[], cutoffDateStr?: string): number => {
    if (!value || value <= 0 || !startDateStr) return 0;
    const startDate = createLocalDate(startDateStr);
    startDate.setDate(1); 
    startDate.setHours(0,0,0,0);
    const cutoff = cutoffDateStr ? createLocalDate(cutoffDateStr) : new Date();
    cutoff.setHours(23,59,59,999);
    const relevantIndices = indices.filter(idx => {
        if (idx.type !== CorrectionIndex.CDI) return false;
        const idxDate = createLocalDate(idx.date);
        idxDate.setDate(1);
        idxDate.setHours(0,0,0,0);
        return idxDate >= startDate && idxDate <= cutoff;
    });
    let accumulatedMultiplier = 1;
    relevantIndices.forEach(idx => {
        const effectiveRate = idx.rate * 0.92;
        accumulatedMultiplier *= (1 + (effectiveRate / 100));
    });
    return (value * accumulatedMultiplier) - value;
};

export const calculateCurrentCreditValue = (quota: Quota, indices: MonthlyIndex[] = [], customCutoff?: Date): number => {
  if (!quota) return 0;
  let currentCreditValue = Number(quota.creditValue) || 0;
  
  // REGRA DE CORREÇÃO: Prioridade para Data da 1ª Assembleia -> Data Adesão -> 1º Vencimento
  const dateStr = quota.firstAssemblyDate || quota.adhesionDate || quota.firstDueDate;
  if (!dateStr) return currentCreditValue;
  
  const startDate = createLocalDate(dateStr);
  startDate.setHours(0,0,0,0);
  
  const firstDueDate = createLocalDate(quota.firstDueDate || dateStr);
  firstDueDate.setHours(0,0,0,0);
  
  let cutoffDate = customCutoff || new Date();
  cutoffDate.setHours(23,59,59,999);

  if (quota.isContemplated && quota.contemplationDate) {
      const contDate = createLocalDate(quota.contemplationDate);
      contDate.setHours(23,59,59,999);
      if (contDate < cutoffDate) {
          cutoffDate = contDate;
      }
  }
  
  let anniversaryCount = 1;
  let safetyCounter = 0;
  
  while (safetyCounter < 100) {
      const anniversaryInstallmentDate = addMonths(startDate, anniversaryCount * 12);
      
      if (anniversaryInstallmentDate > cutoffDate) break;

      // REGRA DE CORREÇÃO:
      // Só aplica se a data de aniversário for ESTRITAMENTE DEPOIS do primeiro vencimento.
      // Se for antes ou no mesmo mês, o valor da carta inserido já contempla essa correção.
      if (anniversaryInstallmentDate > firstDueDate) {
          // REGRA DE DEFASAGEM DE ÍNDICE:
          // Como o vencimento é no início do mês, o índice do mês anterior (M-1) ainda não foi divulgado.
          // Usamos então o índice de 2 meses antes (M-2).
          // Ex: Aniversário em Janeiro. Índice de Dezembro sai dia 12/Jan. Boleto vence dia 05/Jan.
          // Logo, usa-se o índice de Novembro.
          const indexDate = addMonths(startDate, (anniversaryCount * 12) - 2);
          const indexLookupStr = indexDate.toISOString().split('T')[0].substring(0, 8) + '01';
          
          const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
          
          if (monthlyIndex && monthlyIndex.rate > 0) {
              let appliedRate = monthlyIndex.rate;
              if (quota.correctionRateCap && quota.correctionRateCap > 0) {
                  appliedRate = Math.min(appliedRate, quota.correctionRateCap);
              }
              currentCreditValue = currentCreditValue * (1 + (appliedRate / 100));
          }
      }
      
      anniversaryCount++;
      safetyCounter++;
  }
  return currentCreditValue;
};

export const generateSchedule = (quota: Quota, indices: MonthlyIndex[] = [], payments: Record<number, any> = {}): PaymentInstallment[] => {
  const schedule: PaymentInstallment[] = [];
  if (!quota || !quota.firstDueDate) return [];
  
  const firstDueDate = createLocalDate(quota.firstDueDate);
  
  // REGRA DE CORREÇÃO: Prioridade para Data da 1ª Assembleia -> Data Adesão -> 1º Vencimento
  // Esta data define quando ocorre o "Aniversário" da cota para aplicar o índice
  const correctionAnchorDate = createLocalDate(quota.firstAssemblyDate || quota.adhesionDate || quota.firstDueDate);
  correctionAnchorDate.setDate(1); 
  correctionAnchorDate.setHours(0,0,0,0);
  
  const termMonths = Number(quota.termMonths) || 1;
  const originalCredit = Number(quota.creditValue) || 1;
  const adminFeeRateTotal = Number(quota.adminFeeRate) || 0;
  const reserveFundRateTotal = Number(quota.reserveFundRate) || 0;
  const dueDay = quota.dueDay || 25;
  
  let currentCreditValue = originalCredit;
  let balanceFC_Reais = originalCredit;
  let balanceTA_Reais = originalCredit * (adminFeeRateTotal / 100);
  let balanceFR_Reais = originalCredit * (reserveFundRateTotal / 100);

  // Third-party acquisition logic
  let startInstallment = 1;
  if (quota.acquiredFromThirdParty && quota.assumedInstallment && quota.assumedInstallment > 1) {
      startInstallment = quota.assumedInstallment;
      // If prePaidFCPercent is provided, we deduct it from the remaining FC
      if (quota.prePaidFCPercent !== undefined) {
          balanceFC_Reais -= (quota.prePaidFCPercent / 100) * currentCreditValue;
      }
  } else if (quota.calculationMethod === CalculationMethod.INDEX_TABLE && quota.indexTable && quota.indexTable.length > 0) {
      // For new quotas using index table, start from the first defined installment
      const minInst = Math.min(...quota.indexTable.map(e => e.startInstallment));
      if (minInst > 1) {
          startInstallment = minInst;
      }
  }

  let bidProcessed = false;
  const today = new Date(); today.setHours(23, 59, 59, 999);

  let deferredFC_Reais = 0;
  let deferredTA_Reais = 0;
  let deferredFR_Reais = 0;

  let lastCorrectionYear = correctionAnchorDate.getFullYear();

  for (let i = startInstallment; i <= termMonths; i++) {
    let currentDate: Date;
    if (i === 1) {
      currentDate = new Date(firstDueDate);
    } else {
      const tempDate = addMonths(firstDueDate, i - 1);
      currentDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), dueDay);
    }
    
    const finalDueDate = getNextBusinessDay(currentDate);
    const dueDateStr = finalDueDate.toISOString();
    const monthsLeft = termMonths - i + 1;

    // A correção anual acontece ANTES de processar o lance do mês para que o lance use a base atualizada
    let correctionApplied = false;
    let correctionFactor = 0;
    let correctionIndexName: string | undefined = undefined;
    let correctionCapApplied = false;
    let correctionRealRate = 0;
    
    // NOVA REGRA:
    // Ocorre quando o mês da parcela atual for igual ao mês da data âncora (1ª assembleia)
    // E o ano da parcela for maior que o ano da última correção (ou da data âncora)
    if (i > 1 && finalDueDate.getMonth() === correctionAnchorDate.getMonth() && finalDueDate.getFullYear() > lastCorrectionYear) {
        // REGRA DE DEFASAGEM: Busca índice de 2 meses antes da data de aniversário
        // Ex: Aniversário em Novembro -> Busca índice de Setembro
        const indexMonthDate = new Date(finalDueDate.getFullYear(), finalDueDate.getMonth() - 2, 1);
        const indexLookupStr = indexMonthDate.toISOString().split('T')[0];

        if (indexMonthDate <= today) {
            const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
            
            if (monthlyIndex && monthlyIndex.rate > 0) {
                correctionApplied = true;
                let appliedRate = monthlyIndex.rate;
                correctionRealRate = monthlyIndex.rate;
                if (quota.correctionRateCap && quota.correctionRateCap > 0 && appliedRate > quota.correctionRateCap) {
                    appliedRate = quota.correctionRateCap;
                    correctionCapApplied = true;
                }
                correctionFactor = appliedRate / 100;
                correctionIndexName = quota.correctionIndex;
                
                currentCreditValue *= (1 + correctionFactor);
                balanceFC_Reais *= (1 + correctionFactor);
                balanceTA_Reais *= (1 + correctionFactor);
                balanceFR_Reais *= (1 + correctionFactor);
                deferredFC_Reais *= (1 + correctionFactor);
                deferredTA_Reais *= (1 + correctionFactor);
                deferredFR_Reais *= (1 + correctionFactor);
            }
        }
        
        lastCorrectionYear = finalDueDate.getFullYear();
    }

    // Base de Cálculo Monetária ATUALIZADA para o Percentual do Lance
    const currentBidCalcBase = quota.bidBase === BidBaseType.TOTAL_PROJECT 
        ? currentCreditValue * (1 + (adminFeeRateTotal + reserveFundRateTotal) / 100)
        : currentCreditValue;

    let bidAmountApplied = 0; 
    let bidDateApplied: string | undefined = undefined;
    let bidEmbeddedApplied = 0, bidEmbeddedPercent = 0, bidEmbeddedAbatementFC = 0, bidEmbeddedPercentFC = 0, bidEmbeddedAbatementFR = 0, bidEmbeddedPercentFR = 0, bidEmbeddedAbatementTA = 0, bidEmbeddedPercentTA = 0;
    let bidFreeApplied = 0, bidFreePercent = 0, bidFreeAbatementFC = 0, bidFreePercentFC = 0, bidFreeAbatementFR = 0, bidFreePercentFR = 0, bidFreeAbatementTA = 0, bidFreePercentTA = 0;

    if (quota.isContemplated && quota.contemplationDate && !bidProcessed) {
        const bidDate = createLocalDate(quota.contemplationDate);
        if (bidDate <= finalDueDate) {
             bidProcessed = true;
             bidDateApplied = quota.contemplationDate;
             bidAmountApplied = quota.bidTotal || 0;

             const distributeBid = (amount: number) => {
                 const totalRemainingReais = Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais);
                 const weightFC = totalRemainingReais > 0 ? Math.max(0, balanceFC_Reais) / totalRemainingReais : 0;
                 const weightTA = totalRemainingReais > 0 ? Math.max(0, balanceTA_Reais) / totalRemainingReais : 0;
                 const weightFR = totalRemainingReais > 0 ? Math.max(0, balanceFR_Reais) / totalRemainingReais : 0;

                 const mFC = parseFloat((amount * weightFC).toFixed(2));
                 const mTA = parseFloat((amount * weightTA).toFixed(2));
                 const mFR = parseFloat((amount - mFC - mTA).toFixed(2));

                 // REGRAS SOLICITADAS: O % do valor pago deve ser (Valor / Crédito Base Atualizado) * 100
                 // pTotal: Percentual do lance sobre a base atualizada (Crédito ou Total Projeto)
                 const pTotalAbatido = (amount / currentBidCalcBase) * 100;
                 
                 // pFC/pTA/pFR: Representam o impacto desse abatimento no Saldo Devedor em relação ao Crédito Base (100%)
                 const pFC = (mFC / currentCreditValue) * 100;
                 const pTA = (mTA / currentCreditValue) * 100;
                 const pFR = (mFR / currentCreditValue) * 100;

                 balanceFC_Reais -= mFC;
                 balanceTA_Reais -= mTA;
                 balanceFR_Reais -= mFR;

                 return { mFC, mTA, mFR, pFC, pTA, pFR, pTotal: pTotalAbatido };
             };

             if (quota.bidEmbedded && quota.bidEmbedded > 0) {
                 bidEmbeddedApplied = quota.bidEmbedded;
                 const res = distributeBid(bidEmbeddedApplied);
                 bidEmbeddedAbatementFC = res.mFC; bidEmbeddedAbatementTA = res.mTA; bidEmbeddedAbatementFR = res.mFR;
                 bidEmbeddedPercent = res.pTotal; bidEmbeddedPercentFC = res.pFC; bidEmbeddedPercentTA = res.pTA; bidEmbeddedPercentFR = res.pFR;
             }
             if (quota.bidFree && quota.bidFree > 0) {
                 bidFreeApplied = quota.bidFree;
                 const res = distributeBid(bidFreeApplied);
                 bidFreeAbatementFC = res.mFC; bidFreeAbatementTA = res.mTA; bidFreeAbatementFR = res.mFR;
                 bidFreePercent = res.pTotal; bidFreePercentFC = res.pFC; bidFreePercentTA = res.pTA; bidFreePercentFR = res.pFR;
             }
        }
    }

    let useIndexTable = quota.calculationMethod === CalculationMethod.INDEX_TABLE && quota.indexTable && quota.indexTable.length > 0;

    if (useIndexTable && quota.recalculateBalanceAfterHalfOrContemplation) {
        const halfTerm = Math.ceil(termMonths / 2);
        const isNotContemplatedYet = !quota.isContemplated || (quota.contemplationDate && createLocalDate(quota.contemplationDate) > finalDueDate);
        const isReducedPeriod = i <= halfTerm && isNotContemplatedYet;

        if (!isReducedPeriod) {
            useIndexTable = false; // Switch to linear recalculation for the remaining balance
        }
    }

    let installmentFC = 0, installmentTA = 0, installmentFR = 0;

    if (useIndexTable) {
        const entry = quota.indexTable!.find(e => i >= e.startInstallment && i <= e.endInstallment);
        if (entry) {
            installmentFC = parseFloat(((entry.rateFC / 100) * currentCreditValue).toFixed(2));
            installmentTA = parseFloat(((entry.rateTA / 100) * currentCreditValue).toFixed(2));
            installmentFR = parseFloat(((entry.rateFR / 100) * currentCreditValue).toFixed(2));
        }
    } else if (i === termMonths) {
        installmentFC = parseFloat(Math.max(0, balanceFC_Reais).toFixed(2));
        installmentTA = parseFloat(Math.max(0, balanceTA_Reais).toFixed(2));
        installmentFR = parseFloat(Math.max(0, balanceFR_Reais).toFixed(2));
    } else if (quota.paymentPlan === PaymentPlanType.SEMESTRAL) {
        const targetFC = Math.max(0, balanceFC_Reais) / monthsLeft;
        const targetTA = Math.max(0, balanceTA_Reais) / monthsLeft;
        const targetFR = Math.max(0, balanceFR_Reais) / monthsLeft;

        if (i % 6 === 0) {
            installmentFC = parseFloat((targetFC + deferredFC_Reais).toFixed(2));
            installmentTA = parseFloat((targetTA + deferredTA_Reais).toFixed(2));
            installmentFR = parseFloat((targetFR + deferredFR_Reais).toFixed(2));
            deferredFC_Reais = 0; deferredTA_Reais = 0; deferredFR_Reais = 0;
        } else {
            installmentFC = parseFloat((targetFC * 0.5).toFixed(2));
            installmentTA = parseFloat((targetTA * 0.5).toFixed(2));
            installmentFR = parseFloat((targetFR * 0.5).toFixed(2));
            deferredFC_Reais += (targetFC - installmentFC);
            deferredTA_Reais += (targetTA - installmentTA);
            deferredFR_Reais += (targetFR - installmentFR);
        }
    } else if (quota.paymentPlan === PaymentPlanType.REDUZIDA) {
        const halfTerm = Math.ceil(termMonths / 2);
        const isNotContemplatedYet = !quota.isContemplated || (quota.contemplationDate && createLocalDate(quota.contemplationDate) > finalDueDate);
        const isReducedPeriod = i <= halfTerm && isNotContemplatedYet;

        if (isReducedPeriod) {
            const theoreticalRateFC = parseFloat(((100 / termMonths) * 0.5).toFixed(4));
            installmentFC = parseFloat(((theoreticalRateFC / 100) * currentCreditValue).toFixed(2));
        } else {
            installmentFC = parseFloat((Math.max(0, balanceFC_Reais) / monthsLeft).toFixed(2));
        }
        installmentTA = parseFloat((Math.max(0, balanceTA_Reais) / monthsLeft).toFixed(2));
        installmentFR = parseFloat((Math.max(0, balanceFR_Reais) / monthsLeft).toFixed(2));
    } else {
        installmentFC = parseFloat((Math.max(0, balanceFC_Reais) / monthsLeft).toFixed(2));
        installmentTA = parseFloat((Math.max(0, balanceTA_Reais) / monthsLeft).toFixed(2));
        installmentFR = parseFloat((Math.max(0, balanceFR_Reais) / monthsLeft).toFixed(2));
    }

    let insurance = 0;
    let amortization = 0;
    let fine = 0;
    let interest = 0;
    let realAmountPaid = null;
    let paymentDate = null;
    let status = 'PREVISTO';

    // Apply manual overrides from payments
    const payment = payments[i];
    if (payment) {
        if (payment.manualFC !== undefined && payment.manualFC !== null) installmentFC = payment.manualFC;
        if (payment.manualTA !== undefined && payment.manualTA !== null) installmentTA = payment.manualTA;
        if (payment.manualFR !== undefined && payment.manualFR !== null) installmentFR = payment.manualFR;
        if (payment.manualInsurance !== undefined && payment.manualInsurance !== null) insurance = payment.manualInsurance;
        if (payment.manualAmortization !== undefined && payment.manualAmortization !== null) amortization = payment.manualAmortization;
        if (payment.manualFine !== undefined && payment.manualFine !== null) fine = payment.manualFine;
        if (payment.manualInterest !== undefined && payment.manualInterest !== null) interest = payment.manualInterest;
        
        realAmountPaid = payment.amount ?? null;
        paymentDate = payment.paymentDate || null;
        status = payment.status || 'PREVISTO';
    }

    // Calculate actual rates used (for display purposes)
    let actualRateFC = (installmentFC / currentCreditValue) * 100;
    let actualRateTA = (installmentTA / currentCreditValue) * 100;
    let actualRateFR = (installmentFR / currentCreditValue) * 100;

    // Deduct from remaining balance in Reais
    balanceFC_Reais -= installmentFC;
    balanceTA_Reais -= installmentTA;
    balanceFR_Reais -= installmentFR;

    const totalInstallment = installmentFC + installmentTA + installmentFR + insurance + amortization + fine + interest;

    schedule.push({
      installmentNumber: i, 
      dueDate: dueDateStr, 
      commonFund: installmentFC, 
      monthlyRateFC: actualRateFC, 
      reserveFund: installmentFR, 
      monthlyRateFR: actualRateFR, 
      adminFee: installmentTA, 
      monthlyRateTA: actualRateTA, 
      insurance, 
      amortization, 
      totalInstallment,
      balanceFC: Math.max(0, balanceFC_Reais), 
      balanceFR: Math.max(0, balanceFR_Reais), 
      balanceTA: Math.max(0, balanceTA_Reais), 
      balanceTotal: Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais),
      percentBalanceFC: Math.max(0, (balanceFC_Reais / currentCreditValue) * 100), 
      percentBalanceFR: Math.max(0, (balanceFR_Reais / currentCreditValue) * 100), 
      percentBalanceTA: Math.max(0, (balanceTA_Reais / currentCreditValue) * 100), 
      percentBalanceTotal: Math.max(0, ((balanceFC_Reais + balanceTA_Reais + balanceFR_Reais) / currentCreditValue) * 100),
      bidAmountApplied, bidDate: bidDateApplied,
      bidEmbeddedApplied, bidEmbeddedPercent, bidEmbeddedAbatementFC, bidEmbeddedPercentFC, bidEmbeddedAbatementFR, bidEmbeddedPercentFR, bidEmbeddedAbatementTA, bidEmbeddedPercentTA,
      bidFreeApplied, bidFreePercent, bidFreeAbatementFC, bidFreePercentFC, bidFreeAbatementFR, bidFreePercentFR, bidFreeAbatementTA, bidFreePercentTA,
      bidAbatementFC: bidEmbeddedAbatementFC + bidFreeAbatementFC, bidAbatementFR: bidEmbeddedAbatementFR + bidFreeAbatementFR, bidAbatementTA: bidEmbeddedAbatementTA + bidFreeAbatementTA,
      correctionApplied, correctionFactor, correctedCreditValue: currentCreditValue, correctionIndexName, correctionCapApplied, correctionRealRate,
      realAmountPaid, 
      isPaid: status === 'PAGO',
      status,
      paymentDate,
      manualFC: payment?.manualFC,
      manualFR: payment?.manualFR,
      manualTA: payment?.manualTA,
      manualFine: payment?.manualFine,
      manualInterest: payment?.manualInterest,
      manualInsurance: payment?.manualInsurance,
      manualAmortization: payment?.manualAmortization,
    });
  }
  return schedule;
};
