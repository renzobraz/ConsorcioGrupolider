
export enum ProductType {
  VEHICLE = 'VEICULO',
  REAL_ESTATE = 'IMOVEL'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export interface UserPermissions {
  canViewDashboard: boolean;
  canManageQuotas: boolean;
  canSimulate: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  canMarkQuotas: boolean;
  allowedCompanyIds?: string[];
}

export interface User {
  id: string;
  email: string;
  name: string;
  password?: string;
  role: UserRole;
  permissions: UserPermissions;
  isActive: boolean;
}

export enum CorrectionIndex {
  INCC = 'INCC',
  IPCA = 'IPCA',
  INPC = 'INPC',
  CDI = 'CDI',
  INCC_12 = 'INCC_12', // Acumulado 12 meses
  IPCA_12 = 'IPCA_12',  // Acumulado 12 meses
  INPC_12 = 'INPC_12'   // Acumulado 12 meses
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

export enum CalculationMethod {
  LINEAR = 'LINEAR',
  INDEX_TABLE = 'TABELA_INDICES',
  INDEX_TABLE_REDUCED = 'TABELA_INDICES_REDUZIDA'
}

export interface IndexTableEntry {
  id: string;
  startInstallment: number;
  endInstallment: number;
  rateFC: number; // %
  rateTA: number; // %
  rateFR: number; // %
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

export enum ManualTransactionType {
  EARNING = 'RENDIMENTO',
  EXTRA_PAYMENT = 'PAGAMENTO_EXTRA'
}

export interface ManualTransaction {
  id: string;
  quotaId: string;
  date: string;
  amount: number;
  type: ManualTransactionType;
  description: string;
  fc?: number;
  fr?: number;
  ta?: number;
  insurance?: number;
  amortization?: number;
  fine?: number;
  interest?: number;
}

export interface CreditUpdate {
  id: string;
  quotaId: string;
  date: string;
  value: number;
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

  // New Calculation Methods
  calculationMethod?: CalculationMethod;
  indexTable?: IndexTableEntry[];
  recalculateBalanceAfterHalfOrContemplation?: boolean;
  anticipateCorrectionMonth?: boolean;
  prioritizeFeesInBid?: boolean;
  
  // Third-party acquisition
  acquiredFromThirdParty?: boolean;
  assumedInstallment?: number;
  prePaidFCPercent?: number;
  acquisitionCost?: number;
  
  // Correction Cap
  correctionRateCap?: number; // Teto de Reajuste Anual (%)
  
  // Index Reference
  indexReferenceMonth?: number; // Mês de referência do índice (1-12)

  // Manual Transactions
  manualTransactions?: ManualTransaction[];
  creditUpdates?: CreditUpdate[];
  isDrawContemplation?: boolean;
  stopCreditCorrection?: boolean; // NOVO: Interromper reajuste anual após contemplação
  contractFileUrl?: string; // URL do contrato arquivado

  // Marketplace / SaaS Fields
  isAnnounced?: boolean;
  announcedAt?: string;
  marketValueOverride?: number;
  marketStatus?: 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'SOLD';
  marketNotes?: string;
  
  // New Financial Fields for Marketplace Transparency
  reserveFundAccumulated?: number; // Valor acumulado no Fundo de Reserva (conforme extrato)
  insuranceRate?: number; // Taxa de Seguro (%)
  insuranceValue?: number; // Valor fixo de Seguro (se houver)
}

export enum PaymentStatus {
  PREVISTO = 'PREVISTO',
  PAGO = 'PAGO',
  CONCILIADO = 'CONCILIADO',
  EFETIVADO = 'EFETIVADO',
  QUITADO = 'QUITADO'
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
  insurance: number;
  amortization: number;
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

  // Balances after Bid
  bidEmbeddedBalanceBeforeFC?: number;
  bidEmbeddedBalanceBeforeTA?: number;
  bidEmbeddedBalanceBeforeFR?: number;
  bidEmbeddedBalanceBeforeTotal?: number;
  bidEmbeddedPercentBalanceBeforeFC?: number;
  bidEmbeddedPercentBalanceBeforeTA?: number;
  bidEmbeddedPercentBalanceBeforeFR?: number;
  bidEmbeddedPercentBalanceBeforeTotal?: number;

  bidEmbeddedBalanceFC?: number;
  bidEmbeddedBalanceTA?: number;
  bidEmbeddedBalanceFR?: number;
  bidEmbeddedBalanceTotal?: number;
  bidEmbeddedPercentBalanceFC?: number;
  bidEmbeddedPercentBalanceTA?: number;
  bidEmbeddedPercentBalanceFR?: number;
  bidEmbeddedPercentBalanceTotal?: number;

  bidFreeBalanceBeforeFC?: number;
  bidFreeBalanceBeforeTA?: number;
  bidFreeBalanceBeforeFR?: number;
  bidFreeBalanceBeforeTotal?: number;
  bidFreePercentBalanceBeforeFC?: number;
  bidFreePercentBalanceBeforeTA?: number;
  bidFreePercentBalanceBeforeFR?: number;
  bidFreePercentBalanceBeforeTotal?: number;

  bidFreeBalanceFC?: number;
  bidFreeBalanceTA?: number;
  bidFreeBalanceFR?: number;
  bidFreeBalanceTotal?: number;
  bidFreePercentBalanceFC?: number;
  bidFreePercentBalanceTA?: number;
  bidFreePercentBalanceFR?: number;
  bidFreePercentBalanceTotal?: number;

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
  correctionCapApplied?: boolean;
  correctionRealRate?: number;

  // Balances after Correction
  correctionBalanceFC?: number;
  correctionBalanceTA?: number;
  correctionBalanceFR?: number;
  correctionBalanceTotal?: number;
  correctionPercentBalanceFC?: number;
  correctionPercentBalanceTA?: number;
  correctionPercentBalanceFR?: number;
  correctionPercentBalanceTotal?: number;
  
  // Correction Deltas (Absolute values of the adjustment)
  correctionAmountFC?: number;
  correctionAmountTA?: number;
  correctionAmountFR?: number;
  correctionAmountTotal?: number;

  // User Input / Overrides
  realAmountPaid: number | null; 
  isPaid: boolean;
  status?: PaymentStatus;
  paymentDate?: string | null;
  manualFC?: number | null; 
  manualFR?: number | null; 
  manualTA?: number | null; 
  manualFine?: number | null; 
  manualInterest?: number | null; 
  manualInsurance?: number | null;
  manualAmortization?: number | null;
  manualEarnings?: number | null;
  
  // Manual Transaction Info
  isManualTransaction?: boolean;
  manualTransactionId?: string;
  manualTransactionType?: ManualTransactionType;
  manualTransactionDescription?: string;
  
  tag?: string;
}

export interface CreditUsageEntry {
  id: string;
  quotaId: string;
  description: string;
  date: string;
  amount: number;
  seller?: string; 
}

export interface SMTPConfig {
  id?: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  reportRecipient: string;
}

export enum ReportFrequency {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY'
}

export interface ScheduledReport {
  id: string;
  name: string;
  recipient: string;
  subject: string;
  message: string;
  frequency: ReportFrequency;
  selectedColumns: string[];
  filters: {
    referenceDate: string;
    companyId?: string;
    administratorId?: string;
    productType?: string;
    status?: string;
  };
  lastSent?: string;
  isActive: boolean;
  createdAt: string;
}
