
import { Quota, PaymentInstallment, PaymentPlanType, MonthlyIndex, CorrectionIndex, BidBaseType, CalculationMethod, PaymentStatus, ManualTransactionType } from '../types';
import { addMonths, getNextBusinessDay, createLocalDate, safeParseNumber } from '../utils/formatters';

// Removed local createLocalDate definition

// Removed local safeParseNumber definition

// Função para calcular a TIR (Taxa Interna de Retorno) / IRR
export const calculateIRR = (cashFlows: number[], guess = 0.01): number | null => {
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
    if (isNaN(newRate) || !isFinite(newRate)) return null;
    rate = newRate;
  }

  return null;
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

export const calculateAverageIndices = (indices: MonthlyIndex[]): Record<string, number> => {
  const averages: Record<string, number> = {};
  const types = Object.values(CorrectionIndex);
  
  const today = new Date();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(today.getFullYear() - 3);
  
  types.forEach(type => {
    const relevantIndices = indices.filter(i => 
      i.type === type && 
      new Date(i.date) >= threeYearsAgo &&
      new Date(i.date) <= today &&
      i.rate !== 0
    );
    
    if (relevantIndices.length > 0) {
      const sum = relevantIndices.reduce((s, i) => s + i.rate, 0);
      averages[type] = sum / relevantIndices.length;
    } else {
      // Fallback values if no historical data
      if (type.includes('CDI')) averages[type] = 0.92;
      else if (type.includes('IPCA')) averages[type] = 0.45;
      else if (type.includes('INCC')) averages[type] = 0.5;
      else averages[type] = 0.4;
    }
  });
  
  return averages;
};

export const calculateCurrentCreditValue = (quota: Quota, indices: MonthlyIndex[] = [], customCutoff?: Date, forceContemplationFreeze: boolean = false, ignoreStopCorrection: boolean = false, projectFutureIndices: boolean = false): number => {
  if (!quota) return 0;
  let currentCreditValue = Number(quota.creditValue) || 0;
  
  const avgIndices = projectFutureIndices ? calculateAverageIndices(indices) : {};
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  // NUNCA iniciar o contador de reajuste anual com base na Data_Adesao ou data de pagamento da primeira parcela.
  const firstAssemblyStr = quota.firstAssemblyDate;
  if (!firstAssemblyStr) return currentCreditValue; // Congelado se não houver assembleia
  
  const firstAssemblyDate = createLocalDate(firstAssemblyStr);
  
  let cutoffDate = customCutoff || new Date();
  cutoffDate.setHours(23,59,59,999);

  if (quota.isContemplated && !ignoreStopCorrection) {
      // Se contemplada mas sem data, congela no valor original (regra de segurança)
      if (!quota.contemplationDate) {
          return currentCreditValue;
      }

      if (quota.stopCreditCorrection || forceContemplationFreeze) {
          const contDate = createLocalDate(quota.contemplationDate);
          contDate.setHours(23,59,59,999);
          if (contDate < cutoffDate) {
              cutoffDate = contDate;
          }
      }
  }
  
  let anniversaryCount = 1;
  let safetyCounter = 0;
  
  while (safetyCounter < 100) {
      // Data_Proximo_Reajuste DEVE obrigatoriamente ser calculada como: Data_1a_Assembleia + 12 meses.
      const nextAdjustmentDate = addMonths(firstAssemblyDate, anniversaryCount * 12);
      
      if (nextAdjustmentDate > cutoffDate) break;

      // REGRA DE DEFASAGEM DE ÍNDICE:
      let indexEndDate: Date;
      if (quota.indexReferenceMonth) {
          const targetMonth = quota.indexReferenceMonth - 1; // 0-11
          const targetYear = targetMonth >= nextAdjustmentDate.getMonth() ? nextAdjustmentDate.getFullYear() - 1 : nextAdjustmentDate.getFullYear();
          indexEndDate = new Date(targetYear, targetMonth, 1);
      } else {
          indexEndDate = addMonths(nextAdjustmentDate, -2);
      }
      
      const isAnnual = quota.correctionIndex.endsWith('_12');
      
      let accumulatedMultiplier = 1;
      let hasAnyIndex = false;
      
      if (isAnnual) {
          const year = indexEndDate.getFullYear();
          const month = String(indexEndDate.getMonth() + 1).padStart(2, '0');
          const indexLookupStr = `${year}-${month}-01`;
          const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
          
          if (monthlyIndex && monthlyIndex.rate !== 0) {
              accumulatedMultiplier = (1 + (monthlyIndex.rate / 100));
              hasAnyIndex = true;
          } else if (projectFutureIndices) {
              const avgRate = avgIndices[quota.correctionIndex] || 0;
              accumulatedMultiplier = (1 + (avgRate / 100));
              hasAnyIndex = true;
          }
      } else {
          const indexStartDate = addMonths(indexEndDate, -11); // 12 months total
          for (let m = 0; m < 12; m++) {
              const currentMonthDate = addMonths(indexStartDate, m);
              const year = currentMonthDate.getFullYear();
              const month = String(currentMonthDate.getMonth() + 1).padStart(2, '0');
              const indexLookupStr = `${year}-${month}-01`;
              
              const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
              
              if (monthlyIndex && monthlyIndex.rate !== 0) {
                  accumulatedMultiplier *= (1 + (monthlyIndex.rate / 100));
                  hasAnyIndex = true;
              } else if (projectFutureIndices) {
                  const avgRate = avgIndices[quota.correctionIndex] || 0;
                  accumulatedMultiplier *= (1 + (avgRate / 100));
                  hasAnyIndex = true;
              }
          }
      }
      
      if (hasAnyIndex) {
          let appliedRate = (accumulatedMultiplier - 1) * 100;
          if (quota.correctionRateCap && quota.correctionRateCap > 0) {
              appliedRate = Math.min(appliedRate, quota.correctionRateCap);
          }
          currentCreditValue = currentCreditValue * (1 + (appliedRate / 100));
      }
      
      anniversaryCount++;
      safetyCounter++;
  }
  return currentCreditValue;
};

export interface ScheduleSummary {
  paid: {
    fc: number;
    fr: number;
    ta: number;
    insurance: number;
    amortization: number;
    fine: number;
    interest: number;
    total: number;
    percent: number;
    bidFree: number;
    bidEmbedded: number;
    manualEarnings: number;
  };
  toPay: {
    fc: number;
    fr: number;
    ta: number;
    insurance: number;
    amortization: number;
    fine: number;
    interest: number;
    total: number;
    percent: number;
    bidFree: number;
    bidEmbedded: number;
    manualEarnings: number;
  };
  total: {
    fc: number;
    fr: number;
    ta: number;
    insurance: number;
    amortization: number;
    total: number;
  };
}

export function calculateScheduleSummary(
  quota: Quota,
  schedule: PaymentInstallment[],
  payments: Record<number, any>
): ScheduleSummary {
  const stats = {
    paid: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, percent: 0, bidFree: 0, bidEmbedded: 0, manualEarnings: 0 },
    toPay: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, percent: 0, bidFree: 0, bidEmbedded: 0, manualEarnings: 0 },
  };

  const totalPercentContract = 100 + (quota.adminFeeRate || 0) + (quota.reserveFundRate || 0);

  schedule.forEach(inst => {
    // monthlyRateFC already includes manualEarnings in calculationService.ts
    const instPct = (inst.monthlyRateFC || 0) + (inst.monthlyRateFR || 0) + (inst.monthlyRateTA || 0);

    if (inst.isPaid) {
      if (inst.isManualTransaction && inst.manualTransactionType === ManualTransactionType.EXTRA_PAYMENT) {
        stats.paid.fc += (inst.realAmountPaid || 0);
      } else {
        stats.paid.fc += inst.commonFund + (inst.manualEarnings || 0);
        stats.paid.manualEarnings += (inst.manualEarnings || 0);
      }
      stats.paid.fr += inst.reserveFund;
      stats.paid.ta += inst.adminFee;
      stats.paid.insurance += (inst.insurance || 0);
      stats.paid.amortization += (inst.amortization || 0);
      stats.paid.fine += (inst.manualFine || 0);
      stats.paid.interest += (inst.manualInterest || 0);
      stats.paid.percent += instPct;
    } else {
      stats.toPay.fc += inst.commonFund;
      stats.toPay.fr += inst.reserveFund;
      stats.toPay.ta += inst.adminFee;
      stats.toPay.insurance += (inst.insurance || 0);
      stats.toPay.amortization += (inst.amortization || 0);
      stats.toPay.fine += (inst.manualFine || 0);
      stats.toPay.interest += (inst.manualInterest || 0);
      stats.toPay.percent += instPct;
    }

    if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
      const isFreeBidPaid = payments[0]?.status === 'PAGO';
      const isEmbeddedBidPaid = payments[-1]?.status === 'PAGO';

      const freeBidPct = (inst.bidFreePercentFC || 0) + (inst.bidFreePercentFR || 0) + (inst.bidFreePercentTA || 0);
      const embeddedBidPct = (inst.bidEmbeddedPercentFC || 0) + (inst.bidEmbeddedPercentFR || 0) + (inst.bidEmbeddedPercentTA || 0);

      if (isFreeBidPaid) {
        const freeBidAmount = (inst.bidFreeAbatementFC || 0) + (inst.bidFreeAbatementFR || 0) + (inst.bidFreeAbatementTA || 0);
        stats.paid.fc += (inst.bidFreeAbatementFC || 0);
        stats.paid.fr += (inst.bidFreeAbatementFR || 0);
        stats.paid.ta += (inst.bidFreeAbatementTA || 0);
        stats.paid.bidFree += freeBidAmount;
        stats.paid.percent += freeBidPct;
      } else {
        const freeBidAmount = (inst.bidFreeAbatementFC || 0) + (inst.bidFreeAbatementFR || 0) + (inst.bidFreeAbatementTA || 0);
        stats.toPay.fc += (inst.bidFreeAbatementFC || 0);
        stats.toPay.fr += (inst.bidFreeAbatementFR || 0);
        stats.toPay.ta += (inst.bidFreeAbatementTA || 0);
        stats.toPay.bidFree += freeBidAmount;
        stats.toPay.percent += freeBidPct;
      }

      if (isEmbeddedBidPaid) {
        const embeddedBidAmount = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidEmbeddedAbatementFR || 0) + (inst.bidEmbeddedAbatementTA || 0);
        stats.paid.fc += (inst.bidEmbeddedAbatementFC || 0);
        stats.paid.fr += (inst.bidEmbeddedAbatementFR || 0);
        stats.paid.ta += (inst.bidEmbeddedAbatementTA || 0);
        stats.paid.bidEmbedded += embeddedBidAmount;
        stats.paid.percent += embeddedBidPct;
      } else {
        const embeddedBidAmount = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidEmbeddedAbatementFR || 0) + (inst.bidEmbeddedAbatementTA || 0);
        stats.toPay.fc += (inst.bidEmbeddedAbatementFC || 0);
        stats.toPay.fr += (inst.bidEmbeddedAbatementFR || 0);
        stats.toPay.ta += (inst.bidEmbeddedAbatementTA || 0);
        stats.toPay.bidEmbedded += embeddedBidAmount;
        stats.toPay.percent += embeddedBidPct;
      }
    }
  });

  const paidTotal = stats.paid.fc + stats.paid.fr + stats.paid.ta + stats.paid.insurance + stats.paid.amortization + stats.paid.fine + stats.paid.interest;
  const toPayTotal = stats.toPay.fc + stats.toPay.fr + stats.toPay.ta + stats.toPay.insurance + stats.toPay.amortization + stats.toPay.fine + stats.toPay.interest;

  return {
    paid: {
      ...stats.paid,
      total: paidTotal,
      percent: totalPercentContract > 0 ? (stats.paid.percent / totalPercentContract) * 100 : 0,
      bidFree: stats.paid.bidFree,
      bidEmbedded: stats.paid.bidEmbedded,
      manualEarnings: stats.paid.manualEarnings
    },
    toPay: {
      ...stats.toPay,
      total: toPayTotal,
      percent: totalPercentContract > 0 ? (stats.toPay.percent / totalPercentContract) * 100 : 0,
      bidFree: stats.toPay.bidFree,
      bidEmbedded: stats.toPay.bidEmbedded,
      manualEarnings: stats.toPay.manualEarnings
    },
    total: {
      fc: stats.paid.fc + stats.toPay.fc,
      fr: stats.paid.fr + stats.toPay.fr,
      ta: stats.paid.ta + stats.toPay.ta,
      insurance: stats.paid.insurance + stats.toPay.insurance,
      amortization: stats.paid.amortization + stats.toPay.amortization,
      total: paidTotal + toPayTotal
    }
  };
}

export const generateSchedule = (quota: Quota, indices: MonthlyIndex[] = [], payments: Record<number, any> = {}, manualTransactionsOverride?: any[], projectFutureIndices: boolean = false): PaymentInstallment[] => {
  const schedule: PaymentInstallment[] = [];
  if (!quota || !quota.firstDueDate) return [];
  
  const avgIndices = projectFutureIndices ? calculateAverageIndices(indices) : {};
  const today = new Date(); today.setHours(23, 59, 59, 999);
  
  const firstDueDate = createLocalDate(quota.firstDueDate);
  
  // REGRA DE OURO (Prompt Usuário): Trava na 1ª Assembleia
  // NUNCA iniciar o contador de reajuste anual com base na Data_Adesao ou data de pagamento da primeira parcela.
  const firstAssemblyStr = quota.firstAssemblyDate;
  const firstAssemblyDate = firstAssemblyStr ? createLocalDate(firstAssemblyStr) : null;
  
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

  let deferredFC_Reais = 0;
  let deferredTA_Reais = 0;
  let deferredFR_Reais = 0;

  let anniversaryCount = 1;
  let correctionAmountFC = 0, correctionAmountTA = 0, correctionAmountFR = 0, correctionAmountTotal = 0;

  // Sort manual transactions by date
  const manualTransactions = [...(manualTransactionsOverride || quota.manualTransactions || [])].sort((a, b) => a.date.localeCompare(b.date));
  let manualTxIndex = 0;

  for (let i = startInstallment; i <= termMonths; i++) {
    const tempDate = i === 1 ? new Date(firstDueDate) : addMonths(firstDueDate, i - 1);
    const currentDate = i === 1 ? tempDate : new Date(tempDate.getFullYear(), tempDate.getMonth(), dueDay);
    
    // Process manual transactions that occur before this installment's due date
    while (manualTxIndex < manualTransactions.length) {
      const tx = manualTransactions[manualTxIndex];
      const txDate = createLocalDate(tx.date);
      
      if (txDate < currentDate) {
        // Apply transaction
        const fc = tx.fc !== undefined && tx.fc !== null ? tx.fc : (tx.type === ManualTransactionType.EXTRA_PAYMENT ? tx.amount : 0);
        const fr = tx.fr || 0;
        const ta = tx.ta || 0;
        
        balanceFC_Reais -= fc;
        balanceFR_Reais -= fr;
        balanceTA_Reais -= ta;
        
        // Add to schedule
        schedule.push({
          installmentNumber: 0, // "000"
          dueDate: tx.date,
          commonFund: fc,
          reserveFund: fr,
          adminFee: ta,
          insurance: tx.insurance || 0,
          amortization: tx.amortization || 0,
          totalInstallment: tx.amount,
          realAmountPaid: tx.amount,
          isPaid: true,
          status: PaymentStatus.PAGO,
          paymentDate: tx.date,
          balanceFC: Math.max(0, balanceFC_Reais),
          balanceFR: Math.max(0, balanceFR_Reais),
          balanceTA: Math.max(0, balanceTA_Reais),
          balanceTotal: Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais),
          monthlyRateFC: ((fc + (tx.type === ManualTransactionType.EARNING ? tx.amount : 0)) / currentCreditValue) * 100,
          monthlyRateTA: (ta / currentCreditValue) * 100,
          monthlyRateFR: (fr / currentCreditValue) * 100,
          percentBalanceFC: Math.max(0, (balanceFC_Reais / currentCreditValue) * 100),
          percentBalanceFR: Math.max(0, (balanceFR_Reais / currentCreditValue) * 100),
          percentBalanceTA: Math.max(0, (balanceTA_Reais / currentCreditValue) * 100),
          percentBalanceTotal: Math.max(0, ((balanceFC_Reais + balanceTA_Reais + balanceFR_Reais) / currentCreditValue) * 100),
          isManualTransaction: true,
          manualTransactionId: tx.id,
          manualTransactionType: tx.type,
          manualTransactionDescription: tx.description,
          manualEarnings: tx.type === ManualTransactionType.EARNING ? tx.amount : 0,
          manualFine: tx.fine,
          manualInterest: tx.interest,
          tag: tx.type === ManualTransactionType.EARNING ? '[Rendimento]' : '[Aporte Extra]'
        });
        
        manualTxIndex++;
      } else {
        break;
      }
    }

    const finalDueDate = getNextBusinessDay(currentDate);
    const dueDateStr = finalDueDate.toISOString();
    const monthsLeft = termMonths - i + 1;

    // Identificação de Fase (Status da Cota)
    // SE Data_Adesao estiver preenchida E Data_1a_Assembleia for nula (ou data futura): Definir Status_Cota = "Pré-Grupo"
    const isPreGroup = !firstAssemblyDate || (firstAssemblyDate && finalDueDate < firstAssemblyDate);
    const tag = isPreGroup ? '[Pré-Grupo]' : undefined;

    // A correção anual acontece ANTES de processar o lance do mês para que o lance use a base atualizada
    let correctionApplied = false;
    let correctionFactor = 0;
    let correctionIndexName: string | undefined = undefined;
    let correctionCapApplied = false;
    let correctionRealRate = 0;
    let correctionBalanceFC = 0, correctionBalanceTA = 0, correctionBalanceFR = 0, correctionBalanceTotal = 0;
    let correctionPercentBalanceFC = 0, correctionPercentBalanceTA = 0, correctionPercentBalanceFR = 0, correctionPercentBalanceTotal = 0;
    
    // TRAVA DO GATILHO DE REAJUSTE (A Regra de Ouro):
    // Data_Proximo_Reajuste DEVE obrigatoriamente ser calculada como: Data_1a_Assembleia + 12 meses.
    if (firstAssemblyDate) {
        const monthsToNextAdjustment = quota.anticipateCorrectionMonth ? (anniversaryCount * 12 - 1) : (anniversaryCount * 12);
        const nextAdjustmentDate = addMonths(firstAssemblyDate, monthsToNextAdjustment);
        
        // Comparação robusta baseada no mês e ano para evitar problemas com o dia do vencimento vs dia da assembleia
        const nextAdjMonth = new Date(nextAdjustmentDate.getFullYear(), nextAdjustmentDate.getMonth(), 1);
        const currentMonth = new Date(finalDueDate.getFullYear(), finalDueDate.getMonth(), 1);

        if (currentMonth >= nextAdjMonth) {
            // REGRA: Se a cota estiver contemplada E o usuário marcou para parar a correção, 
            // verificamos se a data de contemplação é anterior à data do reajuste.
            let shouldApply = true;
            if (quota.isContemplated && quota.contemplationDate && quota.stopCreditCorrection) {
                const contemplationDate = createLocalDate(quota.contemplationDate);
                if (contemplationDate < nextAdjustmentDate) {
                    shouldApply = false;
                }
            }

            // REGRA DE DEFASAGEM: Busca índice de 2 meses antes da data de aniversário
            let indexEndDate: Date;
            if (quota.indexReferenceMonth) {
                const targetMonth = quota.indexReferenceMonth - 1; // 0-11
                const targetYear = targetMonth >= nextAdjustmentDate.getMonth() ? nextAdjustmentDate.getFullYear() - 1 : nextAdjustmentDate.getFullYear();
                indexEndDate = new Date(targetYear, targetMonth, 1);
            } else {
                indexEndDate = addMonths(nextAdjustmentDate, -2);
            }
            
            const isAnnual = quota.correctionIndex.endsWith('_12');

            if (shouldApply && (indexEndDate <= today || projectFutureIndices)) {
                let accumulatedMultiplier = 1;
                let hasAnyIndex = false;
                
                if (isAnnual) {
                    const year = indexEndDate.getFullYear();
                    const month = String(indexEndDate.getMonth() + 1).padStart(2, '0');
                    const indexLookupStr = `${year}-${month}-01`;
                    const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
                    
                    if (monthlyIndex && monthlyIndex.rate !== 0) {
                        accumulatedMultiplier = (1 + (monthlyIndex.rate / 100));
                        hasAnyIndex = true;
                    } else if (projectFutureIndices) {
                        const avgRate = avgIndices[quota.correctionIndex] || 0;
                        accumulatedMultiplier = (1 + (avgRate / 100));
                        hasAnyIndex = true;
                    }
                } else {
                    const indexStartDate = addMonths(indexEndDate, -11); // 12 months total
                    for (let m = 0; m < 12; m++) {
                        const currentMonthDate = addMonths(indexStartDate, m);
                        const year = currentMonthDate.getFullYear();
                        const month = String(currentMonthDate.getMonth() + 1).padStart(2, '0');
                        const indexLookupStr = `${year}-${month}-01`;
                        
                        const monthlyIndex = indices.find(idx => idx.type === quota.correctionIndex && idx.date === indexLookupStr);
                        
                        if (monthlyIndex && monthlyIndex.rate !== 0) {
                            accumulatedMultiplier *= (1 + (monthlyIndex.rate / 100));
                            hasAnyIndex = true;
                        } else if (projectFutureIndices) {
                            const avgRate = avgIndices[quota.correctionIndex] || 0;
                            accumulatedMultiplier *= (1 + (avgRate / 100));
                            hasAnyIndex = true;
                        }
                    }
                }
                
                if (hasAnyIndex) {
                    correctionApplied = true;
                    let appliedRate = (accumulatedMultiplier - 1) * 100;
                    correctionRealRate = appliedRate;
                    if (quota.correctionRateCap && quota.correctionRateCap > 0 && appliedRate > quota.correctionRateCap) {
                        appliedRate = quota.correctionRateCap;
                        correctionCapApplied = true;
                    }
                    correctionFactor = appliedRate / 100;
                    correctionIndexName = quota.correctionIndex;
                    
                    const deltaFC = balanceFC_Reais * correctionFactor;
                    const deltaTA = balanceTA_Reais * correctionFactor;
                    const deltaFR = balanceFR_Reais * correctionFactor;
                    const deltaTotal = deltaFC + deltaTA + deltaFR;

                    currentCreditValue *= (1 + correctionFactor);
                    balanceFC_Reais *= (1 + correctionFactor);
                    balanceTA_Reais *= (1 + correctionFactor);
                    balanceFR_Reais *= (1 + correctionFactor);
                    deferredFC_Reais *= (1 + correctionFactor);
                    deferredTA_Reais *= (1 + correctionFactor);
                    deferredFR_Reais *= (1 + correctionFactor);

                    correctionBalanceFC = balanceFC_Reais;
                    correctionBalanceTA = balanceTA_Reais;
                    correctionBalanceFR = balanceFR_Reais;
                    correctionBalanceTotal = balanceFC_Reais + balanceTA_Reais + balanceFR_Reais;
                    correctionPercentBalanceFC = (balanceFC_Reais / currentCreditValue) * 100;
                    correctionPercentBalanceTA = (balanceTA_Reais / currentCreditValue) * 100;
                    correctionPercentBalanceFR = (balanceFR_Reais / currentCreditValue) * 100;
                    correctionPercentBalanceTotal = (correctionBalanceTotal / currentCreditValue) * 100;

                    // Store deltas
                    correctionAmountFC = deltaFC;
                    correctionAmountTA = deltaTA;
                    correctionAmountFR = deltaFR;
                    correctionAmountTotal = deltaTotal;
                }
            }
            
            anniversaryCount++;
        }
    } else {
        // Reset deltas if no correction this month
        correctionAmountFC = 0;
        correctionAmountTA = 0;
        correctionAmountFR = 0;
        correctionAmountTotal = 0;
    }

    // Base de Cálculo Monetária ATUALIZADA para o Percentual do Lance
    const currentBidCalcBase = quota.bidBase === BidBaseType.TOTAL_PROJECT 
        ? currentCreditValue * (1 + (adminFeeRateTotal + reserveFundRateTotal) / 100)
        : currentCreditValue;

    // Ensure currentBidCalcBase is a valid number
    const safeBidCalcBase = isNaN(currentBidCalcBase) || currentBidCalcBase <= 0 ? currentCreditValue : currentBidCalcBase;

    let bidAmountApplied = 0; 
    let bidDateApplied: string | undefined = undefined;
    let bidEmbeddedApplied = 0, bidEmbeddedPercent = 0, bidEmbeddedAbatementFC = 0, bidEmbeddedPercentFC = 0, bidEmbeddedAbatementFR = 0, bidEmbeddedPercentFR = 0, bidEmbeddedAbatementTA = 0, bidEmbeddedPercentTA = 0;
    let bidFreeApplied = 0, bidFreePercent = 0, bidFreeAbatementFC = 0, bidFreePercentFC = 0, bidFreeAbatementFR = 0, bidFreePercentFR = 0, bidFreeAbatementTA = 0, bidFreePercentTA = 0;
    
    let bidEmbeddedBalanceBeforeFC = 0, bidEmbeddedBalanceBeforeTA = 0, bidEmbeddedBalanceBeforeFR = 0, bidEmbeddedBalanceBeforeTotal = 0;
    let bidEmbeddedPercentBalanceBeforeFC = 0, bidEmbeddedPercentBalanceBeforeTA = 0, bidEmbeddedPercentBalanceBeforeFR = 0, bidEmbeddedPercentBalanceBeforeTotal = 0;
    let bidFreeBalanceBeforeFC = 0, bidFreeBalanceBeforeTA = 0, bidFreeBalanceBeforeFR = 0, bidFreeBalanceBeforeTotal = 0;
    let bidFreePercentBalanceBeforeFC = 0, bidFreePercentBalanceBeforeTA = 0, bidFreePercentBalanceBeforeFR = 0, bidFreePercentBalanceBeforeTotal = 0;

    let bidEmbeddedBalanceFC = 0, bidEmbeddedBalanceTA = 0, bidEmbeddedBalanceFR = 0, bidEmbeddedBalanceTotal = 0;
    let bidEmbeddedPercentBalanceFC = 0, bidEmbeddedPercentBalanceTA = 0, bidEmbeddedPercentBalanceFR = 0, bidEmbeddedPercentBalanceTotal = 0;
    let bidFreeBalanceFC = 0, bidFreeBalanceTA = 0, bidFreeBalanceFR = 0, bidFreeBalanceTotal = 0;
    let bidFreePercentBalanceFC = 0, bidFreePercentBalanceTA = 0, bidFreePercentBalanceFR = 0, bidFreePercentBalanceTotal = 0;

    // Apply bid if contemplated. If date is missing, apply on the first possible installment.
    const bidDateToCompare = quota.contemplationDate ? createLocalDate(quota.contemplationDate) : firstDueDate;
    if (quota.isContemplated && !bidProcessed && bidDateToCompare <= finalDueDate) {
         bidProcessed = true;
         bidDateApplied = quota.contemplationDate || quota.firstDueDate;
         bidAmountApplied = safeParseNumber(quota.bidTotal);

             // O lance será sempre abatido para que a simulação reflita o contrato (100%)
             const distributeBid = (amount: number) => {
                 let mFC = 0, mTA = 0, mFR = 0;
                 const safeAmount = safeParseNumber(amount);

                 if (quota.prioritizeFeesInBid) {
                     // Prioritize TA and FR
                     mTA = parseFloat(Math.min(safeAmount, Math.max(0, balanceTA_Reais)).toFixed(2));
                     let remaining = safeAmount - mTA;
                     mFR = parseFloat(Math.min(remaining, Math.max(0, balanceFR_Reais)).toFixed(2));
                     remaining -= mFR;
                     mFC = parseFloat(remaining.toFixed(2));
                 } else {
                     const totalRemainingReais = Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais);
                     const weightFC = totalRemainingReais > 0 ? Math.max(0, balanceFC_Reais) / totalRemainingReais : 0;
                     const weightTA = totalRemainingReais > 0 ? Math.max(0, balanceTA_Reais) / totalRemainingReais : 0;
                     const weightFR = totalRemainingReais > 0 ? Math.max(0, balanceFR_Reais) / totalRemainingReais : 0;

                     mFC = parseFloat((safeAmount * weightFC).toFixed(2));
                     mTA = parseFloat((safeAmount * weightTA).toFixed(2));
                     mFR = parseFloat((safeAmount - mFC - mTA).toFixed(2));
                 }

                 // REGRAS SOLICITADAS: O % do valor pago deve ser (Valor / Crédito Base Atualizado) * 100
                 // pTotal: Percentual do lance sobre a base atualizada (Crédito ou Total Projeto)
                 const pTotalAbatido = safeBidCalcBase > 0 ? (safeAmount / safeBidCalcBase) * 100 : 0;
                 
                 // pFC/pTA/pFR: Representam o impacto desse abatimento no Saldo Devedor em relação ao Crédito Base (100%)
                 const pFC = currentCreditValue > 0 ? (mFC / currentCreditValue) * 100 : 0;
                 const pTA = currentCreditValue > 0 ? (mTA / currentCreditValue) * 100 : 0;
                 const pFR = currentCreditValue > 0 ? (mFR / currentCreditValue) * 100 : 0;

                 // SEMPRE abater do saldo para que a simulação reflita o contrato (100%)
                 balanceFC_Reais = parseFloat((balanceFC_Reais - mFC).toFixed(2));
                 balanceTA_Reais = parseFloat((balanceTA_Reais - mTA).toFixed(2));
                 balanceFR_Reais = parseFloat((balanceFR_Reais - mFR).toFixed(2));

                 return { mFC, mTA, mFR, pFC, pTA, pFR, pTotal: pTotalAbatido };
             };

             if (quota.bidEmbedded && safeParseNumber(quota.bidEmbedded) > 0) {
                 const bidEmbPayment = payments[-1];
                 const rawAmount = (bidEmbPayment && bidEmbPayment.amount !== null && bidEmbPayment.amount !== undefined) ? bidEmbPayment.amount : quota.bidEmbedded;
                 bidEmbeddedApplied = safeParseNumber(rawAmount);
                 
                 let res;
                 if (bidEmbPayment && (typeof bidEmbPayment.manualFC === 'number' || typeof bidEmbPayment.manualTA === 'number' || typeof bidEmbPayment.manualFR === 'number')) {
                     const mFC = safeParseNumber(bidEmbPayment.manualFC);
                     const mTA = safeParseNumber(bidEmbPayment.manualTA);
                     const mFR = safeParseNumber(bidEmbPayment.manualFR);
                     const pTotalAbatido = safeBidCalcBase > 0 ? (bidEmbeddedApplied / safeBidCalcBase) * 100 : 0;
                     const pFC = currentCreditValue > 0 ? (mFC / currentCreditValue) * 100 : 0;
                     const pTA = currentCreditValue > 0 ? (mTA / currentCreditValue) * 100 : 0;
                     const pFR = currentCreditValue > 0 ? (mFR / currentCreditValue) * 100 : 0;
                     
                     // SEMPRE abater do saldo para que a simulação reflita o contrato (100%)
                     balanceFC_Reais = parseFloat((balanceFC_Reais - mFC).toFixed(2));
                     balanceTA_Reais = parseFloat((balanceTA_Reais - mTA).toFixed(2));
                     balanceFR_Reais = parseFloat((balanceFR_Reais - mFR).toFixed(2));
                     
                     res = { mFC, mTA, mFR, pFC, pTA, pFR, pTotal: pTotalAbatido };
                 } else {
                     res = distributeBid(bidEmbeddedApplied);
                 }

                 bidEmbeddedBalanceBeforeFC = balanceFC_Reais + res.mFC;
                 bidEmbeddedBalanceBeforeTA = balanceTA_Reais + res.mTA;
                 bidEmbeddedBalanceBeforeFR = balanceFR_Reais + res.mFR;
                 bidEmbeddedBalanceBeforeTotal = bidEmbeddedBalanceBeforeFC + bidEmbeddedBalanceBeforeTA + bidEmbeddedBalanceBeforeFR;
                 bidEmbeddedPercentBalanceBeforeFC = currentCreditValue > 0 ? (bidEmbeddedBalanceBeforeFC / currentCreditValue) * 100 : 0;
                 bidEmbeddedPercentBalanceBeforeTA = currentCreditValue > 0 ? (bidEmbeddedBalanceBeforeTA / currentCreditValue) * 100 : 0;
                 bidEmbeddedPercentBalanceBeforeFR = currentCreditValue > 0 ? (bidEmbeddedBalanceBeforeFR / currentCreditValue) * 100 : 0;
                 bidEmbeddedPercentBalanceBeforeTotal = currentCreditValue > 0 ? (bidEmbeddedBalanceBeforeTotal / currentCreditValue) * 100 : 0;

                 bidEmbeddedAbatementFC = res.mFC; bidEmbeddedAbatementTA = res.mTA; bidEmbeddedAbatementFR = res.mFR;
                 bidEmbeddedPercent = res.pTotal; bidEmbeddedPercentFC = res.pFC; bidEmbeddedPercentTA = res.pTA; bidEmbeddedPercentFR = res.pFR;

                  bidEmbeddedBalanceFC = balanceFC_Reais;
                  bidEmbeddedBalanceTA = balanceTA_Reais;
                  bidEmbeddedBalanceFR = balanceFR_Reais;
                  bidEmbeddedBalanceTotal = balanceFC_Reais + balanceTA_Reais + balanceFR_Reais;
                  bidEmbeddedPercentBalanceFC = currentCreditValue > 0 ? (balanceFC_Reais / currentCreditValue) * 100 : 0;
                  bidEmbeddedPercentBalanceTA = currentCreditValue > 0 ? (balanceTA_Reais / currentCreditValue) * 100 : 0;
                  bidEmbeddedPercentBalanceFR = currentCreditValue > 0 ? (balanceFR_Reais / currentCreditValue) * 100 : 0;
                  bidEmbeddedPercentBalanceTotal = currentCreditValue > 0 ? (bidEmbeddedBalanceTotal / currentCreditValue) * 100 : 0;
             }
             if (quota.bidFree && safeParseNumber(quota.bidFree) > 0) {
                 const bidPayment = payments[0];
                 const rawAmount = (bidPayment && bidPayment.amount !== null && bidPayment.amount !== undefined) ? bidPayment.amount : quota.bidFree;
                 bidFreeApplied = safeParseNumber(rawAmount);
                 
                 let res;
                 if (bidPayment && (typeof bidPayment.manualFC === 'number' || typeof bidPayment.manualTA === 'number' || typeof bidPayment.manualFR === 'number')) {
                     const mFC = safeParseNumber(bidPayment.manualFC);
                     const mTA = safeParseNumber(bidPayment.manualTA);
                     const mFR = safeParseNumber(bidPayment.manualFR);
                     const pTotalAbatido = safeBidCalcBase > 0 ? (bidFreeApplied / safeBidCalcBase) * 100 : 0;
                     const pFC = currentCreditValue > 0 ? (mFC / currentCreditValue) * 100 : 0;
                     const pTA = currentCreditValue > 0 ? (mTA / currentCreditValue) * 100 : 0;
                     const pFR = currentCreditValue > 0 ? (mFR / currentCreditValue) * 100 : 0;
                     
                     // SEMPRE abater do saldo para que a simulação reflita o contrato (100%)
                     balanceFC_Reais = parseFloat((balanceFC_Reais - mFC).toFixed(2));
                     balanceTA_Reais = parseFloat((balanceTA_Reais - mTA).toFixed(2));
                     balanceFR_Reais = parseFloat((balanceFR_Reais - mFR).toFixed(2));
                     
                     res = { mFC, mTA, mFR, pFC, pTA, pFR, pTotal: pTotalAbatido };
                 } else {
                     res = distributeBid(bidFreeApplied);
                 }
                 
                 bidFreeBalanceBeforeFC = balanceFC_Reais + res.mFC;
                 bidFreeBalanceBeforeTA = balanceTA_Reais + res.mTA;
                 bidFreeBalanceBeforeFR = balanceFR_Reais + res.mFR;
                 bidFreeBalanceBeforeTotal = bidFreeBalanceBeforeFC + bidFreeBalanceBeforeTA + bidFreeBalanceBeforeFR;
                 bidFreePercentBalanceBeforeFC = currentCreditValue > 0 ? (bidFreeBalanceBeforeFC / currentCreditValue) * 100 : 0;
                 bidFreePercentBalanceBeforeTA = currentCreditValue > 0 ? (bidFreeBalanceBeforeTA / currentCreditValue) * 100 : 0;
                 bidFreePercentBalanceBeforeFR = currentCreditValue > 0 ? (bidFreeBalanceBeforeFR / currentCreditValue) * 100 : 0;
                 bidFreePercentBalanceBeforeTotal = currentCreditValue > 0 ? (bidFreeBalanceBeforeTotal / currentCreditValue) * 100 : 0;

                 bidFreeAbatementFC = res.mFC; bidFreeAbatementTA = res.mTA; bidFreeAbatementFR = res.mFR;
                 bidFreePercent = res.pTotal; bidFreePercentFC = res.pFC; bidFreePercentTA = res.pTA; bidFreePercentFR = res.pFR;

                  bidFreeBalanceFC = balanceFC_Reais;
                  bidFreeBalanceTA = balanceTA_Reais;
                  bidFreeBalanceFR = balanceFR_Reais;
                  bidFreeBalanceTotal = balanceFC_Reais + balanceTA_Reais + balanceFR_Reais;
                  bidFreePercentBalanceFC = currentCreditValue > 0 ? (balanceFC_Reais / currentCreditValue) * 100 : 0;
                  bidFreePercentBalanceTA = currentCreditValue > 0 ? (balanceTA_Reais / currentCreditValue) * 100 : 0;
                  bidFreePercentBalanceFR = currentCreditValue > 0 ? (balanceFR_Reais / currentCreditValue) * 100 : 0;
                  bidFreePercentBalanceTotal = currentCreditValue > 0 ? (bidFreeBalanceTotal / currentCreditValue) * 100 : 0;
             }
             
             bidAmountApplied = bidEmbeddedApplied + bidFreeApplied;
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
            installmentFC = parseFloat(Math.min(Math.max(0, balanceFC_Reais), (entry.rateFC / 100) * currentCreditValue).toFixed(2));
            installmentTA = parseFloat(Math.min(Math.max(0, balanceTA_Reais), (entry.rateTA / 100) * currentCreditValue).toFixed(2));
            installmentFR = parseFloat(Math.min(Math.max(0, balanceFR_Reais), (entry.rateFR / 100) * currentCreditValue).toFixed(2));
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

        // Apply manual earnings (reduces balance)
        if (payment.manualEarnings && typeof payment.manualEarnings === 'number') {
            balanceFC_Reais -= payment.manualEarnings;
        }
    }

    // Ajuste final para não cobrar mais do que o saldo devedor
    if (installmentFC > balanceFC_Reais) installmentFC = Math.max(0, balanceFC_Reais);
    if (installmentTA > balanceTA_Reais) installmentTA = Math.max(0, balanceTA_Reais);
    if (installmentFR > balanceFR_Reais) installmentFR = Math.max(0, balanceFR_Reais);

    // Calculate actual rates used (for display purposes)
    // Include manual earnings in the FC rate to ensure the total sum reflects all contributions
    let actualRateFC = ((installmentFC + (payment?.manualEarnings || 0)) / currentCreditValue) * 100;
    let actualRateTA = (installmentTA / currentCreditValue) * 100;
    let actualRateFR = (installmentFR / currentCreditValue) * 100;

    // Deduct from remaining balance in Reais to maintain continuous projection
    balanceFC_Reais = parseFloat((balanceFC_Reais - installmentFC).toFixed(2));
    balanceTA_Reais = parseFloat((balanceTA_Reais - installmentTA).toFixed(2));
    balanceFR_Reais = parseFloat((balanceFR_Reais - installmentFR).toFixed(2));

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
      bidEmbeddedBalanceFC: parseFloat(bidEmbeddedBalanceFC.toFixed(2)),
      bidEmbeddedBalanceTA: parseFloat(bidEmbeddedBalanceTA.toFixed(2)),
      bidEmbeddedBalanceFR: parseFloat(bidEmbeddedBalanceFR.toFixed(2)),
      bidEmbeddedBalanceTotal: parseFloat(bidEmbeddedBalanceTotal.toFixed(2)),
      bidEmbeddedPercentBalanceFC,
      bidEmbeddedPercentBalanceTA,
      bidEmbeddedPercentBalanceFR,
      bidEmbeddedPercentBalanceTotal,
      bidFreeBalanceFC: parseFloat(bidFreeBalanceFC.toFixed(2)),
      bidFreeBalanceTA: parseFloat(bidFreeBalanceTA.toFixed(2)),
      bidFreeBalanceFR: parseFloat(bidFreeBalanceFR.toFixed(2)),
      bidFreeBalanceTotal: parseFloat(bidFreeBalanceTotal.toFixed(2)),
      bidEmbeddedBalanceBeforeFC,
      bidEmbeddedBalanceBeforeTA,
      bidEmbeddedBalanceBeforeFR,
      bidEmbeddedBalanceBeforeTotal,
      bidEmbeddedPercentBalanceBeforeFC,
      bidEmbeddedPercentBalanceBeforeTA,
      bidEmbeddedPercentBalanceBeforeFR,
      bidEmbeddedPercentBalanceBeforeTotal,
      bidFreeBalanceBeforeFC,
      bidFreeBalanceBeforeTA,
      bidFreeBalanceBeforeFR,
      bidFreeBalanceBeforeTotal,
      bidFreePercentBalanceBeforeFC,
      bidFreePercentBalanceBeforeTA,
      bidFreePercentBalanceBeforeFR,
      bidFreePercentBalanceBeforeTotal,
      bidFreePercentBalanceFC,
      bidFreePercentBalanceTA,
      bidFreePercentBalanceFR,
      bidFreePercentBalanceTotal,
      bidAbatementFC: bidEmbeddedAbatementFC + bidFreeAbatementFC, bidAbatementFR: bidEmbeddedAbatementFR + bidFreeAbatementFR, bidAbatementTA: bidEmbeddedAbatementTA + bidFreeAbatementTA,
      correctionApplied, correctionFactor, correctedCreditValue: currentCreditValue, correctionIndexName, correctionCapApplied, correctionRealRate,
      correctionBalanceFC: parseFloat(correctionBalanceFC.toFixed(2)),
      correctionBalanceTA: parseFloat(correctionBalanceTA.toFixed(2)),
      correctionBalanceFR: parseFloat(correctionBalanceFR.toFixed(2)),
      correctionBalanceTotal: parseFloat(correctionBalanceTotal.toFixed(2)),
      correctionPercentBalanceFC,
      correctionPercentBalanceTA,
      correctionPercentBalanceFR,
      correctionPercentBalanceTotal,
      correctionAmountFC,
      correctionAmountTA,
      correctionAmountFR,
      correctionAmountTotal,
      realAmountPaid, 
      isPaid: ['PAGO', 'CONCILIADO', 'EFETIVADO', 'QUITADO'].includes(status?.trim().toUpperCase() || '') || (realAmountPaid !== null && realAmountPaid > 0) || (paymentDate !== null && paymentDate !== undefined),
      status: status as PaymentStatus,
      paymentDate,
      tag,
      manualFC: payment?.manualFC,
      manualFR: payment?.manualFR,
      manualTA: payment?.manualTA,
      manualFine: payment?.manualFine,
      manualInterest: payment?.manualInterest,
      manualInsurance: payment?.manualInsurance,
      manualAmortization: payment?.manualAmortization,
      manualEarnings: payment?.manualEarnings,
    });
  }

  // Process any remaining manual transactions after the last installment
  while (manualTxIndex < manualTransactions.length) {
    const tx = manualTransactions[manualTxIndex];
    balanceFC_Reais -= tx.amount;
    
    schedule.push({
      installmentNumber: 0,
      dueDate: tx.date,
      commonFund: 0,
      reserveFund: 0,
      adminFee: 0,
      insurance: 0,
      amortization: 0,
      totalInstallment: 0,
      realAmountPaid: tx.amount,
      isPaid: true,
      status: PaymentStatus.PAGO,
      paymentDate: tx.date,
      balanceFC: Math.max(0, balanceFC_Reais),
      balanceFR: Math.max(0, balanceFR_Reais),
      balanceTA: Math.max(0, balanceTA_Reais),
      balanceTotal: Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais),
      percentBalanceFC: Math.max(0, (balanceFC_Reais / currentCreditValue) * 100),
      percentBalanceFR: Math.max(0, (balanceFR_Reais / currentCreditValue) * 100),
      percentBalanceTA: Math.max(0, (balanceTA_Reais / currentCreditValue) * 100),
      percentBalanceTotal: Math.max(0, ((balanceFC_Reais + balanceTA_Reais + balanceFR_Reais) / currentCreditValue) * 100),
      isManualTransaction: true,
      manualTransactionId: tx.id,
      manualTransactionType: tx.type,
      manualTransactionDescription: tx.description,
      manualEarnings: tx.type === ManualTransactionType.EARNING ? tx.amount : 0,
      tag: tx.type === ManualTransactionType.EARNING ? '[Rendimento]' : '[Aporte Extra]'
    });
    
    manualTxIndex++;
  }

  return schedule;
};
