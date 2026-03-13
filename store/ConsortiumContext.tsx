
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Quota, PaymentInstallment, MonthlyIndex, Administrator, Company, CreditUsageEntry } from '../types';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { useAuth } from './AuthContext';

interface ConsortiumContextType {
  quotas: Quota[];
  indices: MonthlyIndex[];
  administrators: Administrator[];
  companies: Company[];
  allCreditUsages: CreditUsageEntry[]; // EXPOSED
  
  isLoading: boolean;
  isCloudConnected: boolean;
  connectionError: string | null;
  
  addQuota: (quota: Quota) => Promise<void>;
  updateQuota: (quota: Quota) => Promise<void>;
  getQuotaById: (id: string) => Quota | undefined;
  deleteQuota: (id: string) => Promise<void>;
  currentQuota: Quota | null;
  setCurrentQuota: (quota: Quota | null) => Promise<void>;
  installments: PaymentInstallment[];
  updateInstallmentPayment: (installmentNumber: number, data: { amount?: number, fc?: number, fr?: number, ta?: number, fine?: number, interest?: number }) => Promise<void>;
  addIndex: (index: MonthlyIndex) => Promise<void>;
  updateIndex: (index: MonthlyIndex) => Promise<void>;
  deleteIndex: (id: string) => Promise<void>;
  
  addAdministrator: (admin: Administrator) => Promise<void>;
  deleteAdministrator: (id: string) => Promise<void>;
  addCompany: (company: Company) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;

  // Credit Usage Methods
  getCreditUsages: (quotaId: string) => Promise<CreditUsageEntry[]>;
  addCreditUsage: (usage: CreditUsageEntry) => Promise<void>;
  deleteCreditUsage: (id: string) => Promise<void>;
  
  refreshData: () => Promise<void>;

  // Global Filters
  globalFilters: {
    companyId: string;
    administratorId: string;
    status: string;
    productType: string;
  };
  setGlobalFilters: (filters: { companyId: string; administratorId: string; status: string; productType: string }) => void;
}

const ConsortiumContext = createContext<ConsortiumContextType | undefined>(undefined);

export const ConsortiumProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [indices, setIndices] = useState<MonthlyIndex[]>([]);
  const [administrators, setAdministrators] = useState<Administrator[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allCreditUsages, setAllCreditUsages] = useState<CreditUsageEntry[]>([]);
  
  const [currentQuota, setCurrentQuotaState] = useState<Quota | null>(null);
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(() => db.isCloudEnabled());
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Global Filters State
  const [globalFilters, setGlobalFilters] = useState({
    companyId: '',
    administratorId: '',
    status: '',
    productType: ''
  });

  const { user, isAdmin } = useAuth();

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setConnectionError(null);
    const isCloud = db.isCloudEnabled();
    setIsCloudConnected(isCloud);

    try {
      // 1. Load Quotas (Critical)
      try {
        const loadedQuotas = await db.getQuotas();
        setQuotas(loadedQuotas);
      } catch (err: any) {
        console.error("Failed to load quotas:", err);
        if (isCloud) {
           if (err.message && (err.message.includes("Invalid API key") || err.message.includes("JWT") || err.message.includes("Chave de API Inválida"))) {
               setConnectionError("Chave de API Inválida. Verifique em Configurações.");
           } else {
               setConnectionError(err.message || "Erro ao carregar cotas");
           }
           throw err; // Stop if critical data fails
        }
      }

      // 2. Load Indices (Non-Critical)
      try {
        const loadedIndices = await db.getIndices();
        setIndices(loadedIndices);
      } catch (err: any) {
        console.warn("Failed to load indices:", err);
        if (isCloud && (err.message?.includes('Tabela de índices inexistente') || err.message?.includes('correction_indices'))) {
             setConnectionError("Atenção: Atualize o Banco de Dados (Tabelas ausentes).");
        }
      }

      // 3. Load Admins, Companies & Credit Usages (Non-Critical)
      try {
         const admins = await db.getAdministrators();
         setAdministrators(admins);
         const comps = await db.getCompanies();
         setCompanies(comps);
         
         const usages = await db.getAllCreditUsages();
         setAllCreditUsages(usages);
      } catch (err: any) {
         console.warn("Failed to load auxiliary tables:", err);
      }
      
    } catch (err: any) {
      console.error("Critical Data Load Failure:", err);
      // connectionError already set above if quota load failed
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const addQuota = useCallback(async (quota: Quota) => {
    // Optimistic Update
    setQuotas(prev => {
       const exists = prev.findIndex(q => q.id === quota.id);
       if (exists >= 0) {
         const newArr = [...prev];
         newArr[exists] = quota;
         return newArr;
       }
       return [...prev, quota];
    });

    try {
      await db.saveQuota(quota);
    } catch (err: any) {
      console.error("Failed to save quota to DB", err);
      if (db.isCloudEnabled()) {
         // Throw specific errors for UI handling
         throw err;
      }
      await refreshData(); // Revert optimistic update if needed
      throw err; 
    }
  }, [refreshData]);

  const updateQuota = useCallback(async (quota: Quota) => {
     try {
       await addQuota(quota);
       setCurrentQuotaState(prev => prev && prev.id === quota.id ? quota : prev);
     } catch (err) {
       throw err;
     }
  }, [addQuota]);

  const getQuotaById = useCallback((id: string) => {
    return quotas.find(q => q.id === id);
  }, [quotas]);

  const deleteQuota = useCallback(async (id: string) => {
    const prevQuotas = [...quotas];
    
    // Otimista: remove do estado local
    setQuotas(prev => prev.filter(q => q.id !== id));
    
    if (currentQuota?.id === id) {
      setCurrentQuotaState(null);
      setInstallments([]);
    }

    try {
      await db.deleteQuota(id);
      // Recarrega para garantir sincronia com os usos de crédito (que podem ter sido deletados em cascata no banco)
      await refreshData();
    } catch (err: any) {
       setQuotas(prevQuotas); // Rollback
       console.error("Failed to delete quota", err);
       if (db.isCloudEnabled()) {
         setConnectionError(err.message || "Erro ao excluir cota");
       }
       throw err;
    }
  }, [quotas, currentQuota, refreshData]);

  const setCurrentQuota = useCallback(async (quota: Quota | null) => {
    setCurrentQuotaState(quota);
    if (quota) {
      setIsLoading(true);
      
      try {
        let savedPayments: Record<number, any> = {};
        try {
           savedPayments = await db.getPayments(quota.id);
        } catch(e) {
           console.warn("Could not load payments", e);
        }
        
        const schedule = generateSchedule(quota, indices, savedPayments);
        setInstallments(schedule);

      } catch (err: any) {
         console.error("Failed to generate schedule/payments", err);
         if (db.isCloudEnabled()) {
            setConnectionError(err.message || "Erro ao carregar pagamentos");
         }
         // Fallback to basic schedule
         setInstallments(generateSchedule(quota, indices));
      } finally {
         setIsLoading(false);
      }
    } else {
      setInstallments([]);
    }
  }, [indices]);

  const updateInstallmentPayment = useCallback(async (installmentNumber: number, data: { amount?: number, fc?: number, fr?: number, ta?: number, fine?: number, interest?: number, insurance?: number, amortization?: number, status?: string, paymentDate?: string }) => {
    if (!currentQuota) return;

    // Find existing installment to merge data
    const existingInst = installments.find(i => i.installmentNumber === installmentNumber);
    const mergedData = {
      amount: data.amount !== undefined ? data.amount : existingInst?.realAmountPaid,
      fc: data.fc !== undefined ? data.fc : existingInst?.manualFC,
      fr: data.fr !== undefined ? data.fr : existingInst?.manualFR,
      ta: data.ta !== undefined ? data.ta : existingInst?.manualTA,
      fine: data.fine !== undefined ? data.fine : existingInst?.manualFine,
      interest: data.interest !== undefined ? data.interest : existingInst?.manualInterest,
      insurance: data.insurance !== undefined ? data.insurance : existingInst?.manualInsurance,
      amortization: data.amortization !== undefined ? data.amortization : existingInst?.manualAmortization,
      status: data.status !== undefined ? data.status : existingInst?.status,
      paymentDate: data.paymentDate !== undefined ? data.paymentDate : existingInst?.paymentDate
    };

    // 1. Update DB first
    try {
      await db.savePayment(currentQuota.id, installmentNumber, mergedData);
    } catch (err: any) {
      console.error("Failed to save payment", err);
      if (db.isCloudEnabled()) {
        setConnectionError(err.message || "Erro ao salvar pagamento");
      }
      return; // Stop if save fails
    }

    // 2. Re-generate Schedule
    let savedPayments: Record<number, any> = {};
    try {
        savedPayments = await db.getPayments(currentQuota.id);
    } catch(e) {
        console.warn("Could not load payments for recalculation", e);
    }

    // Re-run generation logic
    const schedule = generateSchedule(currentQuota, indices, savedPayments);
    setInstallments(schedule);

  }, [currentQuota, installments, indices]); // dependencies

  const addIndex = useCallback(async (index: MonthlyIndex) => {
    setIndices(prev => {
       const exists = prev.findIndex(i => i.id === index.id);
       if (exists >= 0) {
          const newArr = [...prev];
          newArr[exists] = index;
          return newArr.sort((a,b) => b.date.localeCompare(a.date));
       }
       return [index, ...prev].sort((a,b) => b.date.localeCompare(a.date));
    });
    try {
      await db.saveIndex(index);
    } catch (err: any) {
      if (db.isCloudEnabled()) setConnectionError(err.message);
    }
  }, []);

  const updateIndex = useCallback(async (index: MonthlyIndex) => {
      await addIndex(index); // Reuse addIndex logic as saveIndex handles upsert
  }, [addIndex]);

  const deleteIndex = useCallback(async (id: string) => {
    setIndices(prev => prev.filter(i => i.id !== id));
    try {
      await db.deleteIndex(id);
    } catch (err: any) {
       if (db.isCloudEnabled()) setConnectionError(err.message);
    }
  }, []);

  // --- Administrators Actions ---
  const addAdministrator = useCallback(async (admin: Administrator) => {
      setAdministrators(prev => {
          const idx = prev.findIndex(a => a.id === admin.id);
          if (idx >= 0) { const n = [...prev]; n[idx] = admin; return n; }
          return [...prev, admin];
      });
      try { await db.saveAdministrator(admin); } catch (e: any) { if(db.isCloudEnabled()) setConnectionError(e.message); }
  }, []);

  const deleteAdministrator = useCallback(async (id: string) => {
      setAdministrators(prev => prev.filter(a => a.id !== id));
      try { await db.deleteAdministrator(id); } catch (e: any) { if(db.isCloudEnabled()) setConnectionError(e.message); }
  }, []);

  // --- Companies Actions ---
  const addCompany = useCallback(async (comp: Company) => {
      setCompanies(prev => {
          const idx = prev.findIndex(a => a.id === comp.id);
          if (idx >= 0) { const n = [...prev]; n[idx] = comp; return n; }
          return [...prev, comp];
      });
      try { await db.saveCompany(comp); } catch (e: any) { if(db.isCloudEnabled()) setConnectionError(e.message); }
  }, []);

  const deleteCompany = useCallback(async (id: string) => {
      setCompanies(prev => prev.filter(a => a.id !== id));
      try { await db.deleteCompany(id); } catch (e: any) { if(db.isCloudEnabled()) setConnectionError(e.message); }
  }, []);

  // --- Credit Usage Actions ---
  const getCreditUsages = useCallback(async (quotaId: string) => {
      try {
          return await db.getCreditUsages(quotaId);
      } catch (err: any) {
          if (db.isCloudEnabled()) setConnectionError(err.message);
          return [];
      }
  }, []);

  const addCreditUsage = useCallback(async (usage: CreditUsageEntry) => {
      try {
          await db.saveCreditUsage(usage);
          
          // REFRESH GLOBAL STATE to ensure other components (QuotaList, CreditManagement) update immediately
          const all = await db.getAllCreditUsages();
          setAllCreditUsages(all);
      } catch (err: any) {
          if (db.isCloudEnabled()) setConnectionError(err.message);
          throw err;
      }
  }, []);

  const deleteCreditUsage = useCallback(async (id: string) => {
      try {
          await db.deleteCreditUsage(id);
          
          // REFRESH GLOBAL STATE
          const all = await db.getAllCreditUsages();
          setAllCreditUsages(all);
      } catch (err: any) {
          if (db.isCloudEnabled()) setConnectionError(err.message);
          throw err;
      }
  }, []);

  const filteredQuotas = React.useMemo(() => {
    if (!user) return [];
    if (isAdmin) return quotas;
    const allowedIds = user.permissions.allowedCompanyIds || [];
    return quotas.filter(q => q.companyId && allowedIds.includes(q.companyId));
  }, [quotas, user, isAdmin]);

  return (
    <ConsortiumContext.Provider value={{ 
      quotas: filteredQuotas, 
      indices,
      administrators,
      companies,
      allCreditUsages,
      isLoading,
      isCloudConnected,
      connectionError,
      addQuota, 
      updateQuota,
      getQuotaById,
      deleteQuota, 
      currentQuota, 
      setCurrentQuota, 
      installments,
      updateInstallmentPayment,
      addIndex,
      updateIndex,
      deleteIndex,
      addAdministrator,
      deleteAdministrator,
      addCompany,
      deleteCompany,
      getCreditUsages,
      addCreditUsage,
      deleteCreditUsage,
      refreshData,
      globalFilters,
      setGlobalFilters
    }}>
      {children}
    </ConsortiumContext.Provider>
  );
};

export const useConsortium = () => {
  const context = useContext(ConsortiumContext);
  if (context === undefined) {
    throw new Error('useConsortium must be used within a ConsortiumProvider');
  }
  return context;
};
