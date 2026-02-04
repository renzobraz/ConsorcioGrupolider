
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { Quota, ProductType, CorrectionIndex, PaymentPlanType, BidBaseType } from '../types';
import { Save, ArrowLeft, Gavel, Loader, Calculator, Info, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const NewQuota = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { addQuota, updateQuota, getQuotaById, setCurrentQuota, administrators, companies, quotas } = useConsortium();
  const [isSaving, setIsSaving] = useState(false);
  const [displayCreditValue, setDisplayCreditValue] = useState('');

  const [formData, setFormData] = useState<Partial<Quota>>({
    productType: ProductType.VEHICLE,
    correctionIndex: CorrectionIndex.INCC_12, // Padrão agora é o anual
    paymentPlan: PaymentPlanType.NORMAL,
    bidBase: BidBaseType.CREDIT_ONLY,
    termMonths: 60,
    adminFeeRate: 15,
    reserveFundRate: 2,
    dueDay: 25,
    isContemplated: false,
    bidFree: 0,
    bidEmbedded: 0,
    bidTotal: 0,
    contemplationDate: '',
    administratorId: '',
    companyId: ''
  });

  useEffect(() => {
    if (id) {
      const existingQuota = getQuotaById(id);
      if (existingQuota) {
        setFormData({
            ...existingQuota,
            bidBase: existingQuota.bidBase || BidBaseType.CREDIT_ONLY,
            dueDay: existingQuota.dueDay || 25
        });
        if (existingQuota.creditValue) {
           setDisplayCreditValue(existingQuota.creditValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
      } else {
        navigate('/quotas');
      }
    }
  }, [id, getQuotaById, navigate]);

  useEffect(() => {
    const free = Number(formData.bidFree || 0);
    const embedded = Number(formData.bidEmbedded || 0);
    setFormData(prev => ({ ...prev, bidTotal: free + embedded }));
  }, [formData.bidFree, formData.bidEmbedded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'number') {
      finalValue = value === '' ? '' : parseFloat(value);
    } else if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    }
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleReserveFundBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
          setFormData(prev => ({ ...prev, reserveFundRate: parseFloat(val.toFixed(2)) }));
      }
  };

  const handleCreditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    if (rawValue === '') {
        setDisplayCreditValue('');
        setFormData(prev => ({ ...prev, creditValue: 0 }));
        return;
    }
    const numberValue = parseFloat(rawValue) / 100;
    setDisplayCreditValue(numberValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setFormData(prev => ({ ...prev, creditValue: numberValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.group || !formData.quotaNumber || !formData.creditValue) {
      alert("Preencha os campos obrigatórios");
      return;
    }

    // VERIFICAÇÃO DE DUPLICIDADE (Para novos cadastros)
    if (!id) {
      const exists = quotas.find(q => 
        q.group.trim().toLowerCase() === formData.group?.trim().toLowerCase() && 
        q.quotaNumber.trim().toLowerCase() === formData.quotaNumber?.trim().toLowerCase()
      );
      
      if (exists) {
        alert(`ERRO: Já existe uma cota cadastrada com Grupo ${formData.group} e Número ${formData.quotaNumber}. Verifique os dados para evitar duplicidade.`);
        return;
      }
    }

    setIsSaving(true);
    const quotaData: Quota = {
      id: id || crypto.randomUUID(),
      group: formData.group!,
      quotaNumber: formData.quotaNumber!,
      contractNumber: formData.contractNumber || '',
      creditValue: Number(formData.creditValue),
      adhesionDate: formData.adhesionDate || new Date().toISOString().split('T')[0],
      firstAssemblyDate: formData.firstAssemblyDate || new Date().toISOString().split('T')[0],
      termMonths: Number(formData.termMonths),
      adminFeeRate: Number(formData.adminFeeRate),
      reserveFundRate: Number(formData.reserveFundRate),
      productType: formData.productType as ProductType,
      dueDay: Number(formData.dueDay || 25),
      firstDueDate: formData.firstDueDate || new Date().toISOString().split('T')[0],
      correctionIndex: formData.correctionIndex as CorrectionIndex,
      paymentPlan: formData.paymentPlan as PaymentPlanType,
      isContemplated: Boolean(formData.isContemplated),
      contemplationDate: formData.contemplationDate,
      bidFree: Number(formData.bidFree || 0),
      bidEmbedded: Number(formData.bidEmbedded || 0),
      bidTotal: Number(formData.bidTotal || 0),
      bidBase: formData.bidBase as BidBaseType,
      administratorId: formData.administratorId || undefined,
      companyId: formData.companyId || undefined
    };
    try {
      if (id) {
        await updateQuota(quotaData);
        alert("Cota atualizada com sucesso!");
      } else {
        await addQuota(quotaData);
        navigate('/quotas');
      }
    } catch (error: any) {
      alert(error.message || "Erro ao salvar. Verifique a conexão.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoToSimulation = () => {
      if (id && formData.group) {
          handleSaveAndContinue();
      }
  };

  const handleSaveAndContinue = async () => {
      const quotaData: Quota = {
        id: id!,
        group: formData.group!,
        quotaNumber: formData.quotaNumber!,
        contractNumber: formData.contractNumber || '',
        creditValue: Number(formData.creditValue),
        adhesionDate: formData.adhesionDate || '',
        firstAssemblyDate: formData.firstAssemblyDate || '',
        termMonths: Number(formData.termMonths),
        adminFeeRate: Number(formData.adminFeeRate),
        reserveFundRate: Number(formData.reserveFundRate),
        productType: formData.productType as ProductType,
        dueDay: Number(formData.dueDay || 25),
        firstDueDate: formData.firstDueDate || '',
        correctionIndex: formData.correctionIndex as CorrectionIndex,
        paymentPlan: formData.paymentPlan as PaymentPlanType,
        isContemplated: Boolean(formData.isContemplated),
        contemplationDate: formData.contemplationDate,
        bidFree: Number(formData.bidFree || 0),
        bidEmbedded: Number(formData.bidEmbedded || 0),
        bidTotal: Number(formData.bidTotal || 0),
        bidBase: formData.bidBase as BidBaseType,
        administratorId: formData.administratorId,
        companyId: formData.companyId
      };
      await updateQuota(quotaData);
      setCurrentQuota(quotaData);
      navigate('/simulate');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">{id ? 'Editar Cota' : 'Cadastro de Nova Cota'}</h1>
        <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Grupo *</label>
              <input required name="group" value={formData.group || ''} type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Número da Cota *</label>
              <input required name="quotaNumber" value={formData.quotaNumber || ''} type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Contrato</label>
              <input name="contractNumber" value={formData.contractNumber || ''} type="text" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Administradora do Consórcio</label>
                  <select name="administratorId" value={formData.administratorId || ''} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                      <option value="">Selecione...</option>
                      {administrators.map(admin => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
                  </select>
              </div>
              <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Empresa Compradora</label>
                  <select name="companyId" value={formData.companyId || ''} onChange={handleChange} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none">
                      <option value="">Selecione...</option>
                       {companies.map(comp => <option key={comp.id} value={comp.id}>{comp.name}</option>)}
                  </select>
              </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Vencimento Sicredi (Fixo)</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">1º Vencimento *</label>
              <input required name="firstDueDate" type="date" value={formData.firstDueDate || ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Dia Fixo de Vencimento</label>
              <input required name="dueDay" type="number" min="1" max="31" value={formData.dueDay} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-700" onChange={handleChange} />
              <p className="text-[10px] text-slate-400 mt-1 italic">Padrão Sicredi: Dia 25 (Ajusta p/ dia útil)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Prazo (Meses)</label>
              <input required name="termMonths" type="number" min="1" value={formData.termMonths} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Financeiro e Plano</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Valor da Carta (R$) *</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="text-slate-500 sm:text-sm">R$</span></div>
                <input required name="creditValue" value={displayCreditValue} type="text" placeholder="0,00" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 pl-10 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleCreditChange} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Produto</label>
              <select name="productType" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.productType} onChange={handleChange}>
                <option value={ProductType.VEHICLE}>Veículo</option>
                <option value={ProductType.REAL_ESTATE}>Imóvel</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Taxa Adm (TA) %</label>
              <input required name="adminFeeRate" type="number" step="0.0001" placeholder="0.0000" value={formData.adminFeeRate} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Fundo Reserva (FR) %</label>
              <input required name="reserveFundRate" type="number" step="0.01" value={formData.reserveFundRate} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} onBlur={handleReserveFundBlur} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Índice Correção Anual</label>
              <select name="correctionIndex" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold" value={formData.correctionIndex} onChange={handleChange}>
                <option value={CorrectionIndex.INCC_12}>INCC (Acumulado 12m)</option>
                <option value={CorrectionIndex.IPCA_12}>IPCA (Acumulado 12m)</option>
                <option value={CorrectionIndex.INCC}>INCC (Mensal)</option>
                <option value={CorrectionIndex.IPCA}>IPCA (Mensal)</option>
              </select>
            </div>
             <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Plano Pagamento</label>
              <select name="paymentPlan" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.paymentPlan} onChange={handleChange}>
                <option value={PaymentPlanType.NORMAL}>Normal</option>
                <option value={PaymentPlanType.REDUZIDA}>Parcela Reduzida (50%)</option>
                <option value={PaymentPlanType.SEMESTRAL}>Parcela Semestral</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mb-8 bg-emerald-50 p-6 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-2 mb-4 border-b border-emerald-200 pb-2">
            <Gavel className="text-emerald-600" size={20} />
            <h2 className="text-lg font-semibold text-emerald-900">Contemplação e Lances</h2>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center gap-8 mb-6">
             <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" name="isContemplated" checked={formData.isContemplated} onChange={handleChange} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ms-3 text-sm font-medium text-slate-900">Cota Contemplada?</span>
              </label>

              <div className="flex-1">
                  <label className="block text-xs font-bold text-emerald-700 uppercase mb-1 flex items-center gap-1">
                      Base de Cálculo do Percentual do Lance
                  </label>
                  <select 
                    name="bidBase" 
                    value={formData.bidBase} 
                    onChange={handleChange}
                    className="w-full bg-white border border-emerald-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                      <option value={BidBaseType.CREDIT_ONLY}>Valor da Carta (Crédito Líquido)</option>
                      <option value={BidBaseType.TOTAL_PROJECT}>Valor Total (Crédito + Taxa Adm + F. Reserva)</option>
                  </select>
              </div>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-4 gap-6 transition-all duration-300 ${formData.isContemplated ? 'opacity-100' : 'opacity-50 grayscale'}`}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data Contemplação</label>
              <input name="contemplationDate" type="date" disabled={!formData.isContemplated} value={formData.contemplationDate || ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lance Livre (R$)</label>
              <input name="bidFree" type="number" step="0.01" value={formData.bidFree || 0} disabled={!formData.isContemplated} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lance Embutido (R$)</label>
              <input name="bidEmbedded" type="number" step="0.01" value={formData.bidEmbedded || 0} disabled={!formData.isContemplated} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
            </div>
            <div>
               <label className="block text-sm font-medium text-slate-700 mb-1">Valor Total Lance</label>
               <div className="w-full bg-emerald-100 border border-emerald-200 rounded-lg p-2.5 font-bold text-emerald-800 text-right">
                 {formatCurrency(formData.bidTotal || 0)}
               </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Informações de Adesão</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div><label className="block text-sm font-medium text-slate-600 mb-1">Data Adesão</label><input name="adhesionDate" type="date" value={formData.adhesionDate || ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} /></div>
             <div><label className="block text-sm font-medium text-slate-600 mb-1">Data 1ª Assembleia</label><input name="firstAssemblyDate" type="date" value={formData.firstAssemblyDate || ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} /></div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3">
          <button type="button" disabled={isSaving} onClick={() => navigate('/quotas')} className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">Cancelar</button>
          {id && <button type="button" onClick={handleGoToSimulation} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-sm transition-colors flex items-center gap-2"><Calculator size={18} /> Simulação & Pagamentos</button>}
          <button type="submit" disabled={isSaving} className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50">{isSaving ? <Loader className="animate-spin" size={18} /> : <Save size={18} />} {id ? 'Atualizar Cota' : 'Salvar Cota'}</button>
        </div>
      </form>
    </div>
  );
};

export default NewQuota;
