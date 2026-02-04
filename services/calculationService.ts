
import { Quota, PaymentInstallment, PaymentPlanType, MonthlyIndex, CorrectionIndex, BidBaseType } from '../types';
import { addMonths, getNextBusinessDay } from '../utils/formatters';

const createLocalDate = (dateStr: string): Date => {
  if(!dateStr) return new Date();
  const cleanDate = dateStr.split('T')[0];
  const [year, month, day] = cleanDate.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const calculateCDICorrection = (value: number, startDateStr: string | undefined, indices: MonthlyIndex[]): number => {
    if (!value || value <= 0 || !startDateStr) return 0;
    const startDate = createLocalDate(startDateStr);
    startDate.setDate(1); 
    startDate.setHours(0,0,0,0);
    const today = new Date();
    today.setHours(23,59,59,999);
    const relevantIndices = indices.filter(idx => {
        if (idx.type !== CorrectionIndex.CDI) return false;
        const idxDate = createLocalDate(idx.date);
        idxDate.setDate(1);
        idxDate.setHours(0,0,0,0);
        return idxDate >= startDate && idxDate <= today;
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
  const dateStr = quota.adhesionDate || quota.firstDueDate;
  if (!dateStr) return currentCreditValue;
  
  const startDate = createLocalDate(dateStr);
  startDate.setHours(0,0,0,0);
  
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

      const indexDate = addMonths(startDate, (anniversaryCount * 12) - 1);
      const indexLookupStr = indexDate.toISOString().split('T')[0].substring(0, 8) + '01';
      
      const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
      
      if (monthlyIndex && monthlyIndex.rate > 0) {
          currentCreditValue = currentCreditValue * (1 + (monthlyIndex.rate / 100));
      }
      
      anniversaryCount++;
      safetyCounter++;
  }
  return currentCreditValue;
};

export const generateSchedule = (quota: Quota, indices: MonthlyIndex[] = []): PaymentInstallment[] => {
  const schedule: PaymentInstallment[] = [];
  if (!quota || !quota.firstDueDate) return [];
  
  const firstDueDate = createLocalDate(quota.firstDueDate);
  const adhesionDateAnchor = createLocalDate(quota.adhesionDate || quota.firstDueDate);
  adhesionDateAnchor.setDate(1); 
  adhesionDateAnchor.setHours(0,0,0,0);
  
  const termMonths = Number(quota.termMonths) || 1;
  const originalCredit = Number(quota.creditValue) || 1;
  const adminFeeRateTotal = Number(quota.adminFeeRate) || 0;
  const reserveFundRateTotal = Number(quota.reserveFundRate) || 0;
  const dueDay = quota.dueDay || 25;
  
  let currentCreditValue = originalCredit;
  let remainingPctFC = 100.0;
  let remainingPctTA = adminFeeRateTotal;
  let remainingPctFR = reserveFundRateTotal;

  let bidProcessed = false;
  const today = new Date(); today.setHours(23, 59, 59, 999);

  let deferredFCPct = 0;
  let deferredTAPct = 0;
  let deferredFRPct = 0;

  for (let i = 1; i <= termMonths; i++) {
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
    
    if (i > 1 && (i - 1) % 12 === 0) {
        const indexMonthDate = addMonths(adhesionDateAnchor, i - 2);
        const indexLookupStr = indexMonthDate.toISOString().split('T')[0];

        if (indexMonthDate <= today) {
            const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
            
            if (monthlyIndex && monthlyIndex.rate > 0) {
                correctionApplied = true;
                correctionFactor = monthlyIndex.rate / 100;
                correctionIndexName = quota.correctionIndex;
                currentCreditValue *= (1 + correctionFactor);
            }
        }
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
                 const totalRemainingPct = remainingPctFC + remainingPctTA + remainingPctFR;
                 const weightFC = remainingPctFC / totalRemainingPct;
                 const weightTA = remainingPctTA / totalRemainingPct;
                 const weightFR = remainingPctFR / totalRemainingPct;

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

                 remainingPctFC -= pFC;
                 remainingPctTA -= pTA;
                 remainingPctFR -= pFR;

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

    let monthlyRateFC = 0, monthlyRateTA = 0, monthlyRateFR = 0;

    if (i === termMonths) {
        monthlyRateFC = remainingPctFC;
        monthlyRateTA = remainingPctTA;
        monthlyRateFR = remainingPctFR;
    } else if (quota.paymentPlan === PaymentPlanType.SEMESTRAL) {
        const targetFC = remainingPctFC / monthsLeft;
        const targetTA = remainingPctTA / monthsLeft;
        const targetFR = remainingPctFR / monthsLeft;

        if (i % 6 === 0) {
            monthlyRateFC = parseFloat((targetFC + deferredFCPct).toFixed(4));
            monthlyRateTA = parseFloat((targetTA + deferredTAPct).toFixed(4));
            monthlyRateFR = parseFloat((targetFR + deferredFRPct).toFixed(4));
            deferredFCPct = 0; deferredTAPct = 0; deferredFRPct = 0;
        } else {
            monthlyRateFC = parseFloat((targetFC * 0.5).toFixed(4));
            monthlyRateTA = parseFloat((targetTA * 0.5).toFixed(4));
            monthlyRateFR = parseFloat((targetFR * 0.5).toFixed(4));
            deferredFCPct += (targetFC - monthlyRateFC);
            deferredTAPct += (targetTA - monthlyRateTA);
            deferredFRPct += (targetFR - monthlyRateFR);
        }
    } else if (quota.paymentPlan === PaymentPlanType.REDUZIDA) {
        const halfTerm = Math.ceil(termMonths / 2);
        const isNotContemplatedYet = !quota.isContemplated || (quota.contemplationDate && createLocalDate(quota.contemplationDate) > finalDueDate);
        const isReducedPeriod = i <= halfTerm && isNotContemplatedYet;

        if (isReducedPeriod) {
            monthlyRateFC = parseFloat(((100 / termMonths) * 0.5).toFixed(4));
        } else {
            monthlyRateFC = parseFloat((remainingPctFC / monthsLeft).toFixed(4));
        }
        monthlyRateTA = parseFloat((remainingPctTA / monthsLeft).toFixed(4));
        monthlyRateFR = parseFloat((remainingPctFR / monthsLeft).toFixed(4));
    } else {
        monthlyRateFC = parseFloat((remainingPctFC / monthsLeft).toFixed(4));
        monthlyRateTA = parseFloat((remainingPctTA / monthsLeft).toFixed(4));
        monthlyRateFR = parseFloat((remainingPctFR / monthsLeft).toFixed(4));
    }

    // Cálculo Monetário da Parcela baseado no Crédito Atualizado do mês
    const installmentFC = parseFloat(((monthlyRateFC / 100) * currentCreditValue).toFixed(2));
    const installmentTA = parseFloat(((monthlyRateTA / 100) * currentCreditValue).toFixed(2));
    const installmentFR = parseFloat(((monthlyRateFR / 100) * currentCreditValue).toFixed(2));
    
    remainingPctFC -= monthlyRateFC;
    remainingPctTA -= monthlyRateTA;
    remainingPctFR -= monthlyRateFR;

    const totalInstallment = installmentFC + installmentTA + installmentFR;

    schedule.push({
      installmentNumber: i, dueDate: dueDateStr, commonFund: installmentFC, monthlyRateFC, reserveFund: installmentFR, monthlyRateFR, adminFee: installmentTA, monthlyRateTA, totalInstallment,
      balanceFC: (remainingPctFC / 100) * currentCreditValue, 
      balanceFR: (remainingPctFR / 100) * currentCreditValue, 
      balanceTA: (remainingPctTA / 100) * currentCreditValue, 
      balanceTotal: ((remainingPctFC + remainingPctTA + remainingPctFR) / 100) * currentCreditValue,
      percentBalanceFC: Math.max(0, remainingPctFC), 
      percentBalanceFR: Math.max(0, remainingPctFR), 
      percentBalanceTA: Math.max(0, remainingPctTA), 
      percentBalanceTotal: Math.max(0, remainingPctFC + remainingPctTA + remainingPctFR),
      bidAmountApplied, bidDate: bidDateApplied,
      bidEmbeddedApplied, bidEmbeddedPercent, bidEmbeddedAbatementFC, bidEmbeddedPercentFC, bidEmbeddedAbatementFR, bidEmbeddedPercentFR, bidEmbeddedAbatementTA, bidEmbeddedPercentTA,
      bidFreeApplied, bidFreePercent, bidFreeAbatementFC, bidFreePercentFC, bidFreeAbatementFR, bidFreePercentFR, bidFreeAbatementTA, bidFreePercentTA,
      bidAbatementFC: bidEmbeddedAbatementFC + bidFreeAbatementFC, bidAbatementFR: bidEmbeddedAbatementFR + bidFreeAbatementFR, bidAbatementTA: bidEmbeddedAbatementTA + bidFreeAbatementTA,
      correctionApplied, correctionFactor, correctedCreditValue: currentCreditValue, correctionIndexName,
      realAmountPaid: null, isPaid: false
    });
  }
  return schedule;
};
