
// Fix React import from named to default export
import React, { useState, useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';
import { Pencil, Search, Gavel, TrendingUp, Calculator, X, Calendar, Building2, Filter, CheckCircle, Edit3, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PaymentStatus } from '../types';

const Simulation = () => {
  const { quotas, currentQuota, setCurrentQuota, installments, updateInstallmentPayment, companies, administrators, indices, globalFilters, setGlobalFilters } = useConsortium();
  const navigate = useNavigate();
  
  const [searchText, setSearchText] = useState('');
  const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    status: PaymentStatus.PREVISTO,
    paymentDate: '',
    amount: 0,
    fc: 0,
    fr: 0,
    ta: 0,
    insurance: 0,
    amortization: 0,
    fine: 0,
    interest: 0
  });

  const openPaymentModal = (inst: any) => {
    setSelectedInstallment(inst);
    setPaymentFormData({
      status: inst.status || PaymentStatus.PAGO,
      paymentDate: inst.paymentDate ? inst.paymentDate.split('T')[0] : new Date().toISOString().split('T')[0],
      amount: (inst.realAmountPaid !== null && inst.realAmountPaid !== undefined) ? inst.realAmountPaid : (inst.totalInstallment || 0),
      fc: (inst.manualFC !== undefined && inst.manualFC !== null) ? inst.manualFC : (inst.commonFund || 0),
      fr: (inst.manualFR !== undefined && inst.manualFR !== null) ? inst.manualFR : (inst.reserveFund || 0),
      ta: (inst.manualTA !== undefined && inst.manualTA !== null) ? inst.manualTA : (inst.adminFee || 0),
      insurance: (inst.manualInsurance !== undefined && inst.manualInsurance !== null) ? inst.manualInsurance : (inst.insurance || 0),
      amortization: (inst.manualAmortization !== undefined && inst.manualAmortization !== null) ? inst.manualAmortization : (inst.amortization || 0),
      fine: inst.manualFine || 0,
      interest: inst.manualInterest || 0
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'status' || name === 'paymentDate') {
      setPaymentFormData(prev => ({ ...prev, [name]: value }));
    } else {
      // Handle numeric inputs
      const numValue = parseFloat(value.replace(',', '.'));
      setPaymentFormData(prev => {
        const newData = { ...prev, [name]: isNaN(numValue) ? 0 : numValue };
        // Auto-calculate total amount if a component value changes
        if (name !== 'amount') {
          newData.amount = newData.fc + newData.fr + newData.ta + newData.insurance + newData.amortization + newData.fine + newData.interest;
        }
        return newData;
      });
    }
  };

  const savePaymentModal = async () => {
    if (!selectedInstallment) return;
    
    try {
      await updateInstallmentPayment(selectedInstallment.installmentNumber, {
        status: paymentFormData.status,
        paymentDate: paymentFormData.paymentDate,
        amount: paymentFormData.amount,
        fc: paymentFormData.fc,
        fr: paymentFormData.fr,
        ta: paymentFormData.ta,
        insurance: paymentFormData.insurance,
        amortization: paymentFormData.amortization,
        fine: paymentFormData.fine,
        interest: paymentFormData.interest
      });
      
      setIsPaymentModalOpen(false);
      setSelectedInstallment(null);
    } catch (error) {
      console.error("Error saving payment:", error);
      // Optionally show an error message to the user here
    }
  };

  const filteredOptions = useMemo(() => {
    return quotas.filter(q => {
      const textMatch = (q.group || '').toLowerCase().includes(searchText.toLowerCase()) || (q.quotaNumber || '').toLowerCase().includes(searchText.toLowerCase());
      const companyMatch = globalFilters.companyId ? q.companyId === globalFilters.companyId : true;
      const adminMatch = globalFilters.administratorId ? q.administratorId === globalFilters.administratorId : true;
      const productMatch = globalFilters.productType ? q.productType === globalFilters.productType : true;
      let statusMatch = true;
      if (globalFilters.status === 'ACTIVE') statusMatch = !q.isContemplated;
      if (globalFilters.status === 'CONTEMPLATED') statusMatch = q.isContemplated;
      return textMatch && companyMatch && adminMatch && productMatch && statusMatch;
    });
  }, [quotas, searchText, globalFilters]);

  const todayStr = new Date().toISOString().split('T')[0];

  const currentDisplayCredit = useMemo(() => {
    if (currentQuota && installments.length > 0) {
        const pastOrPresent = installments.filter(i => i.dueDate.split('T')[0] <= todayStr);
        return pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || currentQuota.creditValue : installments[0].correctedCreditValue || currentQuota.creditValue;
    }
    return currentQuota?.creditValue || 0;
  }, [currentQuota, installments, todayStr]);

  const detailedSummary = useMemo(() => {
    const stats = {
        paid: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
        toPay: { fc: 0, fr: 0, ta: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 },
        counts: { total: 0 }
    };
    if (!currentQuota) return stats;

    installments.forEach(inst => {
        const isMatured = inst.dueDate.split('T')[0] <= todayStr;
        if (isMatured) {
            stats.paid.fc += inst.commonFund; stats.paid.fr += inst.reserveFund; stats.paid.ta += inst.adminFee;
            stats.paid.insurance += (inst.insurance || 0); stats.paid.amortization += (inst.amortization || 0);
            stats.paid.fine += (inst.manualFine || 0); stats.paid.interest += (inst.manualInterest || 0);
        } else {
            stats.toPay.fc += inst.commonFund; stats.toPay.fr += inst.reserveFund; stats.toPay.ta += inst.adminFee;
            stats.toPay.insurance += (inst.insurance || 0); stats.toPay.amortization += (inst.amortization || 0);
            stats.counts.total++;
        }
        if (inst.bidAmountApplied && inst.bidAmountApplied > 0) {
            stats.paid.fc += (inst.bidAbatementFC || 0); stats.paid.fr += (inst.bidAbatementFR || 0); stats.paid.ta += (inst.bidAbatementTA || 0);
        }
    });
    stats.paid.total = stats.paid.fc + stats.paid.fr + stats.paid.ta + stats.paid.insurance + stats.paid.amortization + stats.paid.fine + stats.paid.interest;
    stats.toPay.total = stats.toPay.fc + stats.toPay.fr + stats.toPay.ta + stats.toPay.insurance + stats.toPay.amortization;
    return stats;
  }, [currentQuota, installments, todayStr]);

  const footerTotals = useMemo(() => {
    const totals = installments.reduce((acc, inst) => {
        const bFC = (inst.bidEmbeddedAbatementFC || 0) + (inst.bidFreeAbatementFC || 0);
        const bTA = (inst.bidEmbeddedAbatementTA || 0) + (inst.bidFreeAbatementTA || 0);
        const bFR = (inst.bidEmbeddedAbatementFR || 0) + (inst.bidFreeAbatementFR || 0);
        
        const bFCP = (inst.bidEmbeddedPercentFC || 0) + (inst.bidFreePercentFC || 0);
        const bTAP = (inst.bidEmbeddedPercentTA || 0) + (inst.bidFreePercentTA || 0);
        const bFRP = (inst.bidEmbeddedPercentFR || 0) + (inst.bidFreePercentFR || 0);

        const totalLineValue = inst.totalInstallment + bFC + bTA + bFR;

        return {
            fc: acc.fc + inst.commonFund + bFC,
            fcPct: acc.fcPct + (inst.monthlyRateFC || 0) + bFCP,
            ta: acc.ta + inst.adminFee + bTA,
            taPct: acc.taPct + (inst.monthlyRateTA || 0) + bTAP,
            fr: acc.fr + inst.reserveFund + bFR,
            frPct: acc.frPct + (inst.monthlyRateFR || 0) + bFRP,
            insurance: acc.insurance + (inst.insurance || 0),
            amortization: acc.amortization + (inst.amortization || 0),
            fine: acc.fine + (inst.manualFine || 0),
            interest: acc.interest + (inst.manualInterest || 0),
            total: acc.total + totalLineValue
        };
    }, { fc: 0, fcPct: 0, ta: 0, taPct: 0, fr: 0, frPct: 0, insurance: 0, amortization: 0, fine: 0, interest: 0, total: 0 });

    return {
        ...totals,
        totalPct: totals.fcPct + totals.taPct + totals.frPct
    };
  }, [installments]);

  const handleEditClick = (id: number, field: string, value: number) => {
    setEditingCell({ id, field });
    setEditValue(value.toFixed(2).replace('.', ','));
  };

  const handleSaveEdit = (installmentNum: number) => {
    if (!editingCell) return;
    const val = parseFloat(editValue.replace(',', '.'));
    if (!isNaN(val)) {
        const update: any = {};
        if (editingCell.field === 'fc') update.fc = val;
        else if (editingCell.field === 'fr') update.fr = val;
        else if (editingCell.field === 'ta') update.ta = val;
        else if (editingCell.field === 'fine') update.fine = val;
        else if (editingCell.field === 'interest') update.interest = val;
        else if (editingCell.field === 'insurance') update.insurance = val;
        else if (editingCell.field === 'amortization') update.amortization = val;
        updateInstallmentPayment(installmentNum, update);
    }
    setEditingCell(null);
  };

  const renderEditableCell = (inst: any, field: string, value: number, isManual: boolean, rate?: number) => {
    const isEditing = editingCell?.id === inst.installmentNumber && editingCell?.field === field;
    if (isEditing) return (<td className="p-2 text-right"><input autoFocus type="text" className="w-full p-1 border border-blue-400 rounded text-right text-xs" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(inst.installmentNumber); if (e.key === 'Escape') setEditingCell(null); }} onBlur={() => handleSaveEdit(inst.installmentNumber)} /></td>);
    return (<td className={`p-2 text-right text-xs cursor-pointer hover:bg-slate-50 ${isManual ? 'text-blue-600 font-bold' : ''}`} onClick={() => handleEditClick(inst.installmentNumber, field, value)}><div className="flex flex-col items-end"><span>{formatCurrency(value)}</span><span className="text-[9px] text-slate-400">{rate ? rate.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + '%' : ''}</span></div></td>);
  };

  return (
    <div className="space-y-6">
      {/* Payment Modal */}
      {isPaymentModalOpen && selectedInstallment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle className="text-emerald-600" size={20} />
                Efetivar Parcela {selectedInstallment.installmentNumber}
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-200 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Status & Date */}
                <div className="space-y-4 md:col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Status do Pagamento</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                      <select
                        name="status"
                        value={paymentFormData.status}
                        onChange={handlePaymentFormChange}
                        className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      >
                        <option value={PaymentStatus.PREVISTO}>Previsto</option>
                        <option value={PaymentStatus.PAGO}>Pago</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Data do Pagamento</label>
                      <input
                        type="date"
                        name="paymentDate"
                        value={paymentFormData.paymentDate}
                        onChange={handlePaymentFormChange}
                        className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Principais</h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fundo Comum (FC)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="fc"
                        value={paymentFormData.fc}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Taxa de Administração (TA)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="ta"
                        value={paymentFormData.ta}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Fundo de Reserva (FR)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="fr"
                        value={paymentFormData.fr}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Values */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2 mb-3">Valores Adicionais</h4>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Seguro</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="insurance"
                        value={paymentFormData.insurance}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Amortização</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="amortization"
                        value={paymentFormData.amortization}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Multa</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          name="fine"
                          value={paymentFormData.fine}
                          onChange={handlePaymentFormChange}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Juros</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          name="interest"
                          value={paymentFormData.interest}
                          onChange={handlePaymentFormChange}
                          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-2 border-t border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">Valor Total Pago</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold text-sm">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        name="amount"
                        value={paymentFormData.amount}
                        onChange={handlePaymentFormChange}
                        className="w-full pl-9 pr-3 py-2 border-2 border-emerald-200 bg-emerald-50 rounded-md text-emerald-900 font-bold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={savePaymentModal}
                className="px-6 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Salvar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 print:hidden">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Calculator className="text-emerald-600" /> Simulador e Extrato</h2>
             {currentQuota && <button onClick={() => navigate(`/edit/${currentQuota.id}`)} className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 text-sm font-medium flex items-center gap-2"><Pencil size={16} /> Editar Cota</button>}
        </div>
        
        {/* FILTERS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
             {/* Search */}
             <div className="md:col-span-2 relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                 <input type="text" placeholder="Pesquisar..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500" />
             </div>
             
             {/* Company Filter */}
             <div className="md:col-span-2 relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.companyId || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, companyId: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Empresa</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
             </div>

             {/* Administrator Filter */}
             <div className="md:col-span-2 relative">
                <Gavel className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.administratorId || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, administratorId: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Administradora</option>
                    {administrators.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
             </div>

             {/* Product Filter */}
             <div className="md:col-span-2 relative">
                <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white truncate"
                    value={globalFilters.productType || ''}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, productType: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Produto</option>
                    <option value="VEICULO">Veículo</option>
                    <option value="IMOVEL">Imóvel</option>
                </select>
             </div>

             {/* Status Filter */}
             <div className="md:col-span-2 relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <select 
                    className="w-full pl-9 pr-2 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-1 focus:ring-emerald-500 appearance-none bg-white"
                    value={globalFilters.status}
                    onChange={(e) => {
                        setGlobalFilters({ ...globalFilters, status: e.target.value });
                        setCurrentQuota(null); // Reset selection
                    }}
                >
                    <option value="">Status</option>
                    <option value="CONTEMPLATED">Contempladas</option>
                    <option value="ACTIVE">Em Andamento</option>
                </select>
             </div>

             {/* Quota Select */}
             <div className="md:col-span-2">
                 <select 
                    className="w-full py-2 px-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md outline-none cursor-pointer" 
                    value={currentQuota?.id || ''} 
                    onChange={(e) => { const found = quotas.find(q => q.id === e.target.value); setCurrentQuota(found || null); }}
                >
                    <option value="">Cota ({filteredOptions.length})</option>
                    {filteredOptions.map(q => (
                        <option key={q.id} value={q.id}>
                            {q.group}-{q.quotaNumber}
                        </option>
                    ))}
                 </select>
             </div>
        </div>
      </div>

      {currentQuota && (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10px] uppercase sticky top-0 z-20">
                <tr>
                  <th className="p-2 text-center bg-slate-100 sticky left-0 z-30 w-10">P</th>
                  <th className="p-2 min-w-[70px]">Vencimento</th>
                  <th className="p-2 text-right">FC Mensal (%)</th>
                  <th className="p-2 text-right">TA Mensal (%)</th>
                  <th className="p-2 text-right">FR Mensal (%)</th>
                  <th className="p-2 text-right">Seguro</th>
                  <th className="p-2 text-right">Amort.</th>
                  <th className="p-2 text-right">Multa</th>
                  <th className="p-2 text-right">Juros</th>
                  <th className="p-2 text-right font-bold text-slate-800 bg-emerald-50/50">Vlr Pago (%)</th>
                  <th className="p-2 text-right border-l border-slate-200 bg-slate-50/80">Saldo FC (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo TA (%)</th>
                  <th className="p-2 text-right bg-slate-50/80">Saldo FR (%)</th>
                  <th className="p-2 text-right font-bold bg-slate-100 border-l border-slate-200">Saldo Total (%)</th>
                  <th className="p-2 text-center bg-slate-100 border-l border-slate-200 w-12">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {installments.map((inst) => (
                  <React.Fragment key={inst.installmentNumber}>
                  {inst.correctionApplied && (
                      <tr className="bg-blue-50 border-y border-blue-100">
                         <td className="p-2 text-center text-blue-600 sticky left-0 bg-blue-50 z-10"><TrendingUp size={12} className="mx-auto"/></td>
                         <td colSpan={14} className="p-2 text-blue-800 text-[10px] font-bold uppercase tracking-wide">
                            CORREÇÃO {inst.correctionIndexName}: {formatPercent((inst.correctionFactor || 0) * 100)} 
                            {inst.correctionCapApplied && (
                                <span className="ml-1 text-red-600 font-bold">
                                    (TETO APLICADO. ÍNDICE REAL: {formatPercent(inst.correctionRealRate || 0)})
                                </span>
                            )}
                            <span className="ml-2 font-normal opacity-75">(Crédito Base: {formatCurrency(inst.correctedCreditValue || 0)})</span>
                         </td>
                      </tr>
                  )}
                  {((inst.bidEmbeddedApplied ?? 0) > 0 || (inst.bidFreeApplied ?? 0) > 0) && (
                    <React.Fragment>
                      {inst.bidEmbeddedApplied! > 0 && (
                        <tr className="bg-amber-50 border-y border-amber-100/50">
                            <td className="p-2 text-center font-bold text-amber-700 sticky left-0 bg-amber-50 z-10"><Gavel size={14} className="mx-auto" /></td>
                            <td className="p-2 text-left font-bold text-amber-800 text-[9px] uppercase whitespace-nowrap">
                                <div>LANCE EMBUTIDO</div>
                                <div className="text-[8px] text-amber-600 font-medium flex items-center gap-0.5 mt-0.5">
                                    <Calendar size={8} /> {formatDate(inst.bidDate || '')}
                                </div>
                            </td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-amber-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidEmbeddedPercentFR?.toFixed(4)}%</span></div></td>
                            <td colSpan={4}></td>
                            <td className="p-2 text-right font-bold text-amber-900 bg-amber-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidEmbeddedApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidEmbeddedPercent?.toFixed(4)}%</span></div></td>
                            <td colSpan={5}></td>
                        </tr>
                      )}
                      {inst.bidFreeApplied! > 0 && (
                        <tr className="bg-orange-50 border-y border-orange-100/50">
                            <td className="p-2 text-center font-bold text-orange-700 sticky left-0 bg-orange-50 z-10"><Gavel size={14} className="mx-auto" /></td>
                            <td className="p-2 text-left font-bold text-orange-800 text-[9px] uppercase whitespace-nowrap">
                                <div>LANCE LIVRE</div>
                                <div className="text-[8px] text-orange-600 font-medium flex items-center gap-0.5 mt-0.5">
                                    <Calendar size={8} /> {formatDate(inst.bidDate || '')}
                                </div>
                            </td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFC || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFC?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementTA || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentTA?.toFixed(4)}%</span></div></td>
                            <td className="p-2 text-right text-orange-700 font-semibold text-[10px]"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeAbatementFR || 0)}</span><span className="text-[8px] font-normal">{inst.bidFreePercentFR?.toFixed(4)}%</span></div></td>
                            <td colSpan={4}></td>
                            <td className="p-2 text-right font-bold text-orange-900 bg-orange-100/30"><div className="flex flex-col items-end"><span>-{formatCurrency(inst.bidFreeApplied || 0)}</span><span className="text-[9px] font-black">{inst.bidFreePercent?.toFixed(4)}%</span></div></td>
                            <td colSpan={5}></td>
                        </tr>
                      )}
                    </React.Fragment>
                  )}
                  <tr className={`hover:bg-slate-50 transition-colors ${inst.status === 'PAGO' ? 'bg-emerald-50/30' : ''}`}>
                    <td className="p-2 text-center font-medium sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-100">
                      {inst.status === 'PAGO' ? <CheckCircle size={14} className="text-emerald-500 mx-auto" /> : inst.installmentNumber}
                    </td>
                    <td className="p-2 text-slate-500">
                      {formatDate(inst.dueDate)}
                      {inst.status === 'PAGO' && inst.paymentDate && (
                        <div className="text-[8px] text-emerald-600 font-medium">Pago: {formatDate(inst.paymentDate)}</div>
                      )}
                    </td>
                    {renderEditableCell(inst, 'fc', inst.commonFund, inst.manualFC !== undefined && inst.manualFC !== null, inst.monthlyRateFC)}
                    {renderEditableCell(inst, 'ta', inst.adminFee, inst.manualTA !== undefined && inst.manualTA !== null, inst.monthlyRateTA)}
                    {renderEditableCell(inst, 'fr', inst.reserveFund, inst.manualFR !== undefined && inst.manualFR !== null, inst.monthlyRateFR)}
                    {renderEditableCell(inst, 'insurance', inst.insurance || 0, inst.manualInsurance !== undefined && inst.manualInsurance !== null)}
                    {renderEditableCell(inst, 'amortization', inst.amortization || 0, inst.manualAmortization !== undefined && inst.manualAmortization !== null)}
                    {renderEditableCell(inst, 'fine', inst.manualFine || 0, inst.manualFine !== undefined && inst.manualFine !== null)}
                    {renderEditableCell(inst, 'interest', inst.manualInterest || 0, inst.manualInterest !== undefined && inst.manualInterest !== null)}
                    <td className="p-2 text-right font-bold text-emerald-800 bg-emerald-50/20"><div className="flex flex-col items-end"><span>{formatCurrency(inst.totalInstallment || 0)}</span><span className="text-[8px] text-slate-400">{( (inst.totalInstallment / (inst.correctedCreditValue || 1) ) * 100).toFixed(4)}%</span></div></td>
                    <td className="p-2 text-right border-l border-slate-100"><span>{formatCurrency(inst.balanceFC)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFC.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceTA)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceTA.toFixed(4)}%</span></td>
                    <td className="p-2 text-right"><span>{formatCurrency(inst.balanceFR)}</span><br/><span className="text-[8px] text-slate-400">{inst.percentBalanceFR.toFixed(4)}%</span></td>
                    <td className="p-2 text-right font-bold text-slate-800 bg-slate-100/50 border-l border-slate-200"><span>{formatCurrency(inst.balanceTotal)}</span><br/><span className="text-[9px] text-slate-500 font-black">{inst.percentBalanceTotal.toFixed(4)}%</span></td>
                    <td className="p-2 text-center border-l border-slate-200">
                      <button 
                        onClick={() => openPaymentModal(inst)}
                        className={`flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-colors text-[10px] font-medium w-full ${inst.status === 'PAGO' ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
                        title={inst.status === 'PAGO' ? 'Editar Pagamento' : 'Efetivar Parcela'}
                      >
                        {inst.status === 'PAGO' ? <><Edit3 size={12} /> Editar</> : <><CheckCircle size={12} /> Efetivar</>}
                      </button>
                    </td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-slate-200 text-slate-800 font-bold text-[10px] uppercase border-t-2 border-slate-300 sticky bottom-0 z-20">
                  <tr>
                      <td className="p-2 text-center bg-slate-300 sticky left-0 z-30" colSpan={2}>Soma Final</td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fc)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.fcPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.ta)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.taPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.fr)}</span><span className="text-emerald-700 text-[10px]">{footerTotals.frPct.toFixed(4)}%</span></div></td>
                      <td className="p-2 text-right text-slate-700">{formatCurrency(footerTotals.insurance)}</td>
                      <td className="p-2 text-right text-slate-700">{formatCurrency(footerTotals.amortization)}</td>
                      <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.fine)}</td>
                      <td className="p-2 text-right text-red-700">{formatCurrency(footerTotals.interest)}</td>
                      <td className="p-2 text-right bg-emerald-100 font-black text-emerald-900"><div className="flex flex-col items-end"><span>{formatCurrency(footerTotals.total)}</span><span className="text-[10px]">{footerTotals.totalPct.toFixed(4)}%</span></div></td>
                      <td colSpan={5} className="p-2 text-right text-[8px] text-slate-500 italic lowercase font-normal">* fechamento 100% FC + Taxas</td>
                  </tr>
              </tfoot>
            </table>
          </div>
      </div>
      )}

      {currentQuota && (
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-12 print:border-none">
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo Pago (Histórico)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.paid.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.paid.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.paid.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{detailedSummary.paid.insurance.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{detailedSummary.paid.amortization.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL PAGO</span> <div className="flex gap-12"><span>{detailedSummary.paid.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{(detailedSummary.paid.total / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                </div>
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-slate-700 uppercase border-b border-slate-300 pb-1">Resumo a Pagar (Saldo)</h3>
                    <div className="space-y-1.5 text-xs font-medium text-slate-800">
                        <div className="flex justify-between items-center"><span>Fundo Comum:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fc.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fc / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Taxa Adm:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.ta.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.ta / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Fundo Reserva:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.fr.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right">{(detailedSummary.toPay.fr / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                        <div className="flex justify-between items-center"><span>Seguro:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.insurance.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="flex justify-between items-center"><span>Amortização:</span> <div className="flex gap-12"><span>{detailedSummary.toPay.amortization.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="font-black w-16 text-right"></span></div></div>
                        <div className="pt-2 border-t border-dotted border-slate-400 flex justify-between items-center font-black text-sm"><span>TOTAL A VENCER</span> <div className="flex gap-12"><span>{detailedSummary.toPay.total.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span> <span className="w-16 text-right">{(detailedSummary.toPay.total / (currentDisplayCredit || 1) * 100).toFixed(4)}%</span></div></div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-300 flex justify-between text-xs font-black">
                        <span>Qtde Parcelas Restantes:</span>
                        <span className="text-sm">{detailedSummary.counts.total.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
          </div>
      )}
    </div>
  );
};

export default Simulation;
