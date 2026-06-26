import { z } from 'zod';
import { ProductType, CorrectionIndex, PaymentPlanType, CalculationMethod, BidBaseType } from '../types';

export const quotaFormSchema = z.object({
  // Identificação
  group: z.string().min(1, 'Grupo é obrigatório'),
  quotaNumber: z.string().min(1, 'Número da cota é obrigatório'),

  // Datas
  firstDueDate: z.string().min(1, '1º vencimento é obrigatório'),

  // Financeiro
  creditValue: z
    .number({ error: 'Valor da carta é obrigatório' })
    .positive('Valor da carta deve ser maior que zero'),
  termMonths: z
    .number({ error: 'Prazo é obrigatório' })
    .int('Prazo deve ser um número inteiro')
    .min(1, 'Prazo mínimo é 1 mês')
    .max(360, 'Prazo máximo é 360 meses'),
  adminFeeRate: z
    .number({ error: 'Taxa de administração é obrigatória' })
    .min(0, 'Taxa não pode ser negativa')
    .max(30, 'Taxa de administração inválida (máx 30%)'),
  reserveFundRate: z
    .number({ error: 'Fundo de reserva é obrigatório' })
    .min(0, 'Taxa não pode ser negativa')
    .max(10, 'Fundo de reserva inválido (máx 10%)'),
  dueDay: z
    .number({ error: 'Dia de vencimento é obrigatório' })
    .int()
    .min(1, 'Dia inválido')
    .max(31, 'Dia inválido'),
  indexReferenceMonth: z
    .number()
    .int()
    .min(1, 'Mês de referência inválido')
    .max(12, 'Mês de referência inválido'),

  // Lances
  bidFree: z.number().min(0, 'Lance livre não pode ser negativo').default(0),
  bidEmbedded: z.number().min(0, 'Lance embutido não pode ser negativo').default(0),

  // Enums
  productType: z.nativeEnum(ProductType),
  correctionIndex: z.nativeEnum(CorrectionIndex),
  paymentPlan: z.nativeEnum(PaymentPlanType),
  calculationMethod: z.nativeEnum(CalculationMethod),
  bidBase: z.nativeEnum(BidBaseType).optional(),

  // Contemplação
  isContemplated: z.boolean(),
  contemplationDate: z.string().nullish(),

  // Transferência
  acquiredFromThirdParty: z.boolean().default(false),
  assumedInstallment: z.number().int().min(1).optional(),
  prePaidFCPercent: z.number().min(0).optional(),
  acquisitionCost: z.number().min(0).optional(),
}).superRefine((data, ctx) => {
  if (data.isContemplated && !data.contemplationDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Data de contemplação é obrigatória',
      path: ['contemplationDate'],
    });
  }
  if (data.bidFree > 0 && data.bidFree > data.creditValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Lance livre não pode ser maior que o valor da carta',
      path: ['bidFree'],
    });
  }
  if (data.acquiredFromThirdParty) {
    if (!data.assumedInstallment || data.assumedInstallment < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Parcela inicial é obrigatória para cotas de terceiros',
        path: ['assumedInstallment'],
      });
    }
    if (data.prePaidFCPercent === undefined || data.prePaidFCPercent === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '% Fundo Comum é obrigatório para cotas de terceiros',
        path: ['prePaidFCPercent'],
      });
    }
  }
});

export type QuotaFormErrors = Partial<Record<string, string>>;

export function parseQuotaForm(data: unknown): { success: true } | { success: false; errors: QuotaFormErrors } {
  const result = quotaFormSchema.safeParse(data);
  if (result.success) return { success: true };

  const errors: QuotaFormErrors = {};
  result.error.issues.forEach(err => {
    const field = err.path[0] as string;
    if (field && !errors[field]) {
      errors[field] = err.message;
    }
  });
  return { success: false, errors };
}
