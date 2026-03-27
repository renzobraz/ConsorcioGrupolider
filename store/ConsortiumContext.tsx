
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Quota, PaymentInstallment, MonthlyIndex, Administrator, Company, CreditUsageEntry, ManualTransaction, CreditUpdate } from '../types';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';
import { useAuth } from './AuthContext';
import { calculateIndexReferenceMonth } from '../utils/formatters';

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
  payments: Record<number, any>;
  updateInstallmentPayment: (installmentNumber: number, data: { 
    amount?: number, 
    fc?: number, 
    fr?: number, 
    ta?: number, 
    fine?: number, 
    interest?: number,
    insurance?: number,
    amortization?: number,
    manualEarnings?: number,
    status?: string,
    paymentDate?: string
  }) => Promise<void>;
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
  
  manualTransactions: ManualTransaction[];
  addManualTransaction: (transaction: ManualTransaction) => Promise<void>;
  updateManualTransaction: (transaction: ManualTransaction) => Promise<void>;
  deleteManualTransaction: (id: string) => Promise<void>;
  
  allCreditUpdates: CreditUpdate[];
  addCreditUpdate: (update: CreditUpdate) => Promise<void>;
  deleteCreditUpdate: (id: string) => Promise<void>;
  
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
  
  const [currentQuota, setCurrentQuotaState] = useState<Quota | null>(() => {
    const saved = localStorage.getItem('current_quota');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [installments, setInstallments] = useState<PaymentInstallment[]>([]);
  const [payments, setPayments] = useState<Record<number, any>>({});
  const [manualTransactions, setManualTransactions] = useState<ManualTransaction[]>([]);
  const [allCreditUpdates, setAllCreditUpdates] = useState<CreditUpdate[]>([]);
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

  const migrateQuotas = useCallback(async (quotasToMigrate: Quota[]) => {
    console.log(`Iniciando migração de ${quotasToMigrate.length} cotas...`);
    for (const q of quotasToMigrate) {
      const anchorDate = q.firstAssemblyDate || q.adhesionDate || q.firstDueDate;
      if (anchorDate) {
        const refMonth = calculateIndexReferenceMonth(anchorDate);
        try {
          await db.saveQuota({ ...q, indexReferenceMonth: refMonth });
        } catch (err) {
          console.error(`Falha ao migrar cota ${q.id}:`, err);
        }
      }
    }
    // Recarrega os dados após a migração silenciosa
    const updatedQuotas = await db.getQuotas();
    setQuotas(updatedQuotas);
  }, []);

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

        // Migração automática para o novo campo indexReferenceMonth
        if (isAdmin) {
          const needsMigration = loadedQuotas.filter(q => q.indexReferenceMonth === undefined || q.indexReferenceMonth === null);
          if (needsMigration.length > 0) {
            migrateQuotas(needsMigration);
          }
        }
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
         
         const updates = await db.getAllCreditUpdates();
         setAllCreditUpdates(updates);
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
      localStorage.setItem('current_quota', JSON.stringify(quota));
      setIsLoading(true);
      
      try {
        let savedPayments: Record<number, any> = {};
        try {
           savedPayments = await db.getPayments(quota.id);
        } catch(e) {
           console.warn("Could not load payments", e);
        }

        let manualTransactions: ManualTransaction[] = [];
        try {
          manualTransactions = await db.getManualTransactions(quota.id);
        } catch (e) {
          console.warn("Could not load manual transactions", e);
        }
        
        setPayments(savedPayments);
        setManualTransactions(manualTransactions);
        const schedule = generateSchedule({ ...quota, manualTransactions }, indices, savedPayments);
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
      setPayments({});
      setManualTransactions([]);
    }
  }, [indices]);

  // Restore current quota data on mount if persisted
  useEffect(() => {
    if (currentQuota && installments.length === 0 && !isLoading) {
      setCurrentQuota(currentQuota);
    }
  }, [currentQuota, installments.length, isLoading, setCurrentQuota]);

  const updateInstallmentPayment = useCallback(async (installmentNumber: number, data: { amount?: number, fc?: number, fr?: number, ta?: number, fine?: number, interest?: number, insurance?: number, amortization?: number, manualEarnings?: number, status?: string, paymentDate?: string }) => {
    if (!currentQuota) return;

    // Find existing installment or payment to merge data
    const existingInst = installments.find(i => i.installmentNumber === installmentNumber);
    const existingPayment = payments[installmentNumber];
    
    // If status is PREVISTO, we should clear manual overrides to allow system re-calculation
    const isPrevisto = data.status === 'PREVISTO';
    
    const mergedData = {
      amount: isPrevisto ? null : (data.amount !== undefined ? data.amount : (existingInst?.realAmountPaid !== undefined ? existingInst.realAmountPaid : (existingPayment?.amount !== undefined ? existingPayment.amount : null))),
      manualFC: isPrevisto ? null : (data.fc !== undefined ? data.fc : (existingInst?.manualFC !== undefined ? existingInst.manualFC : (existingPayment?.manualFC !== undefined ? existingPayment.manualFC : null))),
      manualFR: isPrevisto ? null : (data.fr !== undefined ? data.fr : (existingInst?.manualFR !== undefined ? existingInst.manualFR : (existingPayment?.manualFR !== undefined ? existingPayment.manualFR : null))),
      manualTA: isPrevisto ? null : (data.ta !== undefined ? data.ta : (existingInst?.manualTA !== undefined ? existingInst.manualTA : (existingPayment?.manualTA !== undefined ? existingPayment.manualTA : null))),
      manualFine: isPrevisto ? null : (data.fine !== undefined ? data.fine : (existingInst?.manualFine !== undefined ? existingInst.manualFine : (existingPayment?.manualFine !== undefined ? existingPayment.manualFine : null))),
      manualInterest: isPrevisto ? null : (data.interest !== undefined ? data.interest : (existingInst?.manualInterest !== undefined ? existingInst.manualInterest : (existingPayment?.manualInterest !== undefined ? existingPayment.manualInterest : null))),
      manualInsurance: isPrevisto ? null : (data.insurance !== undefined ? data.insurance : (existingInst?.manualInsurance !== undefined ? existingInst.manualInsurance : (existingPayment?.manualInsurance !== undefined ? existingPayment.manualInsurance : null))),
      manualAmortization: isPrevisto ? null : (data.amortization !== undefined ? data.amortization : (existingInst?.manualAmortization !== undefined ? existingInst.manualAmortization : (existingPayment?.manualAmortization !== undefined ? existingPayment.manualAmortization : null))),
      manualEarnings: isPrevisto ? null : (data.manualEarnings !== undefined ? data.manualEarnings : (existingInst?.manualEarnings !== undefined ? existingInst.manualEarnings : (existingPayment?.manualEarnings !== undefined ? existingPayment.manualEarnings : null))),
      status: data.status !== undefined ? data.status : (existingInst?.status || existingPayment?.status),
      paymentDate: isPrevisto ? null : (data.paymentDate !== undefined ? data.paymentDate : (existingInst?.paymentDate || existingPayment?.paymentDate))
    };

    // 1. Update local state immediately for responsiveness
    const updatedPayments = { ...payments, [installmentNumber]: mergedData };
    setPayments(updatedPayments);

    // 2. Save to DB
    try {
      await db.savePayment(currentQuota.id, installmentNumber, mergedData);
    } catch (err: any) {
      console.error("Failed to save payment", err);
      if (db.isCloudEnabled()) {
        setConnectionError(err.message || "Erro ao salvar pagamento");
      }
      // Note: We keep the local state updated even if DB save fails for better UX,
      // but in a production app we might want to revert or show a retry button.
    }

    // 3. Re-generate Schedule
    const schedule = generateSchedule({ ...currentQuota, manualTransactions }, indices, updatedPayments);
    setInstallments(schedule);
    setConnectionError(null);

  }, [currentQuota, installments, indices, payments, manualTransactions]); // dependencies

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

  // --- Manual Transaction Actions ---
  const addManualTransaction = useCallback(async (transaction: ManualTransaction) => {
    if (!currentQuota) return;
    
    const updatedManualTransactions = [...manualTransactions, transaction].sort((a, b) => a.date.localeCompare(b.date));
    setManualTransactions(updatedManualTransactions);
    
    try {
      await db.saveManualTransaction(transaction);
      const schedule = generateSchedule({ ...currentQuota, manualTransactions: updatedManualTransactions }, indices, payments);
      setInstallments(schedule);
    } catch (err: any) {
      console.error("Failed to save manual transaction", err);
      // Revert local state on failure
      const original = await db.getManualTransactions(currentQuota.id);
      setManualTransactions(original);
      if (db.isCloudEnabled()) setConnectionError(err.message);
      throw err;
    }
  }, [currentQuota, manualTransactions, indices, payments]);

  const updateManualTransaction = useCallback(async (transaction: ManualTransaction) => {
    if (!currentQuota) return;
    
    const updatedManualTransactions = manualTransactions.map(t => t.id === transaction.id ? transaction : t);
    setManualTransactions(updatedManualTransactions);
    
    try {
      await db.saveManualTransaction(transaction);
      const schedule = generateSchedule({ ...currentQuota, manualTransactions: updatedManualTransactions }, indices, payments);
      setInstallments(schedule);
    } catch (err: any) {
      console.error("Failed to update manual transaction", err);
      const original = await db.getManualTransactions(currentQuota.id);
      setManualTransactions(original);
      if (db.isCloudEnabled()) setConnectionError(err.message);
      throw err;
    }
  }, [currentQuota, manualTransactions, indices, payments]);

  const deleteManualTransaction = useCallback(async (id: string) => {
    if (!currentQuota) return;
    
    const updatedManualTransactions = manualTransactions.filter(t => t.id !== id);
    setManualTransactions(updatedManualTransactions);
    
    try {
      await db.deleteManualTransaction(id);
      const schedule = generateSchedule({ ...currentQuota, manualTransactions: updatedManualTransactions }, indices, payments);
      setInstallments(schedule);
    } catch (err: any) {
      console.error("Failed to delete manual transaction", err);
      // Revert local state on failure
      const original = await db.getManualTransactions(currentQuota.id);
      setManualTransactions(original);
      if (db.isCloudEnabled()) setConnectionError(err.message);
      throw err;
    }
  }, [currentQuota, manualTransactions, indices, payments]);

  const addCreditUpdate = useCallback(async (update: CreditUpdate) => {
    try {
      await db.saveCreditUpdate(update);
      setAllCreditUpdates(prev => {
        const idx = prev.findIndex(u => u.id === update.id);
        if (idx >= 0) {
          const newArr = [...prev];
          newArr[idx] = update;
          return newArr;
        }
        return [...prev, update];
      });
    } catch (err: any) {
      console.error("Failed to save credit update", err);
      if (db.isCloudEnabled()) setConnectionError(err.message);
      throw err;
    }
  }, []);

  const deleteCreditUpdate = useCallback(async (id: string) => {
    try {
      await db.deleteCreditUpdate(id);
      setAllCreditUpdates(prev => prev.filter(u => u.id !== id));
    } catch (err: any) {
      console.error("Failed to delete credit update", err);
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
      payments,
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
      manualTransactions,
      addManualTransaction,
      updateManualTransaction,
      deleteManualTransaction,
      allCreditUpdates,
      addCreditUpdate,
      deleteCreditUpdate,
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
