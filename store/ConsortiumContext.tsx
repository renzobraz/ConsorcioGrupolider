
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Quota, PaymentInstallment, MonthlyIndex, Administrator, Company, CreditUsageEntry } from '../types';
import { generateSchedule } from '../services/calculationService';
import { db } from '../services/database';

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

  // Helper to merge manual payments and recalculate balances
  const mergeScheduleWithPayments = (baseSchedule: PaymentInstallment[], savedPayments: Record<number, any>) => {
      let accDiffFC = 0;
      let accDiffFR = 0;
      let accDiffTA = 0;

      return baseSchedule.map(inst => {
          const paymentData = savedPayments[inst.installmentNumber];
          
          // 1. Determine Final Payment Values (Manual overrides Calculated)
          const finalFC = paymentData && paymentData.manualFC !== undefined ? paymentData.manualFC : inst.commonFund;
          const finalFR = paymentData && paymentData.manualFR !== undefined ? paymentData.manualFR : inst.reserveFund;
          const finalTA = paymentData && paymentData.manualTA !== undefined ? paymentData.manualTA : inst.adminFee;
          
          const finalFine = paymentData?.manualFine || inst.manualFine || 0;
          const finalInterest = paymentData?.manualInterest || inst.manualInterest || 0;
          const finalAmountPaid = paymentData?.amount ?? null; // Keep null if not paid

          // 2. Calculate Difference (Original Calculated - Manual)
          // Positive Diff = Calculated was 100, Manual was 50 -> Diff 50. Debt INCREASES by 50.
          // Negative Diff = Calculated was 100, Manual was 150 -> Diff -50. Debt DECREASES by 50.
          // Only apply diff if there IS a manual value override
          if (paymentData && paymentData.manualFC !== undefined) {
              accDiffFC += (inst.commonFund - finalFC);
          }
          if (paymentData && paymentData.manualFR !== undefined) {
              accDiffFR += (inst.reserveFund - finalFR);
          }
          if (paymentData && paymentData.manualTA !== undefined) {
              accDiffTA += (inst.adminFee - finalTA);
          }

          // 3. Adjust Balances
          // inst.balance comes from generation assuming standard payment. 
          // We add the accumulated difference to correct it based on manual history.
          const adjBalanceFC = Math.max(0, inst.balanceFC + accDiffFC);
          const adjBalanceFR = Math.max(0, inst.balanceFR + accDiffFR);
          const adjBalanceTA = Math.max(0, inst.balanceTA + accDiffTA);
          const adjBalanceTotal = adjBalanceFC + adjBalanceFR + adjBalanceTA;

          // 4. Recalculate Percentages relative to Credit Value
          const currentCredit = inst.correctedCreditValue || 1;
          const percentBalanceFC = (adjBalanceFC / currentCredit) * 100;
          const percentBalanceFR = (adjBalanceFR / currentCredit) * 100;
          const percentBalanceTA = (adjBalanceTA / currentCredit) * 100;
          const percentBalanceTotal = (adjBalanceTotal / currentCredit) * 100;

          return {
              ...inst,
              realAmountPaid: finalAmountPaid,
              isPaid: !!paymentData,
              
              // Manual flags/values
              manualFC: paymentData?.manualFC,
              manualFR: paymentData?.manualFR,
              manualTA: paymentData?.manualTA,
              manualFine: paymentData?.manualFine,
              manualInterest: paymentData?.manualInterest,

              // Displayed Values (Overrides)
              commonFund: finalFC,
              reserveFund: finalFR,
              adminFee: finalTA,
              
              // Total Calculation
              totalInstallment: finalFC + finalFR + finalTA + finalFine + finalInterest,

              // Adjusted Balances
              balanceFC: adjBalanceFC,
              balanceFR: adjBalanceFR,
              balanceTA: adjBalanceTA,
              balanceTotal: adjBalanceTotal,

              // Adjusted Percentages
              percentBalanceFC,
              percentBalanceFR,
              percentBalanceTA,
              percentBalanceTotal
          };
      });
  };

  const setCurrentQuota = useCallback(async (quota: Quota | null) => {
    setCurrentQuotaState(quota);
    if (quota) {
      setIsLoading(true);
      
      try {
        const baseSchedule = generateSchedule(quota, indices);
        let savedPayments: Record<number, any> = {};
        try {
           savedPayments = await db.getPayments(quota.id);
        } catch(e) {
           console.warn("Could not load payments", e);
        }
        
        // Merge and Recalculate Balances
        const mergedSchedule = mergeScheduleWithPayments(baseSchedule, savedPayments);
        setInstallments(mergedSchedule);

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


  const updateInstallmentPayment = useCallback(async (installmentNumber: number, data: { amount?: number, fc?: number, fr?: number, ta?: number, fine?: number, interest?: number }) => {
    if (!currentQuota) return;

    // 1. Update DB first
    try {
      await db.savePayment(currentQuota.id, installmentNumber, data);
    } catch (err: any) {
      console.error("Failed to save payment", err);
      if (db.isCloudEnabled()) {
        setConnectionError(err.message || "Erro ao salvar pagamento");
      }
      return; // Stop if save fails
    }

    // 2. Re-generate Schedule and Re-Merge to ensure balances propagate correctly
    // We cannot just update the single row in 'installments' state because 
    // changing FC in row X affects Balances in row X+1, X+2, etc.
    
    // Construct updated payments map from current installments + new data
    const updatedPaymentsMap: Record<number, any> = {};
    installments.forEach(inst => {
        if (inst.isPaid || inst.manualFC !== undefined || inst.manualFR !== undefined || inst.manualTA !== undefined) {
            updatedPaymentsMap[inst.installmentNumber] = {
                amount: inst.realAmountPaid,
                manualFC: inst.manualFC,
                manualFR: inst.manualFR,
                manualTA: inst.manualTA,
                manualFine: inst.manualFine,
                manualInterest: inst.manualInterest
            };
        }
    });

    // Merge new data into map
    const existing = updatedPaymentsMap[installmentNumber] || {};
    updatedPaymentsMap[installmentNumber] = {
        amount: data.amount !== undefined ? data.amount : existing.amount,
        manualFC: data.fc !== undefined ? data.fc : existing.manualFC,
        manualFR: data.fr !== undefined ? data.fr : existing.manualFR,
        manualTA: data.ta !== undefined ? data.ta : existing.manualTA,
        manualFine: data.fine !== undefined ? data.fine : existing.manualFine,
        manualInterest: data.interest !== undefined ? data.interest : existing.manualInterest
    };

    // Re-run generation logic
    const baseSchedule = generateSchedule(currentQuota, indices);
    const mergedSchedule = mergeScheduleWithPayments(baseSchedule, updatedPaymentsMap);
    
    setInstallments(mergedSchedule);

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

  return (
    <ConsortiumContext.Provider value={{ 
      quotas, 
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
      refreshData
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
