/**
 * Testes unitários para services/calculationService.ts
 *
 * Prioridade de cobertura:
 *   1. calculateCurrentCreditValue  — correção, defasagem, teto, congelamento
 *   2. generateSchedule (estrutura)  — parcelas, saldos, arredondamento 360 meses
 *   3. generateSchedule (planos)     — NORMAL / REDUZIDA / SEMESTRAL
 *   4. generateSchedule (lances)     — livre, embutido, distribuição proporcional
 *   5. generateSchedule (correção)   — aniversário, stopCreditCorrection, cap
 *   6. generateSchedule (extras)     — aquisição de terceiros, transações manuais
 *   7. calculateCDICorrection
 *   8. calculateIRR
 *
 * IMPORTANTE: nenhuma lógica do calculationService foi alterada.
 * Se um teste falhar por resultado inesperado, paramos e reportamos antes de mexer.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateIRR,
  calculateCDICorrection,
  calculateAverageIndices,
  calculateCurrentCreditValue,
  calculateScheduleSummary,
  generateSchedule,
  BID_FREE_PAYMENT_KEY,
  BID_EMBEDDED_PAYMENT_KEY,
} from './calculationService';
import {
  CorrectionIndex,
  PaymentPlanType,
  BidBaseType,
  CalculationMethod,
  ProductType,
  ManualTransactionType,
  type Quota,
  type MonthlyIndex,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cota base com defaults sensatos para testes.
 * firstDueDate = firstAssemblyDate = 2020-02-05 (quarta-feira, sem shift de fim de semana).
 * dueDay = 5 garante que os meses subsequentes também caiam em dias úteis comuns.
 */
function makeQuota(overrides: Partial<Quota> = {}): Quota {
  return {
    id: 'q1',
    group: 'G01',
    quotaNumber: '001',
    contractNumber: 'C001',
    creditValue: 120000,
    adhesionDate: '2020-01-05',
    firstAssemblyDate: '2020-02-05',
    termMonths: 12,
    adminFeeRate: 0,
    reserveFundRate: 0,
    productType: ProductType.VEHICLE,
    firstDueDate: '2020-02-05',
    dueDay: 5,
    correctionIndex: CorrectionIndex.INCC,
    paymentPlan: PaymentPlanType.NORMAL,
    isContemplated: false,
    ...overrides,
  };
}

/**
 * INCC mensal para Jan–Dez/2020.
 * Necessário para acionar a correção no 1º aniversário (Fev/2021).
 *
 * Cálculo do intervalo:
 *   anniversary1 = addMonths(2020-02-05, 12) = 2021-02-05
 *   indexEndDate  = addMonths(2021-02-05, -2) = 2020-12-05  → busca mês '2020-12-01'
 *   indexStartDate = addMonths(2020-12-05, -11) = 2020-01-05 → busca mês '2020-01-01'
 *   Loop m=0..11 → '2020-01-01' a '2020-12-01'
 */
function makeInccIndices(ratePerMonth: number): MonthlyIndex[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: `incc-${i}`,
    type: CorrectionIndex.INCC,
    date: `2020-${String(i + 1).padStart(2, '0')}-01`,
    rate: ratePerMonth,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. calculateCurrentCreditValue
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCurrentCreditValue', () => {
  it('retorna 0 quando quota é nula/falsa', () => {
    expect(calculateCurrentCreditValue(null as any)).toBe(0);
  });

  it('retorna creditValue quando firstAssemblyDate está ausente', () => {
    const quota = makeQuota({ creditValue: 100000, firstAssemblyDate: '' });
    const result = calculateCurrentCreditValue(quota, [], new Date(2021, 2, 1));
    expect(result).toBe(100000);
  });

  it('retorna creditValue quando customCutoff é anterior ao 1º aniversário', () => {
    const quota = makeQuota({ creditValue: 100000 });
    // Aniversário = 2021-02-05; cutoff = Jan/2021 (antes do aniversário)
    const cutoff = new Date(2021, 0, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    expect(result).toBe(100000);
  });

  it('aplica uma correção INCC após o 1º aniversário (12 meses × 1%)', () => {
    const quota = makeQuota({ creditValue: 100000 });
    // Cutoff = Mar/2021 (após aniversário Fev/2021)
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    // (1.01)^12 ≈ 1.12682503
    expect(result).toBeCloseTo(100000 * Math.pow(1.01, 12), 2);
  });

  it('limita o reajuste ao correctionRateCap quando taxa acumulada excede o teto', () => {
    const quota = makeQuota({ creditValue: 100000, correctionRateCap: 5 });
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    // Taxa acumulada ≈ 12.68% → limitada a 5%
    expect(result).toBeCloseTo(105000, 2);
  });

  it('aplica índice INCC_12 (acumulado anual) diretamente sobre o crédito', () => {
    const quota = makeQuota({
      creditValue: 100000,
      correctionIndex: CorrectionIndex.INCC_12,
    });
    // indexEndDate = Dez/2020 → busca '2020-12-01'
    const indices: MonthlyIndex[] = [
      { id: 'a', type: CorrectionIndex.INCC_12, date: '2020-12-01', rate: 12.0 },
    ];
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, indices, cutoff);
    expect(result).toBeCloseTo(112000, 2);
  });

  it('usa indexReferenceMonth para determinar o mês de referência do índice', () => {
    const quota = makeQuota({
      creditValue: 100000,
      correctionIndex: CorrectionIndex.INCC_12,
      indexReferenceMonth: 10, // outubro
    });
    // targetMonth = 9 (out); 9 >= 1 (fev) → targetYear = 2020
    // indexEndDate = Out/2020 → '2020-10-01'
    const indices: MonthlyIndex[] = [
      { id: 'a', type: CorrectionIndex.INCC_12, date: '2020-10-01', rate: 10.0 },
    ];
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, indices, cutoff);
    expect(result).toBeCloseTo(110000, 2);
  });

  it('congela correção quando contemplada com stopCreditCorrection antes do aniversário', () => {
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: '2020-06-05', // antes do aniversário Fev/2021
      stopCreditCorrection: true,
    });
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    expect(result).toBe(100000);
  });

  it('aplica correção quando contemplada MAS stopCreditCorrection é false', () => {
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: '2020-06-05',
      stopCreditCorrection: false,
    });
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    expect(result).toBeCloseTo(100000 * Math.pow(1.01, 12), 2);
  });

  it('forceContemplationFreeze limita cutoff à data de contemplação', () => {
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: '2020-06-05',
      stopCreditCorrection: false, // sem force, correção seria aplicada
    });
    const cutoff = new Date(2021, 2, 1);
    // forceContemplationFreeze = true → cutoffDate = Jun/2020 < aniversário Fev/2021
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff, true);
    expect(result).toBe(100000);
  });

  it('aplica dois reajustes anuais acumulados em 2 aniversários', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 36 });
    // Anniversary 1: Jan–Dez 2020; Anniversary 2: Jan–Dez 2021
    const indices: MonthlyIndex[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `2020-${i}`,
        type: CorrectionIndex.INCC,
        date: `2020-${String(i + 1).padStart(2, '0')}-01`,
        rate: 1.0,
      })),
      ...Array.from({ length: 12 }, (_, i) => ({
        id: `2021-${i}`,
        type: CorrectionIndex.INCC,
        date: `2021-${String(i + 1).padStart(2, '0')}-01`,
        rate: 1.0,
      })),
    ];
    const cutoff = new Date(2022, 2, 1); // Mar/2022, após 2 aniversários
    const result = calculateCurrentCreditValue(quota, indices, cutoff);
    // ((1.01)^12)^2 = (1.01)^24
    expect(result).toBeCloseTo(100000 * Math.pow(1.01, 24), 1);
  });

  it('não aplica reajuste quando nenhum índice está disponível para o período', () => {
    const quota = makeQuota({ creditValue: 100000 });
    const cutoff = new Date(2021, 2, 1);
    // Índices de tipo diferente (CDI) não devem ser usados para INCC
    const wrongIndices: MonthlyIndex[] = makeInccIndices(5.0).map(i => ({
      ...i,
      type: CorrectionIndex.CDI,
    }));
    const result = calculateCurrentCreditValue(quota, wrongIndices, cutoff);
    expect(result).toBe(100000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. generateSchedule — estrutura básica
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — estrutura básica', () => {
  it('retorna array vazio quando firstDueDate está ausente', () => {
    const quota = makeQuota({ firstDueDate: '' });
    expect(generateSchedule(quota)).toHaveLength(0);
  });

  it('gera exatamente termMonths parcelas para cota simples', () => {
    expect(generateSchedule(makeQuota({ termMonths: 12 }))).toHaveLength(12);
    expect(generateSchedule(makeQuota({ termMonths: 24 }))).toHaveLength(24);
    expect(generateSchedule(makeQuota({ termMonths: 60 }))).toHaveLength(60);
  });

  it('gera parcela única quitando o saldo inteiro quando termMonths = 1', () => {
    const quota = makeQuota({ termMonths: 1, creditValue: 10000 });
    const schedule = generateSchedule(quota);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].commonFund).toBeCloseTo(10000, 2);
    expect(schedule[0].balanceFC).toBe(0);
  });

  it('installmentNumber corresponde ao índice do loop (1-based)', () => {
    const schedule = generateSchedule(makeQuota({ termMonths: 6 }));
    schedule.forEach((inst, idx) => {
      expect(inst.installmentNumber).toBe(idx + 1);
    });
  });

  it('saldo FC decresce monotonicamente e atinge 0 na última parcela', () => {
    const schedule = generateSchedule(makeQuota({ termMonths: 24, creditValue: 120000 }));
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].balanceFC).toBeLessThanOrEqual(schedule[i - 1].balanceFC);
    }
    expect(schedule[schedule.length - 1].balanceFC).toBe(0);
  });

  it('totalInstallment = FC + FR + TA em todas as parcelas', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
    });
    generateSchedule(quota).forEach(inst => {
      const expected = inst.commonFund + inst.reserveFund + inst.adminFee;
      expect(inst.totalInstallment).toBeCloseTo(expected, 2);
    });
  });

  it('soma de todas as parcelas FC é igual ao creditValue', () => {
    const quota = makeQuota({ termMonths: 12, creditValue: 120000 });
    const total = generateSchedule(quota).reduce((s, i) => s + i.commonFund, 0);
    expect(total).toBeCloseTo(120000, 1);
  });

  it('soma de todas as parcelas FR é igual a creditValue × reserveFundRate%', () => {
    const quota = makeQuota({ termMonths: 12, creditValue: 100000, reserveFundRate: 5 });
    const total = generateSchedule(quota).reduce((s, i) => s + i.reserveFund, 0);
    expect(total).toBeCloseTo(5000, 1);
  });

  it('soma de todas as parcelas TA é igual a creditValue × adminFeeRate%', () => {
    const quota = makeQuota({ termMonths: 12, creditValue: 100000, adminFeeRate: 20 });
    const total = generateSchedule(quota).reduce((s, i) => s + i.adminFee, 0);
    expect(total).toBeCloseTo(20000, 1);
  });

  it('arredondamento ao longo de 360 parcelas: última parcela zera saldo, soma = creditValue', () => {
    const quota = makeQuota({ termMonths: 360, creditValue: 100000 });
    const schedule = generateSchedule(quota);
    expect(schedule).toHaveLength(360);
    expect(schedule[359].balanceFC).toBe(0);
    const total = schedule.reduce((s, i) => s + i.commonFund, 0);
    // Tolerância de R$1,00 em 360 parcelas para arredondamento acumulado de toFixed(2)
    expect(total).toBeCloseTo(100000, 0);
  });

  it('todas as parcelas têm isPaid = false quando nenhum pagamento é fornecido', () => {
    generateSchedule(makeQuota({ termMonths: 3 })).forEach(inst => {
      expect(inst.isPaid).toBe(false);
      expect(inst.status).toBe('PREVISTO');
    });
  });

  it('marca parcela como paga quando existe registro de pagamento com status PAGO', () => {
    const quota = makeQuota({ termMonths: 3 });
    const payments = {
      2: { amount: 10000, paymentDate: '2020-03-05', status: 'PAGO' },
    };
    const schedule = generateSchedule(quota, [], payments);
    expect(schedule[1].isPaid).toBe(true);
    expect(schedule[1].status).toBe('PAGO');
    expect(schedule[0].isPaid).toBe(false);
    expect(schedule[2].isPaid).toBe(false);
  });

  it('aplica overrides manuais de FC/FR/TA do objeto payments', () => {
    // NOTA: os overrides são limitados ao saldo devedor de cada componente.
    // Uma cota com adminFeeRate=0 zeraria o manualTA silenciosamente (comportamento a revisar).
    // Por isso usamos adminFeeRate=20 e reserveFundRate=5 para garantir saldo de TA e FR.
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 30000,
      adminFeeRate: 20,   // balanceTA = 6000
      reserveFundRate: 5, // balanceFR = 1500
    });
    const payments = { 1: { manualFC: 5000, manualTA: 1000, manualFR: 500 } };
    const schedule = generateSchedule(quota, [], payments);
    expect(schedule[0].commonFund).toBe(5000);
    expect(schedule[0].adminFee).toBe(1000);
    expect(schedule[0].reserveFund).toBe(500);
  });

  it('manualTA excedendo saldo disponível: aplica até o saldo e registra excesso em manualTAExcess', () => {
    // adminFeeRate = 0 → balanceTA = 0 para toda a cota
    // manualTA = 1000 → aplica 0 (saldo = 0), excesso = 1000
    const quota = makeQuota({ termMonths: 3, creditValue: 30000, adminFeeRate: 0 });
    const schedule = generateSchedule(quota, [], { 1: { manualTA: 1000 } });
    expect(schedule[0].adminFee).toBe(0);
    expect(schedule[0].manualTAExcess).toBeCloseTo(1000, 1);
  });

  it('balanceTotal = balanceFC + balanceFR + balanceTA em todas as parcelas', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
    });
    generateSchedule(quota).forEach(inst => {
      const expected = inst.balanceFC + inst.balanceFR + inst.balanceTA;
      expect(inst.balanceTotal).toBeCloseTo(expected, 2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. generateSchedule — planos de pagamento
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — planos de pagamento', () => {
  describe('NORMAL (LINEAR)', () => {
    it('cada parcela FC = saldo / meses restantes (amortização linear)', () => {
      const quota = makeQuota({ termMonths: 12, creditValue: 120000 });
      // 120000 / 12 = 10000 exato em todos os meses
      const schedule = generateSchedule(quota);
      schedule.forEach(inst => {
        expect(inst.commonFund).toBeCloseTo(10000, 2);
      });
    });
  });

  describe('SEMESTRAL', () => {
    it('meses 1-5 têm parcela FC menor que mês 6', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.SEMESTRAL,
      });
      const schedule = generateSchedule(quota);
      const month1FC = schedule[0].commonFund;
      const month6FC = schedule[5].commonFund;
      expect(month1FC).toBeLessThan(month6FC);
    });

    it('mês 6 paga o acumulado diferido dos meses 1-5 (valor aprox. 4× o mês 1)', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.SEMESTRAL,
      });
      const schedule = generateSchedule(quota);
      expect(schedule[5].commonFund).toBeGreaterThan(schedule[0].commonFund * 4);
    });

    it('meses 7-11 voltam a ser menores que o mês 12', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.SEMESTRAL,
      });
      const schedule = generateSchedule(quota);
      expect(schedule[7].commonFund).toBeLessThan(schedule[11].commonFund);
    });

    it('soma de todas as parcelas FC ≈ creditValue', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.SEMESTRAL,
      });
      const total = generateSchedule(quota).reduce((s, i) => s + i.commonFund, 0);
      expect(total).toBeCloseTo(120000, 0);
    });
  });

  describe('REDUZIDA', () => {
    it('primeira metade usa 50% da taxa teórica mensal', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.REDUZIDA,
      });
      const schedule = generateSchedule(quota);
      // theoreticalRateFC = parseFloat(((100/12)*0.5).toFixed(4)) = 4.1667
      // installmentFC = parseFloat((4.1667/100 * 120000).toFixed(2)) = 5000.04
      expect(schedule[0].commonFund).toBeCloseTo(5000, 0);
      expect(schedule[1].commonFund).toBeCloseTo(5000, 0);
      expect(schedule[5].commonFund).toBeCloseTo(5000, 0);
    });

    it('segunda metade tem parcela FC significativamente maior que a primeira', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.REDUZIDA,
      });
      const schedule = generateSchedule(quota);
      const firstHalfAvg = schedule.slice(0, 6).reduce((s, i) => s + i.commonFund, 0) / 6;
      const secondHalfAvg = schedule.slice(6).reduce((s, i) => s + i.commonFund, 0) / 6;
      // Segunda metade ≈ 15000, primeira ≈ 5000 → razão ~3x
      expect(secondHalfAvg).toBeGreaterThan(firstHalfAvg * 2);
    });

    it('soma de todas as parcelas FC ≈ creditValue', () => {
      const quota = makeQuota({
        termMonths: 12,
        creditValue: 120000,
        paymentPlan: PaymentPlanType.REDUZIDA,
      });
      const total = generateSchedule(quota).reduce((s, i) => s + i.commonFund, 0);
      expect(total).toBeCloseTo(120000, 0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. generateSchedule — lances (bid)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — lances', () => {
  it('aplica bidAmountApplied = bidTotal na parcela de contemplação', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 20000,
      bidTotal: 20000,
    });
    const schedule = generateSchedule(quota);
    expect(schedule[0].bidAmountApplied).toBe(20000);
    expect(schedule[0].bidFreeApplied).toBe(20000);
  });

  it('distribui o lance livre proporcionalmente entre FC, TA e FR', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,   // balanceTA = 20000
      reserveFundRate: 5, // balanceFR = 5000
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 20000,
      bidTotal: 20000,
      bidBase: BidBaseType.CREDIT_ONLY,
    });
    const schedule = generateSchedule(quota);
    const inst = schedule[0];
    // total restante = 125000; weightFC=0.8, weightTA=0.16, weightFR=0.04
    // mFC = 16000, mTA = 3200, mFR = 800
    expect(inst.bidFreeAbatementFC).toBeCloseTo(16000, 1);
    expect(inst.bidFreeAbatementTA).toBeCloseTo(3200, 1);
    expect(inst.bidFreeAbatementFR).toBeCloseTo(800, 1);
  });

  it('prioritizeFeesInBid: abate TA primeiro, depois FR, depois FC', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 10,   // balanceTA = 10000
      reserveFundRate: 5, // balanceFR = 5000
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 8000,      // menor que TA → tudo vai para TA
      bidTotal: 8000,
      prioritizeFeesInBid: true,
    });
    const schedule = generateSchedule(quota);
    const inst = schedule[0];
    // mTA = min(8000, 10000) = 8000; remaining = 0; mFR = 0; mFC = 0
    expect(inst.bidFreeAbatementTA).toBeCloseTo(8000, 1);
    expect(inst.bidFreeAbatementFR).toBeCloseTo(0, 1);
    expect(inst.bidFreeAbatementFC).toBeCloseTo(0, 1);
  });

  it('bidProcessed flag: lance é aplicado em apenas uma parcela', () => {
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 10000,
      bidTotal: 10000,
    });
    const schedule = generateSchedule(quota);
    const appliedCount = schedule.filter(i => (i.bidAmountApplied ?? 0) > 0).length;
    expect(appliedCount).toBe(1);
  });

  it('lance tardio (contemplação no mês 6) é aplicado na parcela correta', () => {
    // contemplação em Jul/2020 → dueDate do mês 6 é 2020-07-05 (domingo, deslocado para 2020-07-06)
    // bidDateToCompare = Jul 5 <= finalDueDate Jul 6 → aplica no mês 6
    const quota = makeQuota({
      creditValue: 120000,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-07-05',
      bidFree: 12000,
      bidTotal: 12000,
    });
    const schedule = generateSchedule(quota);
    // Parcelas 1-5 não devem ter lance
    for (let i = 0; i < 5; i++) {
      expect(schedule[i].bidAmountApplied ?? 0).toBe(0);
    }
    // Parcela 6 (schedule[5]) deve ter o lance
    expect(schedule[5].bidAmountApplied).toBe(12000);
  });

  it('balances FC/FR/TA diminuem após aplicação do lance', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 20000,
      bidTotal: 20000,
    });
    const scheduleWithBid = generateSchedule(quota);
    const scheduleNoBid = generateSchedule({ ...quota, isContemplated: false });

    // Com lance, a parcela 1 deve ter saldo menor
    expect(scheduleWithBid[0].balanceFC).toBeLessThan(scheduleNoBid[0].balanceFC);
  });

  it('lance embutido + lance livre: soma correta no bidAmountApplied', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidEmbedded: 5000,
      bidFree: 15000,
      bidTotal: 20000,
    });
    const schedule = generateSchedule(quota);
    expect(schedule[0].bidEmbeddedApplied).toBeCloseTo(5000, 1);
    expect(schedule[0].bidFreeApplied).toBeCloseTo(15000, 1);
    expect(schedule[0].bidAmountApplied).toBeCloseTo(20000, 1);
  });

  it('lance sem contemplationDate é aplicado na primeira parcela', () => {
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 12,
      isContemplated: true,
      contemplationDate: undefined, // sem data
      bidFree: 10000,
      bidTotal: 10000,
    });
    const schedule = generateSchedule(quota);
    // Sem data, bidDateToCompare = firstDueDate → aplica na parcela 1
    expect(schedule[0].bidAmountApplied).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. generateSchedule — correção anual no cronograma
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — correção anual', () => {
  const INCC_2020 = makeInccIndices(1.0);

  it('marca a parcela do aniversário com correctionApplied = true', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, INCC_2020);
    // Aniversário = addMonths(2020-02-05, 12) = 2021-02-05 → installment 13
    const inst13 = schedule.find(i => i.installmentNumber === 13);
    expect(inst13?.correctionApplied).toBe(true);
  });

  it('correctedCreditValue aumenta na parcela de aniversário', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, INCC_2020);
    const inst13 = schedule.find(i => i.installmentNumber === 13)!;
    // (1.01)^12 ≈ 1.12682503
    expect(inst13.correctedCreditValue).toBeCloseTo(100000 * Math.pow(1.01, 12), 1);
  });

  it('parcelas fora do aniversário têm correctionApplied = false', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, INCC_2020);
    schedule
      .filter(i => i.installmentNumber !== 13)
      .forEach(inst => {
        expect(inst.correctionApplied).toBe(false);
      });
  });

  it('correctionRateCap limita o correctionFactor na parcela de aniversário', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 24, correctionRateCap: 5 });
    const schedule = generateSchedule(quota, INCC_2020);
    const inst13 = schedule.find(i => i.installmentNumber === 13)!;
    // Taxa real ≈ 12.68%, limitada a 5%
    expect(inst13.correctionFactor).toBeCloseTo(0.05, 4);
    expect(inst13.correctionCapApplied).toBe(true);
    expect(inst13.correctionRealRate).toBeGreaterThan(5);
  });

  it('stopCreditCorrection: nenhuma parcela recebe correção quando contemplada antes do aniversário', () => {
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 24,
      isContemplated: true,
      contemplationDate: '2020-06-05', // antes do aniversário Fev/2021
      stopCreditCorrection: true,
    });
    const schedule = generateSchedule(quota, INCC_2020);
    schedule.forEach(inst => {
      expect(inst.correctionApplied).toBe(false);
    });
  });

  it('stopCreditCorrection = false: correção ainda é aplicada normalmente', () => {
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 24,
      isContemplated: true,
      contemplationDate: '2020-06-05',
      stopCreditCorrection: false,
    });
    const schedule = generateSchedule(quota, INCC_2020);
    const inst13 = schedule.find(i => i.installmentNumber === 13);
    expect(inst13?.correctionApplied).toBe(true);
  });

  it('após correção, as parcelas seguintes refletem o crédito atualizado', () => {
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, INCC_2020);
    const inst12 = schedule.find(i => i.installmentNumber === 12)!;
    const inst14 = schedule.find(i => i.installmentNumber === 14)!;
    // A parcela imediatamente após o aniversário deve ter parcela FC maior
    // porque o crédito base aumentou com a correção
    expect(inst14.correctedCreditValue!).toBeGreaterThan(inst12.correctedCreditValue ?? 100000);
  });

  it('anticipateCorrectionMonth: aniversário ocorre 1 mês antes', () => {
    const quotaNormal = makeQuota({ creditValue: 100000, termMonths: 24 });
    const quotaAnticipated = makeQuota({
      creditValue: 100000,
      termMonths: 24,
      anticipateCorrectionMonth: true,
    });
    // Precisamos de índices específicos para o mês antecipado
    // Para anniversaryCount=1 e anticipate=true: monthsToNextAdjustment = 12-1 = 11
    // nextAdjustmentDate = addMonths(2020-02-05, 11) = 2021-01-05 → installment 12
    // indexEndDate = addMonths(2021-01-05, -2) = 2020-11-05 → '2020-11-01'
    // indexStartDate = addMonths(2020-11-05, -11) = 2019-12-05 → '2019-12-01'
    // Índices necessários: Dez/2019 a Nov/2020
    const indicesAnticipated: MonthlyIndex[] = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2019, 11 + i, 1); // Dez/2019 + i meses
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return {
        id: `ant-${i}`,
        type: CorrectionIndex.INCC,
        date: `${year}-${month}-01`,
        rate: 1.0,
      };
    });

    const scheduleNormal = generateSchedule(quotaNormal, INCC_2020);
    const scheduleAnticipated = generateSchedule(quotaAnticipated, indicesAnticipated);

    // Normal: correção em installment 13; anticipated: correção em installment 12
    const correctionNormal = scheduleNormal.find(i => i.correctionApplied === true);
    const correctionAnticipated = scheduleAnticipated.find(i => i.correctionApplied === true);

    expect(correctionNormal?.installmentNumber).toBe(13);
    expect(correctionAnticipated?.installmentNumber).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. generateSchedule — aquisição de terceiros
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — aquisição de terceiros', () => {
  it('começa o cronograma a partir de assumedInstallment', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 120000,
      acquiredFromThirdParty: true,
      assumedInstallment: 7,
    });
    const schedule = generateSchedule(quota);
    // 12 - 7 + 1 = 6 parcelas
    expect(schedule).toHaveLength(6);
    expect(schedule[0].installmentNumber).toBe(7);
    expect(schedule[5].installmentNumber).toBe(12);
  });

  it('sem prePaidFCPercent: balanceFC inicial = creditValue completo', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 120000,
      acquiredFromThirdParty: true,
      assumedInstallment: 7,
    });
    const schedule = generateSchedule(quota);
    // monthsLeft = 6, balanceFC = 120000
    // installmentFC = 120000 / 6 = 20000
    expect(schedule[0].commonFund).toBeCloseTo(20000, 1);
  });

  it('com prePaidFCPercent = 50%: saldo FC inicial é reduzido pela metade', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 120000,
      acquiredFromThirdParty: true,
      assumedInstallment: 7,
      prePaidFCPercent: 50,
    });
    const schedule = generateSchedule(quota);
    // balanceFC = 120000 - 50% * 120000 = 60000; monthsLeft = 6
    // installmentFC = 60000 / 6 = 10000
    expect(schedule[0].commonFund).toBeCloseTo(10000, 1);
  });

  it('saldo ao final do cronograma é zero', () => {
    const quota = makeQuota({
      termMonths: 12,
      creditValue: 120000,
      acquiredFromThirdParty: true,
      assumedInstallment: 4,
    });
    const schedule = generateSchedule(quota);
    expect(schedule[schedule.length - 1].balanceFC).toBe(0);
    expect(schedule[schedule.length - 1].balanceTA).toBe(0);
    expect(schedule[schedule.length - 1].balanceFR).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. generateSchedule — transações manuais
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — transações manuais', () => {
  it('insere transação manual antes da 1ª parcela com installmentNumber = 0', () => {
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 12000,
      manualTransactions: [
        {
          id: 'm1',
          quotaId: 'q1',
          date: '2020-01-15', // antes de firstDueDate 2020-02-05
          amount: 3000,
          type: ManualTransactionType.EXTRA_PAYMENT,
          fc: 3000,
          fr: 0,
          ta: 0,
          description: 'aporte extra',
        },
      ],
    });
    const schedule = generateSchedule(quota);
    // schedule[0] = transação manual
    expect(schedule[0].installmentNumber).toBe(0);
    expect(schedule[0].isManualTransaction).toBe(true);
    expect(schedule[0].tag).toBe('[Aporte Extra]');
    expect(schedule[0].isPaid).toBe(true);
  });

  it('transação manual deduz FC do saldo antes das parcelas regulares', () => {
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 12000,
      adminFeeRate: 0,
      reserveFundRate: 0,
      manualTransactions: [
        {
          id: 'm1',
          quotaId: 'q1',
          date: '2020-01-15',
          amount: 3000,
          type: ManualTransactionType.EXTRA_PAYMENT,
          fc: 3000,
          fr: 0,
          ta: 0,
          description: 'aporte',
        },
      ],
    });
    const schedule = generateSchedule(quota);
    // Após manual tx: balanceFC = 12000 - 3000 = 9000
    // Parcela 1 (monthsLeft=3): 9000/3 = 3000
    const installment1 = schedule.find(i => i.installmentNumber === 1)!;
    expect(installment1.commonFund).toBeCloseTo(3000, 1);
  });

  it('transação de rendimento recebe tag [Rendimento]', () => {
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 12000,
      manualTransactions: [
        {
          id: 'm2',
          quotaId: 'q1',
          date: '2020-01-20',
          amount: 500,
          type: ManualTransactionType.EARNING,
          description: 'rendimento CDB',
        },
      ],
    });
    const schedule = generateSchedule(quota);
    expect(schedule[0].tag).toBe('[Rendimento]');
    expect(schedule[0].manualTransactionType).toBe(ManualTransactionType.EARNING);
  });

  it('transação manual após lastDueDate é adicionada ao final do cronograma', () => {
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 12000,
      manualTransactions: [
        {
          id: 'm3',
          quotaId: 'q1',
          date: '2025-01-01', // após todas as parcelas
          amount: 1000,
          type: ManualTransactionType.EXTRA_PAYMENT,
          fc: 1000,
          fr: 0,
          ta: 0,
          description: 'aporte tardio',
        },
      ],
    });
    const schedule = generateSchedule(quota);
    // 3 parcelas regulares + 1 tx manual ao final = 4 entradas
    expect(schedule).toHaveLength(4);
    expect(schedule[3].installmentNumber).toBe(0);
    expect(schedule[3].isManualTransaction).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. calculateCDICorrection
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCDICorrection', () => {
  it('retorna 0 para value = 0', () => {
    expect(calculateCDICorrection(0, '2020-01-01', [])).toBe(0);
  });

  it('retorna 0 quando value é negativo', () => {
    expect(calculateCDICorrection(-1000, '2020-01-01', [])).toBe(0);
  });

  it('retorna 0 quando startDateStr é undefined', () => {
    expect(calculateCDICorrection(1000, undefined, [])).toBe(0);
  });

  it('retorna 0 quando não há índices CDI disponíveis', () => {
    // Índices existem mas são de outro tipo
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.INCC, date: '2020-01-01', rate: 1.0 },
    ];
    expect(calculateCDICorrection(1000, '2020-01-01', indices)).toBe(0);
  });

  it('acumula CDI com fator 92% ao longo de 2 meses', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.CDI, date: '2020-01-01', rate: 0.5 },
      { id: '2', type: CorrectionIndex.CDI, date: '2020-02-01', rate: 0.5 },
    ];
    // effectiveRate = 0.5 × 0.92 = 0.46%
    // multiplier = (1.0046)^2 ≈ 1.00922116
    // correction = 1000 × 1.00922116 - 1000 ≈ 9.22
    const expected = 1000 * Math.pow(1 + 0.5 * 0.92 / 100, 2) - 1000;
    const result = calculateCDICorrection(1000, '2020-01-01', indices, '2020-03-01');
    expect(result).toBeCloseTo(expected, 4);
  });

  it('exclui índices fora do intervalo startDate–cutoff', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.CDI, date: '2019-12-01', rate: 2.0 }, // antes
      { id: '2', type: CorrectionIndex.CDI, date: '2020-01-01', rate: 0.5 }, // dentro
      { id: '3', type: CorrectionIndex.CDI, date: '2020-03-01', rate: 2.0 }, // depois
    ];
    const expected = 1000 * (1 + 0.5 * 0.92 / 100) - 1000;
    const result = calculateCDICorrection(1000, '2020-01-01', indices, '2020-02-01');
    expect(result).toBeCloseTo(expected, 4);
  });

  it('índice CDI com rate = 0 não contribui para o acumulado', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.CDI, date: '2020-01-01', rate: 0.5 },
      { id: '2', type: CorrectionIndex.CDI, date: '2020-02-01', rate: 0.0 }, // zero rate
    ];
    const result = calculateCDICorrection(1000, '2020-01-01', indices, '2020-03-01');
    // Mês com rate=0: multiplier *= (1 + 0) = 1 (não contribui)
    // Resultado = apenas o primeiro mês
    const expected = 1000 * (1 + 0.5 * 0.92 / 100) * 1 - 1000;
    expect(result).toBeCloseTo(expected, 4);
  });

  it('sem cutoffDate usa data atual como cutoff implícito', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.CDI, date: '2020-01-01', rate: 0.5 },
    ];
    // Sem cutoff: usa new Date(). O índice de 2020 está antes de hoje (2026) → incluso
    const result = calculateCDICorrection(1000, '2020-01-01', indices);
    expect(result).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. calculateIRR
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateIRR', () => {
  it('retorna ~10% para fluxos [-1000, 1100] (retorno simples de 1 período)', () => {
    const irr = calculateIRR([-1000, 1100]);
    expect(irr).not.toBeNull();
    expect(irr!).toBeCloseTo(0.1, 5);
  });

  it('converge para IRR que zera o VPL em fluxo multi-período', () => {
    // -1000 agora, 400 por 3 anos: IRR ≈ 9.7%
    const irr = calculateIRR([-1000, 400, 400, 400]);
    expect(irr).not.toBeNull();
    const npv =
      -1000 +
      400 / (1 + irr!) +
      400 / Math.pow(1 + irr!, 2) +
      400 / Math.pow(1 + irr!, 3);
    expect(Math.abs(npv)).toBeLessThan(0.001);
  });

  it('retorna IRR correta para investimento típico de consórcio', () => {
    // -100000 inicial, 12 parcelas de ~9167 (hipotético)
    const cashFlows = [-100000, ...Array(12).fill(9167)];
    const irr = calculateIRR(cashFlows);
    expect(irr).not.toBeNull();
    // Verifica que VPL ≈ 0 na taxa retornada
    const npv = cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + irr!, t), 0);
    expect(Math.abs(npv)).toBeLessThan(1); // tolerância de R$ 1,00
  });

  it('retorna null ou valor extremo para fluxo sem solução de convergência', () => {
    // Todos positivos, sem investimento inicial: matematicamente sem TIR real
    const irr = calculateIRR([100, 100, 100]);
    // O resultado pode ser null ou um número absurdo — validamos que não lança exceção
    expect(() => calculateIRR([100, 100, 100])).not.toThrow();
  });

  it('respeita o parâmetro guess inicial', () => {
    // O mesmo fluxo com diferentes chutes deve convergir para a mesma TIR
    const irr1 = calculateIRR([-1000, 1100], 0.01);
    const irr2 = calculateIRR([-1000, 1100], 0.5);
    if (irr1 !== null && irr2 !== null) {
      expect(irr1).toBeCloseTo(irr2, 4);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. generateSchedule — overrides de pagamento (Bloco B)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — overrides de pagamento', () => {
  it('manualEarnings deduz do saldo FC antes do truncation check e reduz parcelas futuras', () => {
    // creditValue = 12000, 3 meses → parcela normal = 4000/mês
    // Mês 1: earnings = 4000 → balanceFC cai para 12000-4000=8000 antes do check
    //        installmentFC = 4000 <= 8000 → não truncado → commonFund = 4000
    //        balanceFC pós = 8000-4000 = 4000
    // Mês 2: balanceFC = 4000, monthsLeft = 2 → installmentFC = 2000
    // Mês 3: último → installmentFC = 2000 (zera saldo)
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 1: { manualEarnings: 4000 } });

    expect(schedule[0].commonFund).toBeCloseTo(4000, 1);
    expect(schedule[0].manualEarnings).toBe(4000);
    expect(schedule[1].commonFund).toBeCloseTo(2000, 1);
    expect(schedule[2].commonFund).toBeCloseTo(2000, 1);
    expect(schedule[2].balanceFC).toBe(0);
    expect(schedule[0].manualEarningsExcess).toBeUndefined(); // sem excesso quando earnings <= saldo
  });

  it('manualEarnings > saldo FC: limita ao saldo, balanceFC vai a exatamente zero e excesso fica em manualEarningsExcess', () => {
    // creditValue = 12000, termMonths = 3 → balanceFC inicial = 12000
    // manualEarnings = 99999 > 12000 → aplica apenas 12000 (o saldo), excesso = 87999
    // balanceFC_Reais = 0 (não negativo)
    // installmentFC(4000) > balanceFC(0) → truncado a 0
    // Meses 2-3: saldo = 0 → commonFund = 0
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 1: { manualEarnings: 99999 } });

    expect(schedule[0].commonFund).toBe(0);
    expect(schedule[1].commonFund).toBe(0);
    expect(schedule[2].commonFund).toBe(0);
    expect(schedule[0].balanceFC).toBe(0);
    expect(schedule[0].manualEarningsExcess).toBeCloseTo(87999, 1); // 99999 - 12000
  });

  it('manualFC maior que saldo disponível é truncado ao saldo restante e excesso fica em manualFCExcess', () => {
    // creditValue = 12000, mês 1: balanceFC = 12000
    // override manualFC = 99999 → aplica 12000 (saldo), excesso = 87999
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 1: { manualFC: 99999 } });

    expect(schedule[0].commonFund).toBeCloseTo(12000, 1);
    expect(schedule[0].balanceFC).toBe(0);
    expect(schedule[1].commonFund).toBe(0);
    expect(schedule[2].commonFund).toBe(0);
    expect(schedule[0].manualFCExcess).toBeCloseTo(87999, 1); // 99999 - 12000
  });

  it('manualFR maior que saldo FR disponível é truncado ao saldo restante e excesso fica em manualFRExcess', () => {
    // reserveFundRate = 10% de 12000 = 1200 de saldo FR total
    // mês 1: override manualFR = 99999 → aplica 1200 (saldo), excesso = 98799
    const quota = makeQuota({ termMonths: 3, creditValue: 12000, reserveFundRate: 10 });
    const schedule = generateSchedule(quota, [], { 1: { manualFR: 99999 } });

    expect(schedule[0].reserveFund).toBeCloseTo(1200, 1);
    expect(schedule[0].balanceFR).toBe(0);
    expect(schedule[1].reserveFund).toBe(0);
    expect(schedule[2].reserveFund).toBe(0);
    expect(schedule[0].manualFRExcess).toBeCloseTo(98799, 1); // 99999 - 1200
  });

  it('manualInsurance é aplicado no campo insurance e somado ao totalInstallment', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 2: { manualInsurance: 50 } });

    expect(schedule[1].insurance).toBe(50);
    expect(schedule[1].totalInstallment).toBeCloseTo(schedule[1].commonFund + 50, 2);
    expect(schedule[0].insurance).toBe(0);
  });

  it('manualAmortization é aplicado no campo amortization e somado ao totalInstallment', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 2: { manualAmortization: 200 } });

    expect(schedule[1].amortization).toBe(200);
    expect(schedule[1].totalInstallment).toBeCloseTo(schedule[1].commonFund + 200, 2);
    expect(schedule[0].amortization).toBe(0);
  });

  it('manualFine é registrado em manualFine e incluído no totalInstallment', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 1: { manualFine: 75 } });

    expect(schedule[0].manualFine).toBe(75);
    expect(schedule[0].totalInstallment).toBeCloseTo(schedule[0].commonFund + 75, 2);
  });

  it('manualInterest é registrado em manualInterest e incluído no totalInstallment', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 1: { manualInterest: 25 } });

    expect(schedule[0].manualInterest).toBe(25);
    expect(schedule[0].totalInstallment).toBeCloseTo(schedule[0].commonFund + 25, 2);
  });

  it('parcela com paymentDate e sem status é marcada como isPaid = true (linha 956)', () => {
    // isPaid = status in [...] OR realAmountPaid > 0 OR paymentDate != null
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], { 2: { paymentDate: '2020-03-05' } });

    expect(schedule[1].isPaid).toBe(true);
    expect(schedule[0].isPaid).toBe(false);
    expect(schedule[2].isPaid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. calculateScheduleSummary (Bloco E)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateScheduleSummary', () => {
  it('cronograma vazio retorna todos os totais zero', () => {
    const summary = calculateScheduleSummary(makeQuota(), [], {});
    expect(summary.paid.fc).toBe(0);
    expect(summary.paid.total).toBe(0);
    expect(summary.toPay.fc).toBe(0);
    expect(summary.toPay.total).toBe(0);
  });

  it('parcelas não pagas acumulam em toPay', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], {});
    const summary = calculateScheduleSummary(quota, schedule, {});

    expect(summary.toPay.fc).toBeCloseTo(12000, 1);
    expect(summary.paid.fc).toBe(0);
    expect(summary.toPay.total).toBeCloseTo(12000, 1);
    expect(summary.paid.total).toBe(0);
  });

  it('parcelas pagas acumulam em paid', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], {
      1: { amount: 4000, paymentDate: '2020-02-05', status: 'PAGO' },
      2: { amount: 4000, paymentDate: '2020-03-05', status: 'PAGO' },
      3: { amount: 4000, paymentDate: '2020-04-05', status: 'PAGO' },
    });
    const summary = calculateScheduleSummary(quota, schedule, {});

    expect(summary.paid.fc).toBeCloseTo(12000, 1);
    expect(summary.toPay.fc).toBe(0);
    expect(summary.paid.total).toBeCloseTo(12000, 1);
    expect(summary.paid.percent).toBeCloseTo(100, 0);
  });

  it('total.fc = paid.fc + toPay.fc em cronograma misto', () => {
    const quota = makeQuota({ termMonths: 3, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], {
      1: { amount: 4000, paymentDate: '2020-02-05', status: 'PAGO' },
    });
    const summary = calculateScheduleSummary(quota, schedule, {});

    expect(summary.total.fc).toBeCloseTo(summary.paid.fc + summary.toPay.fc, 2);
    expect(summary.total.fc).toBeCloseTo(12000, 1);
  });

  it('manualEarnings de parcela paga é somado em paid.manualEarnings e incluído em paid.fc', () => {
    // termMonths=1 para simplicidade: earnings deduz do balance, installmentFC cobre o restante
    // creditValue=12000, earnings=4000 → balanceFC=8000 → installmentFC truncado para 8000
    // paid.fc = commonFund(8000) + manualEarnings(4000) = 12000
    // paid.manualEarnings = 4000
    const quota = makeQuota({ termMonths: 1, creditValue: 12000 });
    const schedule = generateSchedule(quota, [], {
      1: { amount: 8000, paymentDate: '2020-02-05', status: 'PAGO', manualEarnings: 4000 },
    });
    const summary = calculateScheduleSummary(quota, schedule, {});

    expect(summary.paid.manualEarnings).toBeCloseTo(4000, 1);
    expect(summary.paid.fc).toBeCloseTo(12000, 1);
  });

  it('isManualTransaction EXTRA_PAYMENT paga: paid.fc usa realAmountPaid (não commonFund)', () => {
    // Uma transação manual EXTRA_PAYMENT tem commonFund=0, mas realAmountPaid=tx.amount
    // calculateScheduleSummary deve usar realAmountPaid nesse caso
    const quota = makeQuota({
      termMonths: 3,
      creditValue: 12000,
      manualTransactions: [{
        id: 'm1', quotaId: 'q1', date: '2020-01-15',
        amount: 3000, type: ManualTransactionType.EXTRA_PAYMENT,
        fc: 3000, fr: 0, ta: 0, description: 'aporte extra',
      }],
    });
    const schedule = generateSchedule(quota);
    // schedule[0] = tx manual (isPaid=true, isManualTransaction=true, commonFund=0, realAmountPaid=3000)
    const txInst = schedule.find(i => i.isManualTransaction)!;
    expect(txInst.realAmountPaid).toBe(3000);

    const summary = calculateScheduleSummary(quota, schedule, {});
    // paid.fc deve incluir os 3000 do aporte (via realAmountPaid)
    expect(summary.paid.fc).toBeCloseTo(3000, 1);
  });

  it('lance livre marcado como pago via payments[0] acumula em paid.bidFree', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 10000,
      bidTotal: 10000,
    });
    const schedule = generateSchedule(quota);

    const summaryPaid = calculateScheduleSummary(quota, schedule, { 0: { status: 'PAGO' } });
    expect(summaryPaid.paid.bidFree).toBeCloseTo(10000, 1);
    expect(summaryPaid.toPay.bidFree).toBe(0);

    const summaryNotPaid = calculateScheduleSummary(quota, schedule, {});
    expect(summaryNotPaid.toPay.bidFree).toBeCloseTo(10000, 1);
    expect(summaryNotPaid.paid.bidFree).toBe(0);
  });

// ═══════════════════════════════════════════════════════════════════════════════
// 12. calculateCurrentCreditValue — branches residuais (Bloco A)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateCurrentCreditValue — branches residuais', () => {
  it('isContemplated sem contemplationDate retorna creditValue sem correção (early return L113)', () => {
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: undefined,
    });
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    expect(result).toBe(100000);
  });

  it('ignoreStopCorrection = true ignora o freeze e aplica correção mesmo com stopCreditCorrection', () => {
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: '2020-06-05', // antes do aniversário Fev/2021
      stopCreditCorrection: true,
    });
    const cutoff = new Date(2021, 2, 1);

    // Sem ignoreStopCorrection: freeze → retorna 100000
    const frozen = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff, false, false);
    expect(frozen).toBe(100000);

    // Com ignoreStopCorrection = true: ignora → aplica correção
    const ignored = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff, false, true);
    expect(ignored).toBeCloseTo(100000 * Math.pow(1.01, 12), 2);
  });

  it('contemplationDate posterior ao cutoffDate não retrocede o cutoff (L120 false branch)', () => {
    // contDate (Jun/2022) >= cutoffDate (Mar/2021) → condição L120 é falsa → cutoff não muda
    // aniversário Fev/2021 < cutoff Mar/2021 → correção ainda é aplicada
    const quota = makeQuota({
      creditValue: 100000,
      isContemplated: true,
      contemplationDate: '2022-06-05',
      stopCreditCorrection: true,
    });
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, makeInccIndices(1.0), cutoff);
    expect(result).toBeCloseTo(100000 * Math.pow(1.01, 12), 2);
  });

  it('projectionConfig.customRate projeta índices futuros com taxa anual personalizada', () => {
    // Sem índices INCC disponíveis → sem projeção: sem correção
    // Com projectionConfig.customRate = 12 (anual):
    //   mensal = (1.12)^(1/12) - 1 ≈ 0.9489%
    //   12 meses acumulados ≈ 12% → creditValue * 1.12 = 112000
    const quota = makeQuota({ creditValue: 100000, termMonths: 36 });
    const cutoff = new Date(2021, 2, 1);

    const withoutProjection = calculateCurrentCreditValue(quota, [], cutoff);
    expect(withoutProjection).toBe(100000); // sem índices, sem correção

    const withProjection = calculateCurrentCreditValue(quota, [], cutoff, false, false, {
      enabled: true,
      customRate: 12,
      periodMonths: 36,
    });
    expect(withProjection).toBeCloseTo(112000, 0);
  });

  it('indexReferenceMonth menor que mês do aniversário usa o próprio ano do aniversário (L139 false branch)', () => {
    // anniversary = Fev/2021 (mês 1). indexReferenceMonth = 1 (Janeiro, targetMonth = 0)
    // 0 >= 1? FALSE → targetYear = 2021 (não 2020)
    // indexEndDate = 2021-01-01
    const quota = makeQuota({
      creditValue: 100000,
      correctionIndex: CorrectionIndex.INCC_12,
      indexReferenceMonth: 1,
    });
    const indices: MonthlyIndex[] = [
      { id: 'a', type: CorrectionIndex.INCC_12, date: '2021-01-01', rate: 8.0 },
    ];
    const cutoff = new Date(2021, 2, 1);
    const result = calculateCurrentCreditValue(quota, indices, cutoff);
    expect(result).toBeCloseTo(108000, 2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. generateSchedule — overrides manuais de lance (Bloco C)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — overrides manuais de lance', () => {
  it('BidBaseType.TOTAL_PROJECT: percentual do lance é calculado sobre crédito + taxas', () => {
    const base = {
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      isContemplated: true as const,
      contemplationDate: '2020-02-05',
      bidFree: 10000,
      bidTotal: 10000,
    };
    const scheduleCredit = generateSchedule(makeQuota({ ...base, bidBase: BidBaseType.CREDIT_ONLY }));
    const scheduleTotal  = generateSchedule(makeQuota({ ...base, bidBase: BidBaseType.TOTAL_PROJECT }));

    // CREDIT_ONLY: base = 100000 → 10000/100000*100 = 10%
    expect(scheduleCredit[0].bidFreePercent).toBeCloseTo(10, 2);
    // TOTAL_PROJECT: base = 100000*(1+25/100) = 125000 → 10000/125000*100 = 8%
    expect(scheduleTotal[0].bidFreePercent).toBeCloseTo(8, 2);
  });

  it('payments[-1].manualFC/TA/FR sobrepõe a distribuição proporcional do lance embutido', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidEmbedded: 10000,
      bidTotal: 10000,
    });
    // Proporcional: mFC ≈ 8000, mTA ≈ 1600, mFR ≈ 400
    const scheduleProp = generateSchedule(quota);
    expect(scheduleProp[0].bidEmbeddedAbatementFC).toBeCloseTo(8000, 0);

    // Com override manual: valores específicos sobrepõem a distribuição
    const scheduleOverride = generateSchedule(quota, [], {
      [-1]: { manualFC: 6000, manualTA: 3000, manualFR: 1000 },
    });
    expect(scheduleOverride[0].bidEmbeddedAbatementFC).toBeCloseTo(6000, 1);
    expect(scheduleOverride[0].bidEmbeddedAbatementTA).toBeCloseTo(3000, 1);
    expect(scheduleOverride[0].bidEmbeddedAbatementFR).toBeCloseTo(1000, 1);
  });

  it('payments[0].manualFC/TA/FR sobrepõe a distribuição proporcional do lance livre', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidFree: 12000,
      bidTotal: 12000,
    });
    const schedule = generateSchedule(quota, [], {
      0: { manualFC: 9000, manualTA: 2000, manualFR: 1000 },
    });
    expect(schedule[0].bidFreeAbatementFC).toBeCloseTo(9000, 1);
    expect(schedule[0].bidFreeAbatementTA).toBeCloseTo(2000, 1);
    expect(schedule[0].bidFreeAbatementFR).toBeCloseTo(1000, 1);
    expect(schedule[0].bidFreeApplied).toBeCloseTo(12000, 1);
  });

  it('payments[-1].amount sobrepõe o valor de bidEmbedded do contrato (L683)', () => {
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 3,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidEmbedded: 10000,
      bidTotal: 10000,
    });
    // Sem override: bidEmbeddedApplied = 10000 (do contrato)
    const scheduleDefault = generateSchedule(quota);
    expect(scheduleDefault[0].bidEmbeddedApplied).toBeCloseTo(10000, 1);

    // Com override: bidEmbeddedApplied = 8000 (do payments[-1].amount)
    const scheduleOverride = generateSchedule(quota, [], { [-1]: { amount: 8000 } });
    expect(scheduleOverride[0].bidEmbeddedApplied).toBeCloseTo(8000, 1);
    expect(scheduleOverride[0].bidAmountApplied).toBeCloseTo(8000, 1);
  });
});

// ─── calculateScheduleSummary (continuação — bug #005) ────────────────────────
describe('calculateScheduleSummary (continuação)', () => {
  it('lances usam BID_FREE/EMBEDDED_PAYMENT_KEY — constantes exportadas tornam a convenção explícita', () => {
    // A convenção de chaves para lances é exposta via constantes:
    //   BID_FREE_PAYMENT_KEY = 0   (lance livre)
    //   BID_EMBEDDED_PAYMENT_KEY = -1 (lance embutido)
    // Sem pagamento registrado: ambos vão para toPay (correto — ainda não pagos)
    // Com pagamento usando as constantes: vão para paid
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      isContemplated: true,
      contemplationDate: '2020-02-05',
      bidEmbedded: 5000,
      bidFree: 5000,
      bidTotal: 10000,
    });
    const schedule = generateSchedule(quota);
    expect(schedule.find(i => (i.bidAmountApplied ?? 0) > 0)).toBeDefined();

    // Sem pagamento: ambos os lances vão para toPay
    const unpaid = calculateScheduleSummary(quota, schedule, {});
    expect(unpaid.toPay.bidEmbedded).toBeGreaterThan(0);
    expect(unpaid.paid.bidEmbedded).toBe(0);
    expect(unpaid.toPay.bidFree).toBeGreaterThan(0);
    expect(unpaid.paid.bidFree).toBe(0);

    // Com pagamento via constantes exportadas: ambos vão para paid
    const paid = calculateScheduleSummary(quota, schedule, {
      [BID_EMBEDDED_PAYMENT_KEY]: { status: 'PAGO' },
      [BID_FREE_PAYMENT_KEY]: { status: 'PAGO' },
    });
    expect(paid.paid.bidEmbedded).toBeGreaterThan(0);
    expect(paid.toPay.bidEmbedded).toBe(0);
    expect(paid.paid.bidFree).toBeGreaterThan(0);
    expect(paid.toPay.bidFree).toBe(0);
  });
});
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. calculateAverageIndices (Bloco F)
// ═══════════════════════════════════════════════════════════════════════════════

describe('calculateAverageIndices', () => {
  it('sem índices retorna todos os valores de fallback hardcoded', () => {
    // Com lista vazia, o forEach itera todos os tipos e cai no bloco else
    // CDI→0.92, IPCA/IPCA_12→0.45, INCC/INCC_12→0.5, INPC/INPC_12→0.4
    const result = calculateAverageIndices([]);
    expect(result[CorrectionIndex.CDI]).toBe(0.92);
    expect(result[CorrectionIndex.IPCA]).toBe(0.45);
    expect(result[CorrectionIndex.IPCA_12]).toBe(0.45);
    expect(result[CorrectionIndex.INCC]).toBe(0.5);
    expect(result[CorrectionIndex.INCC_12]).toBe(0.5);
    expect(result[CorrectionIndex.INPC]).toBe(0.4);
    expect(result[CorrectionIndex.INPC_12]).toBe(0.4);
  });

  it('índices recentes dentro do período retornam a média correta', () => {
    // Datas de 2024-2025 estão dentro da janela de 36 meses a partir de 2026
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.INCC, date: '2025-06-01', rate: 2.0 },
      { id: '2', type: CorrectionIndex.INCC, date: '2025-05-01', rate: 0.0 }, // rate=0 → excluído
      { id: '3', type: CorrectionIndex.INCC, date: '2025-04-01', rate: 4.0 },
    ];
    const result = calculateAverageIndices(indices, 36);
    // rate=0 excluído → média de [2.0, 4.0] = 3.0
    expect(result[CorrectionIndex.INCC]).toBeCloseTo(3.0, 4);
  });

  it('índice com rate = 0 é excluído do cálculo — tipo sem índices válidos usa fallback', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.IPCA, date: '2025-06-01', rate: 0 },
    ];
    const result = calculateAverageIndices(indices, 36);
    // único índice tem rate=0 → excluído → fallback IPCA = 0.45
    expect(result[CorrectionIndex.IPCA]).toBe(0.45);
  });

  it('periodMonths curto exclui índices mais antigos', () => {
    // periodMonths=12 → startDate ≈ Jun/2025; índice de Jan/2024 fica fora
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.CDI, date: '2025-12-01', rate: 1.0 }, // dentro
      { id: '2', type: CorrectionIndex.CDI, date: '2024-01-01', rate: 9.0 }, // muito antigo
    ];
    const result = calculateAverageIndices(indices, 12);
    // Só o de Dez/2025 conta → média = 1.0
    expect(result[CorrectionIndex.CDI]).toBeCloseTo(1.0, 4);
  });

  it('múltiplos tipos simultâneos: retorna média por tipo independentemente', () => {
    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.INCC, date: '2025-06-01', rate: 1.0 },
      { id: '2', type: CorrectionIndex.INCC, date: '2025-05-01', rate: 3.0 },
      { id: '3', type: CorrectionIndex.CDI,  date: '2025-06-01', rate: 0.8 },
    ];
    const result = calculateAverageIndices(indices, 36);
    expect(result[CorrectionIndex.INCC]).toBeCloseTo(2.0, 4); // (1+3)/2
    expect(result[CorrectionIndex.CDI]).toBeCloseTo(0.8, 4);
    expect(result[CorrectionIndex.IPCA]).toBe(0.45); // fallback (sem dados)
  });

  it('#004 — índice na fronteira exata do período não é descartado por deslocamento UTC (BRT UTC-3)', () => {
    // Configura "agora" como 2024-04-01 00:00 horário local.
    // startDate = new Date() com setMonth(-1) → 2024-03-01 00:00 horário local.
    //
    // Índice com date='2024-03-01':
    //   Bug:  new Date('2024-03-01') = midnight UTC = 2024-02-29 21:00 BRT → < startDate → EXCLUÍDO
    //   Fix:  createLocalDate('2024-03-01') = midnight local → === startDate → INCLUÍDO
    //
    // Nota: este teste detecta o bug apenas em ambientes UTC-3 (BRT).
    // Em UTC os dois caminhos são equivalentes e o teste passa de qualquer forma.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 3, 1, 0, 0, 0)); // 1 Apr 2024 00:00 local

    const indices: MonthlyIndex[] = [
      { id: '1', type: CorrectionIndex.INCC, date: '2024-03-01', rate: 1.23 },
    ];

    const result = calculateAverageIndices(indices, 1);
    vi.useRealTimers();

    // Bug retorna fallback INCC = 0.5 (índice excluído por deslocamento UTC).
    // Fix retorna a taxa real = 1.23 (índice incluído com createLocalDate).
    expect(result[CorrectionIndex.INCC]).toBeCloseTo(1.23, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. generateSchedule — features avançadas (Bloco D)
// ═══════════════════════════════════════════════════════════════════════════════

describe('generateSchedule — features avançadas', () => {
  it('firstAssemblyDate vazio: else block L603 reseta correctionAmountFC a 0 em cada parcela', () => {
    // Sem firstAssemblyDate: o bloco `else` de `if (firstAssemblyDate)` é executado
    // em cada iteração, zerando os campos de correção (bug #002 só aparece quando
    // firstAssemblyDate está presente; sem ele os campos são limpos corretamente)
    const quota = makeQuota({ termMonths: 3, creditValue: 12000, firstAssemblyDate: '' });
    const schedule = generateSchedule(quota);
    expect(schedule).toHaveLength(3);
    schedule.forEach(inst => {
      expect(inst.correctionApplied).toBe(false);
      expect(inst.correctionAmountFC).toBe(0);
    });
  });

  it('projectionConfig.customRate em generateSchedule: correção anual projetada com taxa personalizada', () => {
    // Sem índices INCC reais; projectionConfig.customRate=12 (anual)
    // → monthly = (1.12)^(1/12)-1 ≈ 0.9489%
    // → 12 meses acumulados ≈ 12% → correctedCreditValue ≈ 112000
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, [], {}, undefined, {
      enabled: true,
      customRate: 12,
      periodMonths: 36,
    });
    const inst13 = schedule.find(i => i.installmentNumber === 13);
    expect(inst13?.correctionApplied).toBe(true);
    expect(inst13?.correctedCreditValue).toBeCloseTo(112000, 0);
  });

  it('projectionConfig sem customRate: usa calculateAverageIndices para projetar correção', () => {
    // Com índices INCC recentes (taxa média = 1%), sem customRate
    // → avgIndices calculado via calculateAverageIndices
    // → no aniversário: 12 meses × 1% ≈ correção de 12.68%
    const recentIncc: MonthlyIndex[] = Array.from({ length: 12 }, (_, k) => ({
      id: `r${k}`,
      type: CorrectionIndex.INCC,
      date: `2025-${String(k + 1).padStart(2, '0')}-01`,
      rate: 1.0,
    }));
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, recentIncc, {}, undefined, {
      enabled: true,
      periodMonths: 36,
    });
    const inst13 = schedule.find(i => i.installmentNumber === 13);
    expect(inst13?.correctionApplied).toBe(true);
    expect(inst13?.correctedCreditValue).toBeCloseTo(100000 * Math.pow(1.01, 12), 0);
  });

  it('CalculationMethod.INDEX_TABLE: installmentFC/TA/FR calculados pela tabela de índices', () => {
    const quota = makeQuota({
      creditValue: 100000,
      adminFeeRate: 20,
      reserveFundRate: 5,
      termMonths: 3,
      calculationMethod: CalculationMethod.INDEX_TABLE,
      indexTable: [
        { id: 't1', startInstallment: 1, endInstallment: 3, rateFC: 2.0, rateTA: 0.5, rateFR: 0.1 },
      ],
    });
    const schedule = generateSchedule(quota);
    // installmentFC = min(balanceFC, 2.0% × 100000) = min(100000, 2000) = 2000
    expect(schedule[0].commonFund).toBeCloseTo(2000, 1);
    // installmentTA = min(balanceTA, 0.5% × 100000) = min(20000, 500) = 500
    expect(schedule[0].adminFee).toBeCloseTo(500, 1);
    // installmentFR = min(balanceFR, 0.1% × 100000) = min(5000, 100) = 100
    expect(schedule[0].reserveFund).toBeCloseTo(100, 1);
    // Meses 2 e 3 também usam a tabela
    expect(schedule[1].commonFund).toBeCloseTo(2000, 1);
  });

  it('recalculateBalanceAfterHalfOrContemplation: switch de INDEX_TABLE para linear na segunda metade', () => {
    // termMonths=6 → halfTerm=3
    // Meses 1-3: useIndexTable=true (2% fixo = 2000/mês)
    // Meses 4-6: useIndexTable=false → linear sobre saldo restante
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 6,
      calculationMethod: CalculationMethod.INDEX_TABLE,
      recalculateBalanceAfterHalfOrContemplation: true,
      indexTable: [
        { id: 't1', startInstallment: 1, endInstallment: 6, rateFC: 2.0, rateTA: 0, rateFR: 0 },
      ],
    });
    const schedule = generateSchedule(quota);
    // Primeira metade: 2000 por mês (INDEX_TABLE)
    expect(schedule[0].commonFund).toBeCloseTo(2000, 1);
    expect(schedule[2].commonFund).toBeCloseTo(2000, 1);
    // Saldo após 3 meses = 100000 - 6000 = 94000
    // Segunda metade: linear → 94000/3 ≈ 31333 por mês
    expect(schedule[3].commonFund).toBeGreaterThan(10000);
    expect(schedule[3].commonFund).toBeCloseTo(94000 / 3, 0);
  });

  it('INCC_12 + indexReferenceMonth no loop: cobre L511-514 (ref. month) e L525-537 (isAnnual)', () => {
    // correctionIndex = INCC_12 → isAnnual = true → percorre L525-537 em vez do loop mensal
    // indexReferenceMonth = 10 (Outubro):
    //   targetMonth = 9; anniversary month = 1 (Fev); 9 >= 1 → targetYear = 2020
    //   indexEndDate = Out/2020 → busca '2020-10-01' (L511-514)
    // Índice encontrado (rate=8%) → accumulatedMultiplier = 1.08 → correção de 8%
    const quota = makeQuota({
      creditValue: 100000,
      termMonths: 24,
      correctionIndex: CorrectionIndex.INCC_12,
      indexReferenceMonth: 10,
    });
    const indices: MonthlyIndex[] = [
      { id: 'a', type: CorrectionIndex.INCC_12, date: '2020-10-01', rate: 8.0 },
    ];
    const schedule = generateSchedule(quota, indices);
    const inst13 = schedule.find(i => i.installmentNumber === 13);
    expect(inst13?.correctionApplied).toBe(true);
    expect(inst13?.correctedCreditValue).toBeCloseTo(108000, 2);
  });

  it('correctionAmountFC/TA/FR zerados em meses não-aniversário — não vazam do mês de reajuste', () => {
    // firstAssemblyDate = '2020-02-05' (default), termMonths = 24
    // Aniversário: mês 13 (Feb/2021) — INCC 1%/mês × 12 meses → deltaFC ≈ 12682
    // Bug #002: meses 14-24 retornam correctionAmountFC ≈ 12682 (deveria ser 0)
    const quota = makeQuota({ creditValue: 100000, termMonths: 24 });
    const schedule = generateSchedule(quota, makeInccIndices(1.0));

    expect(schedule[12].correctionApplied).toBe(true);
    expect(schedule[12].correctionAmountFC).toBeGreaterThan(0);

    expect(schedule[13].correctionApplied).toBe(false);
    expect(schedule[13].correctionAmountFC).toBe(0); // bug: retorna delta do mês 13
  });
});
