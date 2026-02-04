
export enum ProductType {
  VEHICLE = 'VEICULO',
  REAL_ESTATE = 'IMOVEL'
}

export enum CorrectionIndex {
  INCC = 'INCC',
  IPCA = 'IPCA',
  CDI = 'CDI',
  INCC_12 = 'INCC_12', // Acumulado 12 meses
  IPCA_12 = 'IPCA_12'  // Acumulado 12 meses
}

export enum PaymentPlanType {
  NORMAL = 'NORMAL',
  REDUZIDA = 'REDUZIDA',
  SEMESTRAL = 'SEMESTRAL'
}

export enum BidBaseType {
  CREDIT_ONLY = 'CREDITO',      // Percentual sobre o Valor da Carta
  TOTAL_PROJECT = 'TOTAL'      // Percentual sobre o Valor Total (Crédito + Taxas)
}

export interface MonthlyIndex {
  id: string;
  type: CorrectionIndex;
  date: string; // YYYY-MM-01 format
  rate: number; // Percentage (e.g., 0.5 for 0.5%)
}

export interface Administrator {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Company {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Quota {
  id: string;
  group: string;
  quotaNumber: string;
  contractNumber: string;
  creditValue: number;
  adhesionDate: string;
  firstAssemblyDate: string;
  termMonths: number;
  adminFeeRate: number; // Taxa Adm (TA) in %
  reserveFundRate: number; // Fundo Reserva (FR) in %
  productType: ProductType;
  firstDueDate: string;
  dueDay?: number; // NOVO: Dia de vencimento fixo (ex: 25)
  correctionIndex: CorrectionIndex;
  paymentPlan: PaymentPlanType;
  
  // Relations
  administratorId?: string; // ID da Administradora
  companyId?: string;       // ID da Empresa Compradora

  // Contemplation & Bids
  isContemplated: boolean;
  contemplationDate?: string;
  bidFree?: number;      // Lance Livre
  bidEmbedded?: number;  // Lance Embutido
  bidTotal?: number;     // Valor Total (Soma)
  bidBase?: BidBaseType; // NOVO: Base de cálculo do percentual do lance

  // Manual Adjustments for Reports
  creditManualAdjustment?: number; // Atualização Credito (Valor digitado)
  bidFreeCorrection?: number; // Correção 92% CDI
}

export interface PaymentInstallment {
  installmentNumber: number;
  dueDate: string;
  
  // Monthly Composition
  commonFund: number; // Fundo Comum (FC)
  monthlyRateFC?: number; // The percentage applied for FC this month
  reserveFund: number; // FR Mensal
  monthlyRateFR?: number; 
  adminFee: number; // TA Mensal
  monthlyRateTA?: number; 
  totalInstallment: number; // Total
  
  // Balances (Saldo Devedor)
  balanceFC: number;
  balanceFR: number;
  balanceTA: number;
  balanceTotal: number;
  
  // Percentages of Balance
  percentBalanceFC: number;
  percentBalanceFR: number;
  percentBalanceTA: number;
  percentBalanceTotal: number;
  
  // Bid Event
  bidAmountApplied?: number; 
  bidDate?: string; 
  bidCalcBaseUsed?: number; 
  
  // Bid Breakdown
  bidEmbeddedApplied?: number; 
  bidEmbeddedPercent?: number; 
  bidEmbeddedAbatementFC?: number; 
  bidEmbeddedPercentFC?: number; 
  bidEmbeddedAbatementFR?: number; 
  bidEmbeddedPercentFR?: number; 
  bidEmbeddedAbatementTA?: number; 
  bidEmbeddedPercentTA?: number; 
  
  bidFreeApplied?: number; 
  bidFreePercent?: number; 
  bidFreeAbatementFC?: number;
  bidFreePercentFC?: number; 
  bidFreeAbatementFR?: number;
  bidFreePercentFR?: number; 
  bidFreeAbatementTA?: number;
  bidFreePercentTA?: number; 

  bidAbatementFC?: number;
  bidAbatementFR?: number;
  bidAbatementTA?: number;

  // Correction Event
  correctionApplied?: boolean;
  correctionFactor?: number; 
  correctedCreditValue?: number; 
  correctionIndexName?: string; 
  correctionStartDate?: string; 
  correctionEndDate?: string; 

  // User Input / Overrides
  realAmountPaid: number | null; 
  isPaid: boolean;
  manualFC?: number | null; 
  manualFR?: number | null; 
  manualTA?: number | null; 
  manualFine?: number | null; 
  manualInterest?: number | null; 
}

export interface CreditUsageEntry {
  id: string;
  quotaId: string;
  description: string;
  date: string;
  amount: number;
  seller?: string; 
}
