
import { Quota, MonthlyIndex, Administrator, Company, CreditUsageEntry, User, CalculationMethod, ManualTransaction, CreditUpdate, SMTPConfig } from '../types';
import { getSupabase } from './supabaseClient';

const DB_KEY = 'consortium_quotas_db';
const PAYMENTS_KEY_PREFIX = 'payments_';
const INDICES_KEY = 'consortium_indices_db';
const ADMINS_KEY = 'consortium_admins_db';
const COMPANIES_KEY = 'consortium_companies_db';
const CREDIT_USAGES_KEY = 'consortium_credit_usages_db';
const CREDIT_UPDATES_KEY = 'consortium_credit_updates_db';
const MANUAL_TRANSACTIONS_KEY = 'consortium_manual_transactions_db';
const USERS_KEY = 'consortium_users_db';
const SMTP_CONFIG_KEY = 'consortium_smtp_config_db';

const toDbUser = (u: User) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  password: u.password,
  role: u.role,
  permissions: u.permissions,
  is_active: u.isActive
});

const fromDbUser = (dbU: any): User => ({
  id: dbU.id,
  email: dbU.email,
  name: dbU.name,
  password: dbU.password,
  role: dbU.role,
  permissions: dbU.permissions,
  isActive: dbU.is_active
});

const toDbQuota = (q: Quota) => ({
  id: q.id,
  group_code: q.group,
  quota_number: q.quotaNumber,
  contract_number: q.contractNumber,
  credit_value: q.creditValue, // Corrigido de credit_value para creditValue
  adhesion_date: q.adhesionDate || null,
  first_assembly_date: q.firstAssemblyDate || null,
  term_months: q.termMonths,
  admin_fee_rate: q.adminFeeRate,
  reserve_fund_rate: q.reserveFundRate,
  product_type: q.productType,
  due_day: q.dueDay || 25,
  first_due_date: q.firstDueDate || null,
  correction_index: q.correctionIndex,
  payment_plan: q.paymentPlan,
  is_contemplated: q.isContemplated,
  contemplation_date: q.contemplationDate || null,
  bid_free: q.bidFree,
  bid_embedded: q.bidEmbedded,
  bid_total: q.bidTotal,
  credit_manual_adjustment: q.creditManualAdjustment || 0,
  administrator_id: q.administratorId || null,
  company_id: q.companyId || null,
  bid_free_correction: q.bidFreeCorrection || 0,
  calculation_method: q.recalculateBalanceAfterHalfOrContemplation ? 'TABELA_INDICES_REDUZIDA' : (q.calculationMethod || 'LINEAR'),
  index_table: q.indexTable || null,
  acquired_from_third_party: q.acquiredFromThirdParty || false,
  assumed_installment: q.assumedInstallment || null,
  pre_paid_fc_percent: q.prePaidFCPercent || null,
  acquisition_cost: q.acquisitionCost || null,
  correction_rate_cap: q.correctionRateCap || null,
  index_reference_month: q.indexReferenceMonth || null,
  bid_base: q.bidBase || null,
  anticipate_correction_month: q.anticipateCorrectionMonth || false,
  prioritize_fees_in_bid: q.prioritizeFeesInBid || false,
  is_draw_contemplation: q.isDrawContemplation || false,
  contract_file_url: q.contractFileUrl || null,
  is_announced: q.isAnnounced || false,
  announced_at: q.announcedAt || null,
  market_value_override: q.marketValueOverride || null,
  market_status: q.marketStatus || 'DRAFT',
  market_notes: q.marketNotes || null
});

const fromDbQuota = (dbQ: any): Quota => ({
  id: dbQ.id,
  group: dbQ.group_code,
  quotaNumber: dbQ.quota_number,
  contractNumber: dbQ.contract_number,
  creditValue: Number(dbQ.credit_value),
  adhesionDate: dbQ.adhesion_date,
  firstAssemblyDate: dbQ.first_assembly_date,
  termMonths: Number(dbQ.term_months),
  adminFeeRate: Number(dbQ.admin_fee_rate),
  reserveFundRate: Number(dbQ.reserve_fund_rate),
  productType: dbQ.product_type,
  dueDay: Number(dbQ.due_day || 25),
  firstDueDate: dbQ.first_due_date,
  correctionIndex: dbQ.correction_index,
  paymentPlan: dbQ.payment_plan,
  isContemplated: dbQ.is_contemplated,
  contemplationDate: dbQ.contemplation_date,
  bidFree: Number(dbQ.bid_free),
  bidEmbedded: Number(dbQ.bid_embedded),
  bidTotal: Number(dbQ.bid_total),
  creditManualAdjustment: Number(dbQ.credit_manual_adjustment || 0),
  administratorId: dbQ.administrator_id,
  companyId: dbQ.company_id,
  bidFreeCorrection: Number(dbQ.bid_free_correction || 0),
  calculationMethod: (dbQ.calculation_method === 'TABELA_INDICES_REDUZIDA' ? 'TABELA_INDICES' : (dbQ.calculation_method || 'LINEAR')) as CalculationMethod,
  indexTable: dbQ.index_table ? (typeof dbQ.index_table === 'string' ? JSON.parse(dbQ.index_table) : dbQ.index_table) : undefined,
  acquiredFromThirdParty: dbQ.acquired_from_third_party || false,
  assumedInstallment: dbQ.assumed_installment ? Number(dbQ.assumed_installment) : undefined,
  prePaidFCPercent: dbQ.pre_paid_fc_percent ? Number(dbQ.pre_paid_fc_percent) : undefined,
  acquisitionCost: dbQ.acquisition_cost ? Number(dbQ.acquisition_cost) : undefined,
  correctionRateCap: dbQ.correction_rate_cap ? Number(dbQ.correction_rate_cap) : undefined,
  indexReferenceMonth: dbQ.index_reference_month ? Number(dbQ.index_reference_month) : undefined,
  recalculateBalanceAfterHalfOrContemplation: dbQ.calculation_method === 'TABELA_INDICES_REDUZIDA',
  bidBase: dbQ.bid_base,
  anticipateCorrectionMonth: dbQ.anticipate_correction_month || false,
  prioritizeFeesInBid: dbQ.prioritize_fees_in_bid || false,
  isDrawContemplation: dbQ.is_draw_contemplation || false,
  contractFileUrl: dbQ.contract_file_url,
  isAnnounced: dbQ.is_announced || false,
  announcedAt: dbQ.announced_at,
  marketValueOverride: dbQ.market_value_override ? Number(dbQ.market_value_override) : undefined,
  marketStatus: dbQ.market_status as any,
  marketNotes: dbQ.market_notes
});

export const uploadContractFile = async (file: File, quotaId: string): Promise<string | null> => {
  const supabase = getSupabase();
  if (!supabase) return null;

  const fileExt = file.name.split('.').pop();
  const fileName = `${quotaId}_${Date.now()}.${fileExt}`;
  const filePath = `contracts/${fileName}`;

  // Tenta primeiro 'contracts' (padrão), depois 'Contratos' (comum em PT)
  let bucketName = 'contracts';
  let { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file);

  if (error && (error.message.includes('not found') || error.message.includes('bucket'))) {
    bucketName = 'Contratos';
    const retry = await supabase.storage
      .from(bucketName)
      .upload(filePath, file);
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    console.error('Error uploading file:', error.message);
    if (error.message.includes('not found')) {
      alert(`Erro: O bucket de armazenamento '${bucketName}' não foi encontrado no Supabase. Por favor, crie um bucket chamado 'contracts' no Storage do Supabase e marque como 'Public'.`);
    }
    return null;
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return publicUrl;
};

export const db = {
  isCloudEnabled: () => !!getSupabase(),

  checkColumnExists: async (tableName: string, columnName: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return true;
    try {
      const { error } = await supabase.from(tableName).select(columnName).limit(1);
      if (error) {
        // PGRST204 is "Column not found"
        if (error.code === 'PGRST204' || error.message.toLowerCase().includes('column') || error.message.toLowerCase().includes('does not exist')) {
          return false;
        }
        // Se for erro de permissão (403), a coluna provavelmente existe mas o RLS bloqueia o select
        if (error.code === '42501' || error.message.toLowerCase().includes('permission denied') || error.message.toLowerCase().includes('forbidden')) {
          return true;
        }
      }
      return true;
    } catch (err) {
      return false;
    }
  },

  checkTableExists: async (tableName: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return true;
    try {
      const { error } = await supabase.from(tableName).select('*').limit(1);
      if (error) {
        // PGRST204 is "Relation not found"
        if (error.code === 'PGRST204' || error.message.toLowerCase().includes('relation') || error.message.toLowerCase().includes('does not exist')) {
          return false;
        }
        // Se for erro de permissão (403), a tabela provavelmente existe mas o RLS bloqueia o select
        if (error.code === '42501' || error.message.toLowerCase().includes('permission denied') || error.message.toLowerCase().includes('forbidden')) {
          return true;
        }
      }
      return true;
    } catch (err) {
      return false;
    }
  },

  checkBucketExists: async (bucketName: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return true;
    try {
      // Tenta listar arquivos no bucket (mesmo que vazio) com limite 1
      // Isso é mais confiável para detectar existência sem precisar de permissão de leitura de metadados do bucket
      const { error } = await supabase.storage.from(bucketName).list('', { limit: 1 });
      
      if (error) {
        // Se o erro for explicitamente "not found", o bucket realmente não existe
        const msg = error.message.toLowerCase();
        if (msg.includes('not found') || msg.includes('does not exist')) {
          // Tenta o nome em português como fallback
          if (bucketName === 'contracts') {
            const { error: errorPt } = await supabase.storage.from('Contratos').list('', { limit: 1 });
            if (!errorPt || (!errorPt.message.toLowerCase().includes('not found') && !errorPt.message.toLowerCase().includes('does not exist'))) {
              return true;
            }
          }
          return false;
        }
        // Se for qualquer outro erro (como 403 Forbidden), assumimos que o bucket existe 
        // mas a chave anon não tem permissão para listar (o que é comum se não houver políticas de RLS)
        return true;
      }
      
      // Se não houve erro, o bucket existe
      return true;
    } catch (err) {
      // Em caso de exceção crítica, retornamos false para segurança, 
      // mas o list() acima já deve cobrir a maioria dos casos
      return false;
    }
  },

  getQuotas: async (): Promise<Quota[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('quotas')
            .select('*')
            .range(from, from + pageSize - 1);
          
          if (error) throw new Error(error.message);
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < pageSize) hasMore = false;
            else from += pageSize;
          } else {
            hasMore = false;
          }
        }
        return allData.map(fromDbQuota);
      } catch (err: any) { throw err; }
    } else {
      const data = localStorage.getItem(DB_KEY);
      return data ? JSON.parse(data) : [];
    }
  },

  saveQuota: async (quota: Quota): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('quotas').upsert(toDbQuota(quota));
      if (error) throw new Error(error.message);
    } else {
      const quotas = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
      const existingIndex = quotas.findIndex((q: Quota) => q.id === quota.id);
      if (existingIndex >= 0) quotas[existingIndex] = quota;
      else quotas.push(quota);
      localStorage.setItem(DB_KEY, JSON.stringify(quotas));
    }
  },

  deleteQuota: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      // Deletar dados relacionados explicitamente se não houver cascade no banco
      await supabase.from('payments').delete().eq('quota_id', id);
      await supabase.from('manual_transactions').delete().eq('quota_id', id);
      await supabase.from('credit_usages').delete().eq('quota_id', id);
      await supabase.from('quotas').delete().eq('id', id);
    } else {
      const quotas = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
      localStorage.setItem(DB_KEY, JSON.stringify(quotas.filter((q: Quota) => q.id !== id)));
      localStorage.removeItem(`${PAYMENTS_KEY_PREFIX}${id}`);
      
      const manualTxs = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
      localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(manualTxs.filter((t: any) => t.quotaId !== id)));
      
      const creditUsages = JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]');
      localStorage.setItem(CREDIT_USAGES_KEY, JSON.stringify(creditUsages.filter((u: any) => u.quotaId !== id)));
    }
  },

  getPayments: async (quotaId: string): Promise<Record<number, any>> => {
    const supabase = getSupabase();
    if (supabase) {
        try {
          const { data, error } = await supabase.from('payments').select('*').eq('quota_id', quotaId);
          if (error) throw error;
          const paymentMap: Record<number, any> = {};
          (data || []).forEach((p: any) => {
            paymentMap[p.installment_number] = {
               amount: p.amount_paid !== null ? Number(p.amount_paid) : undefined,
               manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
               manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
               manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
               manualFine: p.manual_fine !== null ? Number(p.manual_fine) : undefined,
               manualInterest: p.manual_interest !== null ? Number(p.manual_interest) : undefined,
               manualInsurance: p.manual_insurance !== null ? Number(p.manual_insurance) : undefined,
               manualAmortization: p.manual_amortization !== null ? Number(p.manual_amortization) : undefined,
               manualEarnings: p.manual_earnings !== null ? Number(p.manual_earnings) : undefined,
               status: (p.status && p.status.trim() !== '') ? p.status.trim().toUpperCase() : (Number(p.amount_paid) > 0 || p.payment_date ? 'PAGO' : 'PREVISTO'),
               paymentDate: p.payment_date || undefined,
            };
          });
          return paymentMap;
        } catch (err: any) {
          if (err.code === '42703') {
            // Fallback for missing columns
            console.warn("Missing columns in payments table, falling back to basic columns");
          const { data, error } = await supabase.from('payments').select('quota_id, installment_number, amount_paid, manual_fc, manual_fr, manual_ta, payment_date').eq('quota_id', quotaId);
          if (error) throw error;
          const paymentMap: Record<number, any> = {};
          (data || []).forEach((p: any) => {
            paymentMap[p.installment_number] = {
               amount: p.amount_paid !== null ? Number(p.amount_paid) : undefined,
               manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
               manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
               manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
               status: (Number(p.amount_paid) > 0 || p.payment_date) ? 'PAGO' : 'PREVISTO',
               paymentDate: p.payment_date || undefined,
            };
          });
            return paymentMap;
          }
          throw err;
        }
    } else {
        const data = localStorage.getItem(`${PAYMENTS_KEY_PREFIX}${quotaId}`);
        return data ? JSON.parse(data) : {};
    }
  },

  // Added getAllPaymentsDictionary to support batch processing in reports
  getAllPaymentsDictionary: async (): Promise<Record<string, Record<number, any>>> => {
    const supabase = getSupabase();
    const dict: Record<string, Record<number, any>> = {};
    
    if (supabase) {
      try {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('payments')
            .select('*')
            .range(from, from + pageSize - 1);
          
          if (error) throw error;
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < pageSize) hasMore = false;
            else from += pageSize;
          } else {
            hasMore = false;
          }
        }
        
        console.log(`Fetched ${allData.length} raw payment records from DB.`);
        
        allData.forEach((p: any) => {
          if (!dict[p.quota_id]) dict[p.quota_id] = {};
          dict[p.quota_id][p.installment_number] = {
            amount: p.amount_paid !== null ? Number(p.amount_paid) : undefined,
            manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
            manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
            manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
            manualFine: p.manual_fine !== null ? Number(p.manual_fine) : undefined,
            manualInterest: p.manual_interest !== null ? Number(p.manual_interest) : undefined,
            manualInsurance: p.manual_insurance !== null ? Number(p.manual_insurance) : undefined,
            manualAmortization: p.manual_amortization !== null ? Number(p.manual_amortization) : undefined,
            manualEarnings: p.manual_earnings !== null ? Number(p.manual_earnings) : undefined,
            status: (p.status && p.status.trim() !== '') ? p.status.trim().toUpperCase() : (Number(p.amount_paid) > 0 || p.payment_date ? 'PAGO' : 'PREVISTO'),
            paymentDate: p.payment_date || undefined,
          };
        });
      } catch (err: any) {
        if (err.code === '42703') {
          console.warn("Missing columns in payments table, falling back to basic columns for dictionary");
          
          let allData: any[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from('payments')
              .select('quota_id, installment_number, amount_paid, manual_fc, manual_fr, manual_ta, payment_date')
              .range(from, from + pageSize - 1);
            
            if (error) throw error;
            if (data && data.length > 0) {
              allData = [...allData, ...data];
              if (data.length < pageSize) hasMore = false;
              else from += pageSize;
            } else {
              hasMore = false;
            }
          }
          
          allData.forEach((p: any) => {
            if (!dict[p.quota_id]) dict[p.quota_id] = {};
            dict[p.quota_id][p.installment_number] = {
              amount: p.amount_paid !== null ? Number(p.amount_paid) : undefined,
              manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
              manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
              manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
              status: (Number(p.amount_paid) > 0 || p.payment_date) ? 'PAGO' : 'PREVISTO',
              paymentDate: p.payment_date || undefined,
            };
          });
        } else {
          console.error("Failed to fetch all payments for dictionary", err);
          throw err;
        }
      }
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(PAYMENTS_KEY_PREFIX)) {
          const quotaId = key.substring(PAYMENTS_KEY_PREFIX.length);
          const data = localStorage.getItem(key);
          if (data) {
            dict[quotaId] = JSON.parse(data);
          }
        }
      }
    }
    return dict;
  },

  savePayment: async (quotaId: string, installmentNumber: number, data: any): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      const payload: any = {
        quota_id: quotaId,
        installment_number: installmentNumber,
        amount_paid: data.amount !== undefined ? data.amount : null,
        manual_fc: data.manualFC !== undefined ? data.manualFC : null,
        manual_fr: data.manualFR !== undefined ? data.manualFR : null,
        manual_ta: data.manualTA !== undefined ? data.manualTA : null,
        manual_fine: data.manualFine !== undefined ? data.manualFine : null,
        manual_interest: data.manualInterest !== undefined ? data.manualInterest : null,
        manual_insurance: data.manualInsurance !== undefined ? data.manualInsurance : null,
        manual_amortization: data.manualAmortization !== undefined ? data.manualAmortization : null,
        manual_earnings: data.manualEarnings !== undefined ? data.manualEarnings : null,
        status: data.status || 'PAGO',
        payment_date: (data.paymentDate && data.paymentDate.trim() !== '') 
          ? (data.paymentDate.includes('T') ? data.paymentDate : `${data.paymentDate}T12:00:00Z`) 
          : ((data.status === 'PAGO' || data.status === 'CONCILIADO') ? new Date().toISOString() : null)
      };

      try {
        const { error } = await supabase.from('payments').upsert(payload, { onConflict: 'quota_id, installment_number' });
        
        if (error) {
          // If the error is about a missing column (like 'status' or 'manual_earnings'), 
          // try saving without those columns as a fallback
          if (error.code === '42703') {
            console.warn(`Column missing in payments table, retrying without new columns. Error: ${error.message}`);
            const fallbackPayload = { ...payload };
            // Aggressively remove columns that might be missing in older schemas
            delete fallbackPayload.status;
            delete fallbackPayload.manual_earnings;
            delete fallbackPayload.manual_amortization;
            delete fallbackPayload.manual_insurance;
            delete fallbackPayload.manual_fine;
            delete fallbackPayload.manual_interest;
            
            const { error: retryError } = await supabase.from('payments').upsert(fallbackPayload, { onConflict: 'quota_id, installment_number' });
            if (retryError) {
              console.error("Retry failed:", retryError);
              throw new Error(`Erro ao salvar no banco de dados (Schema desatualizado): ${retryError.message}`);
            }
          } else {
            console.error("Supabase Error in savePayment:", error);
            throw new Error(`Erro no banco de dados: ${error.message} (Código: ${error.code})`);
          }
        }
      } catch (err: any) {
        console.error("Error in savePayment:", err);
        throw err;
      }
    } else {
      const payments = JSON.parse(localStorage.getItem(`${PAYMENTS_KEY_PREFIX}${quotaId}`) || '{}');
      payments[installmentNumber] = {
        ...data,
        paymentDate: (data.paymentDate && data.paymentDate.trim() !== '') 
          ? (data.paymentDate.includes('T') ? data.paymentDate : `${data.paymentDate}T12:00:00Z`) 
          : (data.status === 'PAGO' ? new Date().toISOString() : null)
      };
      localStorage.setItem(`${PAYMENTS_KEY_PREFIX}${quotaId}`, JSON.stringify(payments));
    }
  },

  getIndices: async (): Promise<MonthlyIndex[]> => {
    const supabase = getSupabase();
    if (supabase) {
       const { data } = await supabase.from('correction_indices').select('*').order('date', { ascending: false });
       return (data || []).map((i: any) => ({ id: i.id, type: i.type, date: i.date, rate: Number(i.rate) }));
    } else {
      const data = localStorage.getItem(INDICES_KEY);
      return data ? JSON.parse(data) : [];
    }
  },

  saveIndex: async (index: MonthlyIndex): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('correction_indices').upsert(index);
    else {
      const list = JSON.parse(localStorage.getItem(INDICES_KEY) || '[]');
      const idx = list.findIndex((i: any) => i.id === index.id);
      if(idx >= 0) list[idx] = index; else list.push(index);
      localStorage.setItem(INDICES_KEY, JSON.stringify(list));
    }
  },

  deleteIndex: async (id: string): Promise<void> => {
     const supabase = getSupabase();
     if (supabase) await supabase.from('correction_indices').delete().eq('id', id);
     else {
       const list = JSON.parse(localStorage.getItem(INDICES_KEY) || '[]');
       localStorage.setItem(INDICES_KEY, JSON.stringify(list.filter((i: any) => i.id !== id)));
     }
  },

  getAdministrators: async (): Promise<Administrator[]> => {
    const supabase = getSupabase();
    if (supabase) {
       const { data } = await supabase.from('administrators').select('*').order('name');
       return data || [];
    }
    return JSON.parse(localStorage.getItem(ADMINS_KEY) || '[]');
  },

  saveAdministrator: async (admin: Administrator): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('administrators').upsert(admin);
    else {
       const list = JSON.parse(localStorage.getItem(ADMINS_KEY) || '[]');
       list.push(admin);
       localStorage.setItem(ADMINS_KEY, JSON.stringify(list));
    }
  },

  deleteAdministrator: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('administrators').delete().eq('id', id);
    else {
       const list = JSON.parse(localStorage.getItem(ADMINS_KEY) || '[]');
       localStorage.setItem(ADMINS_KEY, JSON.stringify(list.filter((a: any) => a.id !== id)));
    }
  },

  getCompanies: async (): Promise<Company[]> => {
    const supabase = getSupabase();
    if (supabase) {
       const { data } = await supabase.from('companies').select('*').order('name');
       return data || [];
    }
    return JSON.parse(localStorage.getItem(COMPANIES_KEY) || '[]');
  },

  saveCompany: async (company: Company): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('companies').upsert(company);
    else {
       const list = JSON.parse(localStorage.getItem(COMPANIES_KEY) || '[]');
       list.push(company);
       localStorage.setItem(COMPANIES_KEY, JSON.stringify(list));
    }
  },

  deleteCompany: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('companies').delete().eq('id', id);
    else {
       const list = JSON.parse(localStorage.getItem(COMPANIES_KEY) || '[]');
       localStorage.setItem(COMPANIES_KEY, JSON.stringify(list.filter((a: any) => a.id !== id)));
    }
  },

  getAllCreditUsages: async (): Promise<CreditUsageEntry[]> => {
    const supabase = getSupabase();
    if (supabase) {
        const { data } = await supabase.from('credit_usages').select('*');
        return (data || []).map(u => ({
            id: u.id,
            quotaId: u.quota_id,
            description: u.description,
            date: u.date,
            amount: Number(u.amount),
            seller: u.seller
        }));
    }
    return JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]');
  },

  getCreditUsages: async (quotaId: string): Promise<CreditUsageEntry[]> => {
    const supabase = getSupabase();
    if (supabase) {
        const { data } = await supabase.from('credit_usages').select('*').eq('quota_id', quotaId);
        return (data || []).map(u => ({ id: u.id, quotaId: u.quota_id, description: u.description, date: u.date, amount: Number(u.amount), seller: u.seller }));
    }
    return (JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]')).filter((u: any) => u.quotaId === quotaId);
  },

  saveCreditUsage: async (usage: CreditUsageEntry): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('credit_usages').upsert({
        id: usage.id,
        quota_id: usage.quotaId,
        description: usage.description,
        date: usage.date,
        amount: usage.amount,
        seller: usage.seller
      });
    } else {
      const list = JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]');
      list.push(usage);
      localStorage.setItem(CREDIT_USAGES_KEY, JSON.stringify(list));
    }
  },

  deleteCreditUsage: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.from('credit_usages').delete().eq('id', id);
    else {
      const list = JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]');
      localStorage.setItem(CREDIT_USAGES_KEY, JSON.stringify(list.filter((u: any) => u.id !== id)));
    }
  },

  // --- Manual Transactions ---
  getManualTransactions: async (quotaId: string): Promise<ManualTransaction[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('manual_transactions').select('*').eq('quota_id', quotaId);
        if (error) {
          console.warn('Error fetching manual_transactions from Supabase, falling back to local storage:', error.message);
          const all = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
          return all.filter((t: any) => t.quotaId === quotaId);
        }
        return (data || []).map(t => ({
          id: t.id,
          quotaId: t.quota_id,
          date: t.date,
          amount: Number(t.amount),
          type: t.type,
          description: t.description,
          fc: t.fc !== null ? Number(t.fc) : undefined,
          fr: t.fr !== null ? Number(t.fr) : undefined,
          ta: t.ta !== null ? Number(t.ta) : undefined,
          insurance: t.insurance !== null ? Number(t.insurance) : undefined,
          amortization: t.amortization !== null ? Number(t.amortization) : undefined,
          fine: t.fine !== null ? Number(t.fine) : undefined,
          interest: t.interest !== null ? Number(t.interest) : undefined
        }));
      } catch (err) {
        console.warn('Exception fetching manual_transactions from Supabase, falling back to local storage:', err);
        const all = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
        return all.filter((t: any) => t.quotaId === quotaId);
      }
    }
    const all = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
    return all.filter((t: any) => t.quotaId === quotaId);
  },

  getAllManualTransactions: async (): Promise<ManualTransaction[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('manual_transactions')
            .select('*')
            .range(from, from + pageSize - 1);
          
          if (error) throw new Error(error.message);
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < pageSize) hasMore = false;
            else from += pageSize;
          } else {
            hasMore = false;
          }
        }
        
        return allData.map((t: any) => ({
          id: t.id,
          quotaId: t.quota_id,
          date: t.date,
          amount: Number(t.amount),
          type: t.type,
          description: t.description,
          fc: t.fc !== null ? Number(t.fc) : undefined,
          fr: t.fr !== null ? Number(t.fr) : undefined,
          ta: t.ta !== null ? Number(t.ta) : undefined,
          insurance: t.insurance !== null ? Number(t.insurance) : undefined,
          amortization: t.amortization !== null ? Number(t.amortization) : undefined,
          fine: t.fine !== null ? Number(t.fine) : undefined,
          interest: t.interest !== null ? Number(t.interest) : undefined
        }));
      } catch (err) {
        console.warn('Exception fetching all manual_transactions from Supabase:', err);
        return JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
      }
    }
    return JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
  },

  saveManualTransaction: async (transaction: ManualTransaction): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('manual_transactions').upsert({
          id: transaction.id,
          quota_id: transaction.quotaId,
          date: transaction.date,
          amount: transaction.amount,
          type: transaction.type,
          description: transaction.description,
          fc: transaction.fc,
          fr: transaction.fr,
          ta: transaction.ta,
          insurance: transaction.insurance,
          amortization: transaction.amortization,
          fine: transaction.fine,
          interest: transaction.interest
        });
        if (error) {
          console.error('Error saving manual_transaction to Supabase:', error.message);
          // Still save to local storage as backup
          const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
          const idx = list.findIndex((t: any) => t.id === transaction.id);
          if (idx >= 0) list[idx] = transaction;
          else list.push(transaction);
          localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list));
          
          let userMessage = `Erro ao salvar no banco de dados: ${error.message}`;
          if (error.message.includes("column") && error.message.includes("not found")) {
            userMessage = "Erro de esquema no banco de dados. Por favor, execute o script SQL de atualização (veja as instruções no chat).";
          }
          
          throw new Error(userMessage);
        }
      } catch (err) {
        console.error('Exception saving manual_transaction to Supabase:', err);
        // Fallback to local storage
        const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
        const idx = list.findIndex((t: any) => t.id === transaction.id);
        if (idx >= 0) list[idx] = transaction;
        else list.push(transaction);
        localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list));
        
        throw err;
      }
    } else {
      const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
      const idx = list.findIndex((t: any) => t.id === transaction.id);
      if (idx >= 0) list[idx] = transaction;
      else list.push(transaction);
      localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list));
    }
  },

  deleteManualTransaction: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('manual_transactions').delete().eq('id', id);
        if (error) {
          console.error('Error deleting manual_transaction from Supabase:', error.message);
          // Still update local storage as backup
          const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
          localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list.filter((t: any) => t.id !== id)));
          
          let userMessage = `Erro ao deletar no banco de dados: ${error.message}`;
          if (error.message.includes("column") && error.message.includes("not found")) {
            userMessage = "Erro de esquema no banco de dados. Por favor, execute o script SQL de atualização.";
          }
          
          throw new Error(userMessage);
        }
      } catch (err) {
        console.error('Exception deleting manual_transaction from Supabase:', err);
        // Fallback to local storage
        const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
        localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list.filter((t: any) => t.id !== id)));
        
        throw err;
      }
    } else {
      const list = JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]');
      localStorage.setItem(MANUAL_TRANSACTIONS_KEY, JSON.stringify(list.filter((t: any) => t.id !== id)));
    }
  },

  getSMTPConfig: async (): Promise<SMTPConfig | null> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('smtp_config').select('*').single();
        if (error) {
          if (error.code === 'PGRST116') return null;
          if (error.code === 'PGRST204' || error.message.includes('schema cache') || error.message.includes('does not exist')) {
            return null;
          }
          console.error('Error fetching SMTP config:', error.message);
          return null;
        }
        if (!data) return null;
        return {
          id: data.id,
          host: data.host,
          port: Number(data.port),
          secure: data.secure,
          user: data.user_name,
          pass: data.password,
          fromName: data.from_name,
          fromEmail: data.from_email,
          reportRecipient: data.report_recipient
        };
      } catch (err) {
        return null;
      }
    }
    const data = localStorage.getItem(SMTP_CONFIG_KEY);
    return data ? JSON.parse(data) : null;
  },

  saveSMTPConfig: async (config: SMTPConfig): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      const payload = {
        id: config.id || 'default',
        host: config.host,
        port: config.port,
        secure: config.secure,
        user_name: config.user,
        password: config.pass,
        from_name: config.fromName,
        from_email: config.fromEmail,
        report_recipient: config.reportRecipient
      };
      const { error } = await supabase.from('smtp_config').upsert(payload);
      if (error) {
        if (error.message.includes('schema cache') || error.message.includes('does not exist')) {
          console.warn('SMTP config table not found in Supabase. Saving to local storage as fallback.');
          localStorage.setItem(SMTP_CONFIG_KEY, JSON.stringify(config));
          return;
        }
        throw new Error(error.message);
      }
    } else {
      localStorage.setItem(SMTP_CONFIG_KEY, JSON.stringify(config));
    }
  },

  // --- Credit Updates (Aplicação Financeira) ---
  getCreditUpdates: async (quotaId: string): Promise<CreditUpdate[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('credit_updates').select('*').eq('quota_id', quotaId);
        if (error) throw error;
        return (data || []).map(u => ({
          id: u.id,
          quotaId: u.quota_id,
          date: u.date,
          value: Number(u.value)
        }));
      } catch (err) {
        console.warn('Error fetching credit_updates from Supabase:', err);
        const all = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
        return all.filter((u: any) => u.quotaId === quotaId);
      }
    }
    const all = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
    return all.filter((u: any) => u.quotaId === quotaId);
  },

  getAllCreditUpdates: async (): Promise<CreditUpdate[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('credit_updates').select('*').limit(10000);
        if (error) throw error;
        return (data || []).map(u => ({
          id: u.id,
          quotaId: u.quota_id,
          date: u.date,
          value: Number(u.value)
        }));
      } catch (err) {
        console.warn('Error fetching all credit_updates from Supabase:', err);
        return JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
      }
    }
    return JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
  },

  saveCreditUpdate: async (update: CreditUpdate): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('credit_updates').upsert({
          id: update.id,
          quota_id: update.quotaId,
          date: update.date,
          value: update.value
        });
        if (error) throw error;
      } catch (err) {
        console.error('Error saving credit_update to Supabase:', err);
        // Fallback to local storage
        const list = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
        const idx = list.findIndex((u: any) => u.id === update.id);
        if (idx >= 0) list[idx] = update;
        else list.push(update);
        localStorage.setItem(CREDIT_UPDATES_KEY, JSON.stringify(list));
        throw err;
      }
    } else {
      const list = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
      const idx = list.findIndex((u: any) => u.id === update.id);
      if (idx >= 0) list[idx] = update;
      else list.push(update);
      localStorage.setItem(CREDIT_UPDATES_KEY, JSON.stringify(list));
    }
  },

  deleteCreditUpdate: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('credit_updates').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Error deleting credit_update from Supabase:', err);
        const list = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
        localStorage.setItem(CREDIT_UPDATES_KEY, JSON.stringify(list.filter((u: any) => u.id !== id)));
        throw err;
      }
    } else {
      const list = JSON.parse(localStorage.getItem(CREDIT_UPDATES_KEY) || '[]');
      localStorage.setItem(CREDIT_UPDATES_KEY, JSON.stringify(list.filter((u: any) => u.id !== id)));
    }
  },

  getUsers: async (): Promise<User[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw new Error(error.message);
        return (data || []).map(fromDbUser);
      } catch (err: any) { throw err; }
    } else {
      const data = localStorage.getItem(USERS_KEY);
      return data ? JSON.parse(data) : [];
    }
  },

  saveUser: async (user: User): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('users').upsert(toDbUser(user));
      if (error) throw new Error(error.message);
    } else {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const existingIndex = users.findIndex((u: User) => u.id === user.id);
      if (existingIndex >= 0) users[existingIndex] = user;
      else users.push(user);
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
  },

  deleteUser: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw new Error(error.message);
    } else {
      const users = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      localStorage.setItem(USERS_KEY, JSON.stringify(users.filter((u: User) => u.id !== id)));
    }
  },

  // --- Scheduled Reports ---
  getScheduledReports: async (): Promise<any[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('scheduled_reports').select('*').order('created_at', { ascending: false });
        if (error) {
          if (error.code === 'PGRST204') return []; // Table doesn't exist yet
          throw error;
        }
        return (data || []).map(r => ({
          id: r.id,
          name: r.name,
          recipient: r.recipient,
          subject: r.subject,
          message: r.message,
          frequency: r.frequency,
          selectedColumns: r.selected_columns,
          filters: r.filters,
          lastSent: r.last_sent,
          isActive: r.is_active,
          createdAt: r.created_at
        }));
      } catch (err) {
        console.warn('Error fetching scheduled_reports from Supabase:', err);
        return JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
      }
    }
    return JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
  },

  saveScheduledReport: async (report: any): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('scheduled_reports').upsert({
          id: report.id,
          name: report.name,
          recipient: report.recipient,
          subject: report.subject,
          message: report.message,
          frequency: report.frequency,
          selected_columns: report.selectedColumns,
          filters: report.filters,
          last_sent: report.lastSent,
          is_active: report.isActive,
          created_at: report.createdAt
        });
        if (error) throw error;
      } catch (err) {
        console.error('Error saving scheduled_report to Supabase:', err);
        const list = JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
        const idx = list.findIndex((r: any) => r.id === report.id);
        if (idx >= 0) list[idx] = report;
        else list.push(report);
        localStorage.setItem('consortium_scheduled_reports_db', JSON.stringify(list));
      }
    } else {
      const list = JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
      const idx = list.findIndex((r: any) => r.id === report.id);
      if (idx >= 0) list[idx] = report;
      else list.push(report);
      localStorage.setItem('consortium_scheduled_reports_db', JSON.stringify(list));
    }
  },

  deleteScheduledReport: async (id: string): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase.from('scheduled_reports').delete().eq('id', id);
        if (error) throw error;
      } catch (err) {
        console.error('Error deleting scheduled_report from Supabase:', err);
        const list = JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
        localStorage.setItem('consortium_scheduled_reports_db', JSON.stringify(list.filter((r: any) => r.id !== id)));
      }
    } else {
      const list = JSON.parse(localStorage.getItem('consortium_scheduled_reports_db') || '[]');
      localStorage.setItem('consortium_scheduled_reports_db', JSON.stringify(list.filter((r: any) => r.id !== id)));
    }
  },

  exportAllData: async (): Promise<any> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const [quotas, indices, admins, companies, creditUsages, manualTransactions, users] = await Promise.all([
          db.getQuotas(),
          db.getIndices(),
          db.getAdministrators(),
          db.getCompanies(),
          db.getAllCreditUsages(),
          db.getAllManualTransactions(),
          db.getUsers()
        ]);

        // Fetch all payments for all quotas
        const payments: Record<string, any> = {};
        for (const q of quotas) {
          try {
            const qPayments = await db.getPayments(q.id);
            if (Object.keys(qPayments).length > 0) {
              payments[`payments_${q.id}`] = qPayments;
            }
          } catch (e) {
            console.warn(`Could not fetch payments for quota ${q.id}`, e);
          }
        }

        return {
          quotas,
          indices,
          administrators: admins,
          companies,
          credit_usages: creditUsages,
          manual_transactions: manualTransactions,
          users,
          payments
        };
      } catch (err: any) {
        console.error("Failed to export from Supabase:", err);
      }
    }

    // Local storage fallback
    return {
      quotas: JSON.parse(localStorage.getItem(DB_KEY) || '[]'),
      indices: JSON.parse(localStorage.getItem(INDICES_KEY) || '[]'),
      administrators: JSON.parse(localStorage.getItem(ADMINS_KEY) || '[]'),
      companies: JSON.parse(localStorage.getItem(COMPANIES_KEY) || '[]'),
      credit_usages: JSON.parse(localStorage.getItem(CREDIT_USAGES_KEY) || '[]'),
      manual_transactions: JSON.parse(localStorage.getItem(MANUAL_TRANSACTIONS_KEY) || '[]'),
      users: JSON.parse(localStorage.getItem(USERS_KEY) || '[]'),
      payments: Object.keys(localStorage).reduce((acc, key) => {
        if (key.startsWith(PAYMENTS_KEY_PREFIX)) {
          acc[key] = JSON.parse(localStorage.getItem(key) || '{}');
        }
        return acc;
      }, {} as any)
    };
  }
};
