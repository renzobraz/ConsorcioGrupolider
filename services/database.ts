
import { Quota, MonthlyIndex, Administrator, Company, CreditUsageEntry } from '../types';
import { getSupabase } from './supabaseClient';

const DB_KEY = 'consortium_quotas_db';
const PAYMENTS_KEY_PREFIX = 'payments_';
const INDICES_KEY = 'consortium_indices_db';
const ADMINS_KEY = 'consortium_admins_db';
const COMPANIES_KEY = 'consortium_companies_db';
const CREDIT_USAGES_KEY = 'consortium_credit_usages_db';

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
  bid_free_correction: q.bidFreeCorrection || 0
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
  bidFreeCorrection: Number(dbQ.bid_free_correction || 0)
});

export const db = {
  isCloudEnabled: () => !!getSupabase(),

  getQuotas: async (): Promise<Quota[]> => {
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('quotas').select('*');
        if (error) throw new Error(error.message);
        return (data || []).map(fromDbQuota);
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
      await supabase.from('quotas').delete().eq('id', id);
    } else {
      const quotas = JSON.parse(localStorage.getItem(DB_KEY) || '[]');
      localStorage.setItem(DB_KEY, JSON.stringify(quotas.filter((q: Quota) => q.id !== id)));
      localStorage.removeItem(`${PAYMENTS_KEY_PREFIX}${id}`);
    }
  },

  getPayments: async (quotaId: string): Promise<Record<number, any>> => {
    const supabase = getSupabase();
    if (supabase) {
        const { data, error } = await supabase.from('payments').select('*').eq('quota_id', quotaId);
        if (error) throw error;
        const paymentMap: Record<number, any> = {};
        (data || []).forEach((p: any) => {
          paymentMap[p.installment_number] = {
             amount: Number(p.amount_paid),
             manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
             manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
             manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
             manualFine: p.manual_fine !== null ? Number(p.manual_fine) : undefined,
             manualInterest: p.manual_interest !== null ? Number(p.manual_interest) : undefined,
          };
        });
        return paymentMap;
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
        const { data, error } = await supabase.from('payments').select('*');
        if (error) throw error;
        
        (data || []).forEach((p: any) => {
          if (!dict[p.quota_id]) dict[p.quota_id] = {};
          dict[p.quota_id][p.installment_number] = {
            amount: Number(p.amount_paid),
            manualFC: p.manual_fc !== null ? Number(p.manual_fc) : undefined,
            manualFR: p.manual_fr !== null ? Number(p.manual_fr) : undefined,
            manualTA: p.manual_ta !== null ? Number(p.manual_ta) : undefined,
            manualFine: p.manual_fine !== null ? Number(p.manual_fine) : undefined,
            manualInterest: p.manual_interest !== null ? Number(p.manual_interest) : undefined,
          };
        });
      } catch (err) {
        console.error("Failed to fetch all payments for dictionary", err);
        throw err;
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
      const payload = {
        quota_id: quotaId,
        installment_number: installmentNumber,
        amount_paid: data.amount,
        manual_fc: data.fc ?? null,
        manual_fr: data.fr ?? null,
        manual_ta: data.ta ?? null,
        manual_fine: data.fine ?? null,
        manual_interest: data.interest ?? null,
        payment_date: new Date().toISOString()
      };
      await supabase.from('payments').upsert(payload);
    } else {
      const payments = JSON.parse(localStorage.getItem(`${PAYMENTS_KEY_PREFIX}${quotaId}`) || '{}');
      payments[installmentNumber] = data;
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
  }
};
