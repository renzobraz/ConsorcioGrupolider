
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { Quota, ProductType, CorrectionIndex, PaymentPlanType, BidBaseType, CalculationMethod, IndexTableEntry } from '../types';
import { Save, ArrowLeft, Gavel, Loader, Calculator, Info, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { formatCurrency, calculateIndexReferenceMonth, getTodayStr } from '../utils/formatters';

const NewQuota = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const replicateId = searchParams.get('replicate');
  const { addQuota, updateQuota, getQuotaById, setCurrentQuota, administrators, companies, quotas } = useConsortium();
  const [isSaving, setIsSaving] = useState(false);
  const [displayCreditValue, setDisplayCreditValue] = useState('');
  const [isManualMonth, setIsManualMonth] = useState(false);

  const [formData, setFormData] = useState<Partial<Quota>>({
    productType: ProductType.VEHICLE,
    correctionIndex: CorrectionIndex.INCC_12, // Padrão agora é o anual
    paymentPlan: PaymentPlanType.NORMAL,
    bidBase: BidBaseType.CREDIT_ONLY,
    calculationMethod: CalculationMethod.LINEAR,
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
    companyId: '',
    acquiredFromThirdParty: false,
    assumedInstallment: 1,
    prePaidFCPercent: 0,
    acquisitionCost: 0,
    indexTable: [],
    recalculateBalanceAfterHalfOrContemplation: false,
    anticipateCorrectionMonth: false,
    prioritizeFeesInBid: false,
    indexReferenceMonth: 1,
    creditManualAdjustment: 0,
    bidFreeCorrection: 0,
    isDrawContemplation: false,
    stopCreditCorrection: true // Padrão é parar a correção após contemplação
  });

  useEffect(() => {
    const targetId = id || replicateId;
    if (targetId) {
      const existingQuota = getQuotaById(targetId);
      if (existingQuota) {
        const dataToSet: Partial<Quota> = {
            ...existingQuota,
            bidBase: existingQuota.bidBase || BidBaseType.CREDIT_ONLY,
            dueDay: existingQuota.dueDay || 25,
            calculationMethod: existingQuota.calculationMethod || CalculationMethod.LINEAR,
            acquiredFromThirdParty: existingQuota.acquiredFromThirdParty || false,
            indexTable: existingQuota.indexTable || [],
            recalculateBalanceAfterHalfOrContemplation: existingQuota.recalculateBalanceAfterHalfOrContemplation || false,
            anticipateCorrectionMonth: existingQuota.anticipateCorrectionMonth || false,
            prioritizeFeesInBid: existingQuota.prioritizeFeesInBid || false,
            isDrawContemplation: existingQuota.isDrawContemplation || false,
            stopCreditCorrection: existingQuota.stopCreditCorrection !== undefined ? existingQuota.stopCreditCorrection : true
        };

        if (replicateId && !id) {
          // Limpar campos únicos ao replicar
          delete dataToSet.id;
          dataToSet.group = '';
          dataToSet.quotaNumber = '';
          dataToSet.contractNumber = '';
        }

        setFormData(dataToSet);
        if (existingQuota.creditValue) {
           setDisplayCreditValue(existingQuota.creditValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
        // Se já existe no banco (ou estamos replicando de um), marcamos como manual para não sobrescrever com o cálculo automático
        if (existingQuota.indexReferenceMonth !== undefined && existingQuota.indexReferenceMonth !== null) {
          setIsManualMonth(true);
        }
      } else {
        navigate('/quotas');
      }
    }
  }, [id, replicateId, getQuotaById, navigate]);

  useEffect(() => {
    if (formData.isDrawContemplation) {
      setFormData(prev => ({ ...prev, bidFree: 0, bidEmbedded: 0, bidTotal: 0 }));
    }
  }, [formData.isDrawContemplation]);

  useEffect(() => {
    const free = Number(formData.bidFree || 0);
    const embedded = Number(formData.bidEmbedded || 0);
    setFormData(prev => ({ ...prev, bidTotal: free + embedded }));
  }, [formData.bidFree, formData.bidEmbedded]);

  useEffect(() => {
    if (isManualMonth) return;
    
    const anchorDate = formData.firstAssemblyDate || formData.adhesionDate || formData.firstDueDate;
    if (anchorDate) {
      const refMonth = calculateIndexReferenceMonth(anchorDate);
      setFormData(prev => ({ ...prev, indexReferenceMonth: refMonth }));
    }
  }, [formData.firstAssemblyDate, formData.adhesionDate, formData.firstDueDate, isManualMonth]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (name === 'indexReferenceMonth') {
      setIsManualMonth(true);
    }

    let finalValue: any = value;
    if (type === 'number') {
      finalValue = value === '' ? '' : parseFloat(value);
      if (Number.isNaN(finalValue)) finalValue = '';
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

  const handleAddIndexTableRow = () => {
      setFormData(prev => ({
          ...prev,
          indexTable: [
              ...(prev.indexTable || []),
              { id: crypto.randomUUID(), startInstallment: 1, endInstallment: 1, rateFC: 0, rateTA: 0, rateFR: 0 }
          ]
      }));
  };

  const handleRemoveIndexTableRow = (id: string) => {
      setFormData(prev => ({
          ...prev,
          indexTable: (prev.indexTable || []).filter(row => row.id !== id)
      }));
  };

  const handleIndexTableChange = (id: string, field: keyof IndexTableEntry, value: number) => {
      setFormData(prev => ({
          ...prev,
          indexTable: (prev.indexTable || []).map(row => 
              row.id === id ? { ...row, [field]: value } : row
          )
      }));
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

    if (formData.calculationMethod === CalculationMethod.INDEX_TABLE && formData.indexTable && formData.indexTable.length > 0 && !formData.recalculateBalanceAfterHalfOrContemplation) {
        let totalFC = 0;
        let totalTA = 0;
        let totalFR = 0;
        
        formData.indexTable.forEach(row => {
            const numInstallments = row.endInstallment - row.startInstallment + 1;
            if (numInstallments > 0) {
                totalFC += numInstallments * (row.rateFC || 0);
                totalTA += numInstallments * (row.rateTA || 0);
                totalFR += numInstallments * (row.rateFR || 0);
            }
        });

        const epsilon = 0.001;
        if (Math.abs(totalFC - 100) > epsilon || 
            Math.abs(totalTA - (formData.adminFeeRate || 0)) > epsilon || 
            Math.abs(totalFR - (formData.reserveFundRate || 0)) > epsilon) {
            
            alert(`Atenção: A soma da Tabela de Índices está incorreta!\n\n` +
                  `FC: ${totalFC.toFixed(4)}% (Esperado: 100%)\n` +
                  `TA: ${totalTA.toFixed(4)}% (Esperado: ${formData.adminFeeRate}%)\n` +
                  `FR: ${totalFR.toFixed(4)}% (Esperado: ${formData.reserveFundRate}%)\n\n` +
                  `Por favor, corrija os valores antes de salvar.`);
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
      adhesionDate: formData.adhesionDate || getTodayStr(),
      firstAssemblyDate: formData.firstAssemblyDate || getTodayStr(),
      termMonths: Number(formData.termMonths),
      adminFeeRate: Number(formData.adminFeeRate),
      reserveFundRate: Number(formData.reserveFundRate),
      productType: formData.productType as ProductType,
      dueDay: Number(formData.dueDay || 25),
      firstDueDate: formData.firstDueDate || getTodayStr(),
      correctionIndex: formData.correctionIndex as CorrectionIndex,
      paymentPlan: formData.paymentPlan as PaymentPlanType,
      calculationMethod: formData.calculationMethod as CalculationMethod,
      indexTable: formData.indexTable,
      acquiredFromThirdParty: Boolean(formData.acquiredFromThirdParty),
      assumedInstallment: Number(formData.assumedInstallment || 1),
      prePaidFCPercent: Number(formData.prePaidFCPercent || 0),
      acquisitionCost: Number(formData.acquisitionCost || 0),
      isContemplated: Boolean(formData.isContemplated),
      contemplationDate: formData.contemplationDate,
      bidFree: Number(formData.bidFree || 0),
      bidEmbedded: Number(formData.bidEmbedded || 0),
      bidTotal: Number(formData.bidTotal || 0),
      bidBase: formData.bidBase as BidBaseType,
      creditManualAdjustment: Number(formData.creditManualAdjustment || 0),
      bidFreeCorrection: Number(formData.bidFreeCorrection || 0),
      administratorId: formData.administratorId || undefined,
      companyId: formData.companyId || undefined,
      correctionRateCap: formData.correctionRateCap ? Number(formData.correctionRateCap) : undefined,
      recalculateBalanceAfterHalfOrContemplation: Boolean(formData.recalculateBalanceAfterHalfOrContemplation),
      anticipateCorrectionMonth: Boolean(formData.anticipateCorrectionMonth),
      prioritizeFeesInBid: Boolean(formData.prioritizeFeesInBid),
      indexReferenceMonth: Number(formData.indexReferenceMonth || 1)
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
        calculationMethod: formData.calculationMethod as CalculationMethod,
        indexTable: formData.indexTable,
        acquiredFromThirdParty: Boolean(formData.acquiredFromThirdParty),
        assumedInstallment: Number(formData.assumedInstallment || 1),
        prePaidFCPercent: Number(formData.prePaidFCPercent || 0),
        acquisitionCost: Number(formData.acquisitionCost || 0),
        isContemplated: Boolean(formData.isContemplated),
        contemplationDate: formData.contemplationDate,
        bidFree: Number(formData.bidFree || 0),
        bidEmbedded: Number(formData.bidEmbedded || 0),
        bidTotal: Number(formData.bidTotal || 0),
        bidBase: formData.bidBase as BidBaseType,
        creditManualAdjustment: Number(formData.creditManualAdjustment || 0),
        bidFreeCorrection: Number(formData.bidFreeCorrection || 0),
        administratorId: formData.administratorId,
        companyId: formData.companyId,
        correctionRateCap: formData.correctionRateCap ? Number(formData.correctionRateCap) : undefined,
        recalculateBalanceAfterHalfOrContemplation: Boolean(formData.recalculateBalanceAfterHalfOrContemplation),
        anticipateCorrectionMonth: Boolean(formData.anticipateCorrectionMonth),
        prioritizeFeesInBid: Boolean(formData.prioritizeFeesInBid),
        indexReferenceMonth: Number(formData.indexReferenceMonth || 1)
      };
      await updateQuota(quotaData);
      setCurrentQuota(quotaData);
      navigate('/simulate');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          {id ? 'Editar Cota' : replicateId ? 'Replicar Cota' : 'Cadastro de Nova Cota'}
        </h1>
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
              <input required name="dueDay" type="number" min="1" max="31" value={formData.dueDay ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-emerald-700" onChange={handleChange} />
              <p className="text-[10px] text-slate-400 mt-1 italic">Padrão Sicredi: Dia 25 (Ajusta p/ dia útil)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Prazo (Meses)</label>
              <input required name="termMonths" type="number" min="1" value={formData.termMonths ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Mês Ref. Índice Reajuste</label>
              <input required name="indexReferenceMonth" type="number" min="1" max="12" value={formData.indexReferenceMonth ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-blue-700" onChange={handleChange} />
              <p className="text-[10px] text-slate-400 mt-1 italic">
                {isManualMonth ? 'Definido manualmente' : 'Calculado automaticamente (Regra M-2)'}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Financeiro e Plano</h2>
          
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-1">
                      <label className="block text-sm font-bold text-slate-700 mb-2">Método de Cálculo das Parcelas</label>
                      <div className="flex gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="calculationMethod" value={CalculationMethod.LINEAR} checked={formData.calculationMethod === CalculationMethod.LINEAR} onChange={handleChange} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300" />
                              <span className="text-sm text-slate-700">Linear (Padrão)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="calculationMethod" value={CalculationMethod.INDEX_TABLE} checked={formData.calculationMethod === CalculationMethod.INDEX_TABLE} onChange={handleChange} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300" />
                              <span className="text-sm text-slate-700">Tabela de Índices (Degrau)</span>
                          </label>
                      </div>
                  </div>
                  <div className="flex-1">
                      <label className="flex items-center gap-2 cursor-pointer p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <input type="checkbox" name="acquiredFromThirdParty" checked={formData.acquiredFromThirdParty} onChange={handleChange} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300" />
                          <span className="text-sm font-bold text-slate-700">Cota Adquirida de Terceiros (Transferência)</span>
                      </label>
                  </div>
              </div>
          </div>

          {formData.acquiredFromThirdParty && (
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-6">
                  <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><Info size={16} /> Dados da Transferência</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">Parcela Inicial Assumida</label>
                          <input required={formData.acquiredFromThirdParty} name="assumedInstallment" type="number" min="1" value={formData.assumedInstallment ?? ''} className="w-full bg-white border border-amber-300 rounded p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none" onChange={handleChange} />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">% Fundo Comum Pago (Ex-dono)</label>
                          <input required={formData.acquiredFromThirdParty} name="prePaidFCPercent" type="number" step="0.0001" value={formData.prePaidFCPercent ?? ''} className="w-full bg-white border border-amber-300 rounded p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none" onChange={handleChange} />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">Valor Pago (Ágio/Repasse) R$</label>
                          <input name="acquisitionCost" type="number" step="0.01" value={formData.acquisitionCost ?? ''} className="w-full bg-white border border-amber-300 rounded p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none" onChange={handleChange} />
                      </div>
                  </div>
              </div>
          )}

          {formData.calculationMethod === CalculationMethod.INDEX_TABLE && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
                  <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2"><Calculator size={16} /> Tabela de Índices (Percentuais Mensais)</h3>
                      <button type="button" onClick={handleAddIndexTableRow} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center gap-1"><Plus size={14} /> Adicionar Faixa</button>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                          <thead className="bg-blue-100 text-blue-800">
                              <tr>
                                  <th className="p-2 rounded-tl">De (Parc)</th>
                                  <th className="p-2">Até (Parc)</th>
                                  <th className="p-2">% Fundo Comum</th>
                                  <th className="p-2">% Taxa Adm</th>
                                  <th className="p-2">% Fundo Reserva</th>
                                  <th className="p-2 rounded-tr w-10"></th>
                              </tr>
                          </thead>
                          <tbody>
                              {formData.indexTable?.map((row, idx) => (
                                  <tr key={row.id} className="border-b border-blue-100 bg-white">
                                      <td className="p-1"><input type="number" min="1" value={isNaN(row.startInstallment) ? '' : row.startInstallment} onChange={(e) => handleIndexTableChange(row.id, 'startInstallment', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded p-1" /></td>
                                      <td className="p-1"><input type="number" min="1" value={isNaN(row.endInstallment) ? '' : row.endInstallment} onChange={(e) => handleIndexTableChange(row.id, 'endInstallment', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded p-1" /></td>
                                      <td className="p-1"><input type="number" step="0.0001" value={isNaN(row.rateFC) ? '' : row.rateFC} onChange={(e) => handleIndexTableChange(row.id, 'rateFC', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded p-1" /></td>
                                      <td className="p-1"><input type="number" step="0.0001" value={isNaN(row.rateTA) ? '' : row.rateTA} onChange={(e) => handleIndexTableChange(row.id, 'rateTA', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded p-1" /></td>
                                      <td className="p-1"><input type="number" step="0.0001" value={isNaN(row.rateFR) ? '' : row.rateFR} onChange={(e) => handleIndexTableChange(row.id, 'rateFR', parseFloat(e.target.value))} className="w-full border border-slate-200 rounded p-1" /></td>
                                      <td className="p-1 text-center">
                                          <button type="button" onClick={() => handleRemoveIndexTableRow(row.id)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={14} /></button>
                                      </td>
                                  </tr>
                              ))}
                              {(!formData.indexTable || formData.indexTable.length === 0) && (
                                  <tr><td colSpan={6} className="p-4 text-center text-slate-500 bg-white">Nenhuma faixa cadastrada. Adicione faixas para definir os percentuais.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
                  {formData.indexTable && formData.indexTable.length > 0 && (
                      <div className="mt-3 text-xs text-blue-700 bg-blue-100 p-2 rounded flex justify-between">
                          <span><strong>Total FC:</strong> {formData.indexTable.reduce((acc, row) => acc + ((row.rateFC || 0) * ((row.endInstallment || 0) - (row.startInstallment || 0) + 1)), 0).toFixed(4)}%</span>
                          <span><strong>Total TA:</strong> {formData.indexTable.reduce((acc, row) => acc + ((row.rateTA || 0) * ((row.endInstallment || 0) - (row.startInstallment || 0) + 1)), 0).toFixed(4)}%</span>
                          <span><strong>Total FR:</strong> {formData.indexTable.reduce((acc, row) => acc + ((row.rateFR || 0) * ((row.endInstallment || 0) - (row.startInstallment || 0) + 1)), 0).toFixed(4)}%</span>
                      </div>
                  )}
                  <div className="mt-4">
                      <label className="inline-flex items-center cursor-pointer">
                          <input type="checkbox" name="recalculateBalanceAfterHalfOrContemplation" checked={formData.recalculateBalanceAfterHalfOrContemplation || false} onChange={handleChange} className="sr-only peer" />
                          <div className="relative w-9 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                          <span className="ms-3 text-sm font-medium text-slate-700">Recalcular % FC após a contemplação ou 50% do prazo (Plano Reduzido)</span>
                      </label>
                      <p className="text-xs text-slate-500 mt-1 ml-12">Marque esta opção se a tabela acima representa apenas o período de parcela reduzida. O sistema ignorará a trava de 100% e assumirá o recálculo automático do saldo restante no momento correto.</p>
                  </div>
              </div>
          )}

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
              <input required name="adminFeeRate" type="number" step="0.0001" placeholder="0.0000" value={formData.adminFeeRate ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Fundo Reserva (FR) %</label>
              <input required name="reserveFundRate" type="number" step="0.01" value={formData.reserveFundRate ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} onBlur={handleReserveFundBlur} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Índice Correção Anual</label>
              <select name="correctionIndex" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-bold" value={formData.correctionIndex} onChange={handleChange}>
                <option value={CorrectionIndex.INCC_12}>INCC (Acumulado 12m)</option>
                <option value={CorrectionIndex.IPCA_12}>IPCA (Acumulado 12m)</option>
                <option value={CorrectionIndex.INPC_12}>INPC (Acumulado 12m)</option>
                <option value={CorrectionIndex.INCC}>INCC (Mensal)</option>
                <option value={CorrectionIndex.IPCA}>IPCA (Mensal)</option>
                <option value={CorrectionIndex.INPC}>INPC (Mensal)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1" title="Limite máximo de correção anual (opcional)">Teto de Reajuste Anual (%)</label>
              <input name="correctionRateCap" type="number" step="0.01" placeholder="Ex: 10.00" value={formData.correctionRateCap ?? ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" onChange={handleChange} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
             <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Plano Pagamento</label>
              <select name="paymentPlan" className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.paymentPlan} onChange={handleChange}>
                <option value={PaymentPlanType.NORMAL}>Normal</option>
                <option value={PaymentPlanType.REDUZIDA}>Parcela Reduzida (50%)</option>
                <option value={PaymentPlanType.SEMESTRAL}>Parcela Semestral</option>
              </select>
            </div>
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer p-3 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors w-full">
                  <input type="checkbox" name="anticipateCorrectionMonth" checked={formData.anticipateCorrectionMonth} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300" />
                  <span className="text-sm font-bold text-blue-800">Antecipar Reajuste Anual em 1 mês (Padrão Sicredi)</span>
              </label>
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

              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" name="isDrawContemplation" checked={formData.isDrawContemplation} onChange={handleChange} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ms-3 text-sm font-medium text-slate-900">Lance por Sorteio?</span>
              </label>

              <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" name="stopCreditCorrection" checked={formData.stopCreditCorrection} onChange={handleChange} className="sr-only peer" />
                <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                <span className="ms-3 text-sm font-medium text-slate-900">Parar Reajuste após Contemplação?</span>
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

              <div className="flex-1">
                  <label className="flex items-center gap-2 cursor-pointer p-2 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors h-full">
                      <input type="checkbox" name="prioritizeFeesInBid" checked={formData.prioritizeFeesInBid} onChange={handleChange} className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300" />
                      <span className="text-xs font-bold text-emerald-800">Priorizar Quitação de Taxas (TA/FR) no Lance</span>
                  </label>
              </div>
          </div>

          <div className={`grid grid-cols-1 md:grid-cols-4 gap-6 transition-all duration-300 ${formData.isContemplated ? 'opacity-100' : 'opacity-50 grayscale'}`}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Data Contemplação</label>
              <input name="contemplationDate" type="date" disabled={!formData.isContemplated} value={formData.contemplationDate || ''} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lance Livre (R$)</label>
              <input name="bidFree" type="number" step="0.01" value={formData.bidFree ?? ''} disabled={!formData.isContemplated || formData.isDrawContemplation} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lance Embutido (R$)</label>
              <input name="bidEmbedded" type="number" step="0.01" value={formData.bidEmbedded ?? ''} disabled={!formData.isContemplated || formData.isDrawContemplation} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-slate-100" onChange={handleChange} />
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
