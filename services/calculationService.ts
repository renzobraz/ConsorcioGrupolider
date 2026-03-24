
import { Quota, PaymentInstallment, PaymentPlanType, MonthlyIndex, CorrectionIndex, BidBaseType, CalculationMethod, PaymentStatus, ManualTransactionType } from '../types';
import { addMonths, getNextBusinessDay, createLocalDate } from '../utils/formatters';

// Removed local createLocalDate definition

// Função para calcular a TIR (Taxa Interna de Retorno) / IRR
// Método de Newton-Raphson
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

export const calculateCurrentCreditValue = (quota: Quota, indices: MonthlyIndex[] = [], customCutoff?: Date): number => {
  if (!quota) return 0;
  let currentCreditValue = Number(quota.creditValue) || 0;
  
  // REGRA DE OURO (Prompt Usuário): Trava na 1ª Assembleia
  // NUNCA iniciar o contador de reajuste anual com base na Data_Adesao ou data de pagamento da primeira parcela.
  const firstAssemblyStr = quota.firstAssemblyDate;
  if (!firstAssemblyStr) return currentCreditValue; // Congelado se não houver assembleia
  
  const firstAssemblyDate = createLocalDate(firstAssemblyStr);
  const firstDueDate = createLocalDate(quota.firstDueDate || firstAssemblyStr);
  
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

export const generateSchedule = (quota: Quota, indices: MonthlyIndex[] = [], payments: Record<number, any> = {}): PaymentInstallment[] => {
  const schedule: PaymentInstallment[] = [];
  if (!quota || !quota.firstDueDate) return [];
  
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
  const today = new Date(); today.setHours(23, 59, 59, 999);

  let deferredFC_Reais = 0;
  let deferredTA_Reais = 0;
  let deferredFR_Reais = 0;

  let anniversaryCount = 1;
  let correctionAmountFC = 0, correctionAmountTA = 0, correctionAmountFR = 0, correctionAmountTotal = 0;

  // Sort manual transactions by date
  const manualTransactions = [...(quota.manualTransactions || [])].sort((a, b) => a.date.localeCompare(b.date));
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

            if (indexEndDate <= today) {
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

    let bidAmountApplied = 0; 
    let bidDateApplied: string | undefined = undefined;
    let bidEmbeddedApplied = 0, bidEmbeddedPercent = 0, bidEmbeddedAbatementFC = 0, bidEmbeddedPercentFC = 0, bidEmbeddedAbatementFR = 0, bidEmbeddedPercentFR = 0, bidEmbeddedAbatementTA = 0, bidEmbeddedPercentTA = 0;
    let bidFreeApplied = 0, bidFreePercent = 0, bidFreeAbatementFC = 0, bidFreePercentFC = 0, bidFreeAbatementFR = 0, bidFreePercentFR = 0, bidFreeAbatementTA = 0, bidFreePercentTA = 0;
    let bidEmbeddedBalanceFC = 0, bidEmbeddedBalanceTA = 0, bidEmbeddedBalanceFR = 0, bidEmbeddedBalanceTotal = 0;
    let bidEmbeddedPercentBalanceFC = 0, bidEmbeddedPercentBalanceTA = 0, bidEmbeddedPercentBalanceFR = 0, bidEmbeddedPercentBalanceTotal = 0;
    let bidFreeBalanceFC = 0, bidFreeBalanceTA = 0, bidFreeBalanceFR = 0, bidFreeBalanceTotal = 0;
    let bidFreePercentBalanceFC = 0, bidFreePercentBalanceTA = 0, bidFreePercentBalanceFR = 0, bidFreePercentBalanceTotal = 0;

    if (quota.isContemplated && quota.contemplationDate && !bidProcessed) {
        const bidDate = createLocalDate(quota.contemplationDate);
        if (bidDate <= finalDueDate) {
             bidProcessed = true;
             bidDateApplied = quota.contemplationDate;
             bidAmountApplied = quota.bidTotal || 0;

             // O lance será sempre abatido para que a simulação reflita o contrato (100%)
             const distributeBid = (amount: number) => {
                 let mFC = 0, mTA = 0, mFR = 0;

                 if (quota.prioritizeFeesInBid) {
                     // Prioritize TA and FR
                     mTA = parseFloat(Math.min(amount, Math.max(0, balanceTA_Reais)).toFixed(2));
                     let remaining = amount - mTA;
                     mFR = parseFloat(Math.min(remaining, Math.max(0, balanceFR_Reais)).toFixed(2));
                     remaining -= mFR;
                     mFC = parseFloat(remaining.toFixed(2));
                 } else {
                     const totalRemainingReais = Math.max(0, balanceFC_Reais + balanceTA_Reais + balanceFR_Reais);
                     const weightFC = totalRemainingReais > 0 ? Math.max(0, balanceFC_Reais) / totalRemainingReais : 0;
                     const weightTA = totalRemainingReais > 0 ? Math.max(0, balanceTA_Reais) / totalRemainingReais : 0;
                     const weightFR = totalRemainingReais > 0 ? Math.max(0, balanceFR_Reais) / totalRemainingReais : 0;

                     mFC = parseFloat((amount * weightFC).toFixed(2));
                     mTA = parseFloat((amount * weightTA).toFixed(2));
                     mFR = parseFloat((amount - mFC - mTA).toFixed(2));
                 }

                 // REGRAS SOLICITADAS: O % do valor pago deve ser (Valor / Crédito Base Atualizado) * 100
                 // pTotal: Percentual do lance sobre a base atualizada (Crédito ou Total Projeto)
                 const pTotalAbatido = (amount / currentBidCalcBase) * 100;
                 
                 // pFC/pTA/pFR: Representam o impacto desse abatimento no Saldo Devedor em relação ao Crédito Base (100%)
                 const pFC = (mFC / currentCreditValue) * 100;
                 const pTA = (mTA / currentCreditValue) * 100;
                 const pFR = (mFR / currentCreditValue) * 100;

                 // SEMPRE abater do saldo para que a simulação reflita o contrato (100%)
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

                  bidEmbeddedBalanceFC = balanceFC_Reais;
                  bidEmbeddedBalanceTA = balanceTA_Reais;
                  bidEmbeddedBalanceFR = balanceFR_Reais;
                  bidEmbeddedBalanceTotal = balanceFC_Reais + balanceTA_Reais + balanceFR_Reais;
                  bidEmbeddedPercentBalanceFC = (balanceFC_Reais / currentCreditValue) * 100;
                  bidEmbeddedPercentBalanceTA = (balanceTA_Reais / currentCreditValue) * 100;
                  bidEmbeddedPercentBalanceFR = (balanceFR_Reais / currentCreditValue) * 100;
                  bidEmbeddedPercentBalanceTotal = (bidEmbeddedBalanceTotal / currentCreditValue) * 100;
             }
             if (quota.bidFree && quota.bidFree > 0) {
                 const bidPayment = payments[0];
                 bidFreeApplied = (bidPayment && bidPayment.amount !== null) ? bidPayment.amount : quota.bidFree;
                 
                 let res;
                 if (bidPayment && (typeof bidPayment.manualFC === 'number' || typeof bidPayment.manualTA === 'number' || typeof bidPayment.manualFR === 'number')) {
                     const mFC = bidPayment.manualFC ?? 0;
                     const mTA = bidPayment.manualTA ?? 0;
                     const mFR = bidPayment.manualFR ?? 0;
                     const pTotalAbatido = (bidFreeApplied / currentBidCalcBase) * 100;
                     const pFC = (mFC / currentCreditValue) * 100;
                     const pTA = (mTA / currentCreditValue) * 100;
                     const pFR = (mFR / currentCreditValue) * 100;
                     
                     // SEMPRE abater do saldo para que a simulação reflita o contrato (100%)
                     balanceFC_Reais -= mFC;
                     balanceTA_Reais -= mTA;
                     balanceFR_Reais -= mFR;
                     
                     res = { mFC, mTA, mFR, pFC, pTA, pFR, pTotal: pTotalAbatido };
                 } else {
                     res = distributeBid(bidFreeApplied);
                 }
                 
                 bidFreeAbatementFC = res.mFC; bidFreeAbatementTA = res.mTA; bidFreeAbatementFR = res.mFR;
                 bidFreePercent = res.pTotal; bidFreePercentFC = res.pFC; bidFreePercentTA = res.pTA; bidFreePercentFR = res.pFR;

                  bidFreeBalanceFC = balanceFC_Reais;
                  bidFreeBalanceTA = balanceTA_Reais;
                  bidFreeBalanceFR = balanceFR_Reais;
                  bidFreeBalanceTotal = balanceFC_Reais + balanceTA_Reais + balanceFR_Reais;
                  bidFreePercentBalanceFC = (balanceFC_Reais / currentCreditValue) * 100;
                  bidFreePercentBalanceTA = (balanceTA_Reais / currentCreditValue) * 100;
                  bidFreePercentBalanceFR = (balanceFR_Reais / currentCreditValue) * 100;
                  bidFreePercentBalanceTotal = (bidFreeBalanceTotal / currentCreditValue) * 100;
             }
             
             bidAmountApplied = bidEmbeddedApplied + bidFreeApplied;
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

    // Calculate actual rates used (for display purposes)
    // Include manual earnings in the FC rate to ensure the total sum reflects all contributions
    let actualRateFC = ((installmentFC + (payment?.manualEarnings || 0)) / currentCreditValue) * 100;
    let actualRateTA = (installmentTA / currentCreditValue) * 100;
    let actualRateFR = (installmentFR / currentCreditValue) * 100;

    // Deduct from remaining balance in Reais to maintain continuous projection
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
      isPaid: status === 'PAGO',
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
