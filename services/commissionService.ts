
export interface SettlementBreakdown {
  agioValue: number;
  commissionPercent: number;
  commissionValue: number;
  gatewayFees: number;
  sellerNetValue: number;
  platformNetValue: number;
  minCommissionApplied: boolean;
}

export const COMMISSION_CONFIG = {
  PERCENT: 0.05, // 5%
  MIN_VALUE: 1500, // R$ 1.500,00
  GATEWAY_FIXED: 0.99, // R$ 0,99 por PIX
  GATEWAY_PERCENT: 0.01, // 1% de taxa de processamento
  REFUND_ADMIN_FEE: 250, // Taxa administrativa em caso de estorno
  TRANSFER_DEADLINE_DAYS: 5
};

export const calculateSettlement = (agioValue: number): SettlementBreakdown => {
  // 1. Calcular Comissão Base
  let commissionValue = agioValue * COMMISSION_CONFIG.PERCENT;
  let minCommissionApplied = false;

  // 2. Aplicar Valor Mínimo
  if (commissionValue < COMMISSION_CONFIG.MIN_VALUE) {
    commissionValue = COMMISSION_CONFIG.MIN_VALUE;
    minCommissionApplied = true;
  }

  // 3. Calcular Taxas de Gateway (Simulação)
  const gatewayFees = (agioValue * COMMISSION_CONFIG.GATEWAY_PERCENT) + COMMISSION_CONFIG.GATEWAY_FIXED;

  // 4. Liquidação (Split)
  const sellerNetValue = agioValue - commissionValue;
  const platformNetValue = commissionValue - gatewayFees;

  return {
    agioValue,
    commissionPercent: COMMISSION_CONFIG.PERCENT * 100,
    commissionValue,
    gatewayFees,
    sellerNetValue,
    platformNetValue,
    minCommissionApplied
  };
};

export const getRefundAmount = (agioValue: number): number => {
  return agioValue - COMMISSION_CONFIG.REFUND_ADMIN_FEE;
};
