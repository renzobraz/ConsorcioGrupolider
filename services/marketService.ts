
import { Quota, ProductType, MonthlyIndex } from '../types';
import { calculateCurrentCreditValue } from './calculationService';

export interface MarketAnalysis {
  investedAmount: number; // Total pago até agora (Parcelas + Lances)
  debtBalance: number;
  currentCreditValue: number; // Crédito Bruto Atualizado
  availableCredit: number; // Crédito Total Disponível (Bruto - Embutido + Aplicação - Utilizado)
  suggestedAgioPercent: number;
  suggestedMarketValue: number;
  estimatedProfit: number;
  agioValue: number;
  
  // Fintech Simulation
  platformFee: number;
  sellerNetPayout: number;
  buyerEntry: number; // Ágio + Taxas
  
  // X-Ray Analysis
  cet: number; // Custo Efetivo Total Anualizado (%)
  futureRefund: number; // Devolução estimada do Fundo de Reserva
  totalQuotaCost: number; // Custo total para o comprador (Entrada + Parcelas - Devolução)
  bankFinancingCost: number; // Custo total se fosse um financiamento bancário
  realSavings: number; // Economia Real (Financiamento - Quota)
  isLowCET: boolean;
  isHighReserveFund: boolean;
  remainingInstallments: number;
  currentInstallmentValue: number;
  totalInstallments: number;
  adminFeeRate: number;
  reserveFundRate: number;
}

export const calculateMarketAnalysis = (
  quota: Quota, 
  indices: MonthlyIndex[], 
  paidAmount: number, 
  debtBalance: number,
  customAgio?: number, // Ágio definido pelo vendedor
  creditManualAdjustment: number = 0,
  creditUsages: number = 0,
  remainingInstallments: number = 0,
  currentInstallmentValue: number = 0
): MarketAnalysis => {
  const currentCreditValue = calculateCurrentCreditValue(quota, indices);
  
  // Crédito Total Disponível conforme regra do relatório:
  // (Crédito Bruto) - (Lance Embutido) + (Aplicação Financeira) - (Crédito Utilizado)
  const availableCredit = (currentCreditValue - (quota.bidEmbedded || 0)) + creditManualAdjustment - creditUsages;

  const platformFeeRate = 0.05; // 5% de comissão fixa da plataforma
  
  let agioValue = customAgio || 0;
  
  if (!customAgio) {
    if (quota.isContemplated) {
      const suggestedAgioPercent = quota.productType === ProductType.REAL_ESTATE ? 0.15 : 0.10;
      agioValue = availableCredit * suggestedAgioPercent;
    } else {
      agioValue = -(paidAmount * 0.20); // Deságio de 20%
    }
  }

  const platformFee = Math.abs(agioValue) * platformFeeRate;
  const sellerNetPayout = agioValue - platformFee;
  const buyerEntry = paidAmount + agioValue + platformFee;

  // X-Ray Calculations
  // 1. Future Refund (Estimativa do Fundo de Reserva)
  const futureRefund = (quota.reserveFundRate / 100) * currentCreditValue;
  
  // 2. Total Quota Cost (Custo para o Comprador)
  const totalQuotaCost = buyerEntry + debtBalance - futureRefund;

  // 3. Bank Financing Simulation (Simplificada)
  const annualBankRate = quota.productType === ProductType.REAL_ESTATE ? 0.10 : 0.20;
  const monthlyBankRate = Math.pow(1 + annualBankRate, 1/12) - 1;
  
  // PV = availableCredit (O que o comprador realmente terá disponível)
  const pmt = (availableCredit * monthlyBankRate) / (1 - Math.pow(1 + monthlyBankRate, -quota.termMonths));
  const bankFinancingCost = pmt * quota.termMonths;

  // 4. Real Savings
  const realSavings = bankFinancingCost - totalQuotaCost;

  // 5. CET (Custo Efetivo Total) - Aproximação
  // PV = availableCredit
  const totalRate = totalQuotaCost / availableCredit;
  const cet = (Math.pow(totalRate, 12 / quota.termMonths) - 1) * 100;

  // 6. Badges Logic
  const isLowCET = cet < (annualBankRate * 100 * 0.5); 
  const isHighReserveFund = (quota.reserveFundRate >= 3); 

  return {
    investedAmount: paidAmount,
    debtBalance,
    currentCreditValue,
    availableCredit,
    suggestedAgioPercent: (agioValue / availableCredit),
    suggestedMarketValue: paidAmount + agioValue,
    estimatedProfit: agioValue,
    agioValue,
    platformFee,
    sellerNetPayout,
    buyerEntry,
    cet,
    futureRefund,
    totalQuotaCost,
    bankFinancingCost,
    realSavings,
    isLowCET,
    isHighReserveFund,
    remainingInstallments,
    currentInstallmentValue,
    totalInstallments: quota.termMonths,
    adminFeeRate: quota.adminFeeRate,
    reserveFundRate: quota.reserveFundRate
  };
};

export const announceToMarketplace = async (quotaId: string, marketValue: number, notes?: string) => {
  // In a real app, this would call an API. 
  // For now, we'll update the local state/DB via the context/database service.
  console.log(`Announcing quota ${quotaId} to marketplace for ${marketValue}`);
  return { success: true, message: 'Cota enviada para aprovação do administrador.' };
};
