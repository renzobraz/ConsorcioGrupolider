
import React, { useMemo } from 'react';
import { useConsortium } from '../store/ConsortiumContext';
import { Search } from 'lucide-react';

/**
 * Componente de Filtro Padronizado com Lógica de Cascata
 * Empresa -> Administradora -> Produto -> Status -> Cotas
 */
const ConsortiumFilterBar = ({ 
  showQuotaFilter = true, 
  showDateFilter = false, 
  showRangeDateFilter = false,
  showQuickDateFilter = false,
  showPaymentStatusFilter = false,
  startDate = '',
  endDate = '',
  onStartDateChange = (val: string) => {},
  onEndDateChange = (val: string) => {},
  quickDateValue = '',
  onQuickDateChange = (val: string) => {},
  paymentStatusValue = 'ALL',
  onPaymentStatusChange = (val: string) => {},
  referenceDate = '', 
  onDateChange = (val: string) => {},
  actions = null as React.ReactNode
}) => {
  const { 
    quotas, 
    companies, 
    administrators, 
    globalFilters, 
    setGlobalFilters 
  } = useConsortium();

  // 1. Filtragem das Administradoras baseada na Empresa selecionada
  const availableAdmins = useMemo(() => {
    if (!globalFilters.companyId) return administrators;
    // Pega os IDs das administradoras que possuem cotas vinculadas à empresa selecionada
    const adminIdsInCompany = [...new Set(
      quotas
        .filter(q => q.companyId === globalFilters.companyId)
        .map(q => q.administratorId)
    )];
    return administrators.filter(adm => adminIdsInCompany.includes(adm.id));
  }, [administrators, quotas, globalFilters.companyId]);

  // 2. Filtragem dos Produtos baseada na Empresa e Administradora
  const availableProducts = useMemo(() => {
    let filtered = quotas;
    if (globalFilters.companyId) {
      filtered = filtered.filter(q => q.companyId === globalFilters.companyId);
    }
    if (globalFilters.administratorId) {
      filtered = filtered.filter(q => q.administratorId === globalFilters.administratorId);
    }
    return [...new Set(filtered.map(q => q.productType))].filter(Boolean) as string[];
  }, [quotas, globalFilters.companyId, globalFilters.administratorId]);

  // 3. Filtragem das Cotas baseada em todos os filtros anteriores
  const availableQuotas = useMemo(() => {
    let filtered = quotas;
    
    // Filtro de texto (Pesquisa)
    if (globalFilters.searchText) {
      const search = globalFilters.searchText.toLowerCase();
      filtered = filtered.filter(q => 
        (q.group || '').toLowerCase().includes(search) || 
        (q.quotaNumber || '').toLowerCase().includes(search) ||
        (q.contractNumber || '').toLowerCase().includes(search)
      );
    }

    if (globalFilters.companyId) {
      filtered = filtered.filter(q => q.companyId === globalFilters.companyId);
    }
    if (globalFilters.administratorId) {
      filtered = filtered.filter(q => q.administratorId === globalFilters.administratorId);
    }
    if (globalFilters.productType) {
      filtered = filtered.filter(q => q.productType === globalFilters.productType);
    }
    if (globalFilters.status) {
      const isContemplated = globalFilters.status === 'CONTEMPLATED';
      filtered = filtered.filter(q => q.isContemplated === isContemplated);
    }
    return [...filtered].sort((a, b) => a.quotaNumber.localeCompare(b.quotaNumber));
  }, [quotas, globalFilters]);

  // Função para limpar filtros dependentes quando um "pai" muda
  const handleFilterChange = (field: string, value: string) => {
    const newFilters = { ...globalFilters, [field]: value };
    
    // Cascata: Se mudar a empresa, limpa os filhos
    if (field === 'companyId') {
      newFilters.administratorId = '';
      newFilters.productType = '';
      newFilters.quotaId = '';
    }
    // Se mudar a administradora, limpa os netos
    if (field === 'administratorId') {
      newFilters.productType = '';
      newFilters.quotaId = '';
    }
    // Se mudar o produto ou status, limpa a cota específica
    if (field === 'productType' || field === 'status') {
      newFilters.quotaId = '';
    }

    setGlobalFilters(newFilters);
  };

  return (
    <div className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-10 gap-4 print:hidden items-end`}>
      
      {/* 0. Filtro de Data (Opcional, usado em relatórios) */}
      {showDateFilter && (
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Data Fechamento</label>
          <input 
            type="date" 
            value={referenceDate} 
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700" 
          />
        </div>
      )}

      {/* 0.1 Filtro Rápido de Data (Opcional) */}
      {showQuickDateFilter && (
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Filtro Período</label>
          <select 
            value={quickDateValue} 
            onChange={(e) => onQuickDateChange(e.target.value)}
            className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-emerald-800 cursor-pointer"
          >
            <option value="VENCIDOS">Vencidos</option>
            <option value="MES_ANTERIOR">Mês Anterior</option>
            <option value="DIA_ATUAL">Dia Atual</option>
            <option value="SEMANA_CORRENTE">Semana Corrente</option>
            <option value="MES_ATUAL">Mês Atual</option>
            <option value="PROXIMO_MES">Próximo Mês</option>
            <option value="PROXIMOS_60">Próximos 60 dias</option>
            <option value="TODAS">Todas Datas</option>
            <option value="CUSTOM">Personalizado</option>
          </select>
        </div>
      )}

      {/* 0.2 Status de Pagamento (Opcional) */}
      {showPaymentStatusFilter && (
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Status Pagto</label>
          <select 
            value={paymentStatusValue} 
            onChange={(e) => onPaymentStatusChange(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value="PENDING">Pendentes</option>
            <option value="PAID">Efetivados</option>
            <option value="ALL">Todos</option>
          </select>
        </div>
      )}

      {/* 0.3 Filtros de Período (Início e Fim) */}
      {showRangeDateFilter && (
        <>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Início</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => onStartDateChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700" 
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Fim</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => onEndDateChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700" 
            />
          </div>
        </>
      )}

      {/* 0.2 Pesquisa (Mover para a esquerda da empresa) */}
      <div className="flex flex-col">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Pesquisar</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            type="text" 
            placeholder="Grupo, Cota ou Contrato..." 
            value={globalFilters.searchText || ''} 
            onChange={(e) => handleFilterChange('searchText', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 pl-9 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700" 
          />
        </div>
      </div>

      {/* 1. Empresa */}
      <div className="flex flex-col">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Empresa</label>
        <select 
          value={globalFilters.companyId || ''} 
          onChange={(e) => handleFilterChange('companyId', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
        >
          <option value="">Todas</option>
          {[...companies].sort((a,b) => a.name.localeCompare(b.name)).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* 2. Administradora */}
      <div className="flex flex-col">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Administradora</label>
        <select 
          value={globalFilters.administratorId || ''} 
          onChange={(e) => handleFilterChange('administratorId', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
        >
          <option value="">Todas</option>
          {[...availableAdmins].sort((a,b) => a.name.localeCompare(b.name)).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* 3. Produto */}
      <div className="flex flex-col">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Produto</label>
        <select 
          value={globalFilters.productType || ''} 
          onChange={(e) => handleFilterChange('productType', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
        >
          <option value="">Todos</option>
          {availableProducts.map(p => (
            <option key={p} value={p}>{p === 'VEICULO' ? 'Veículo' : p === 'IMOVEL' ? 'Imóvel' : p}</option>
          ))}
        </select>
      </div>

      {/* 4. Status */}
      <div className="flex flex-col">
        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Status</label>
        <select 
          value={globalFilters.status || ''} 
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
        >
          <option value="">Todos</option>
          <option value="ACTIVE">Ativas</option>
          <option value="CONTEMPLATED">Contempladas</option>
        </select>
      </div>

      {/* 5. Cotas (Opcional) */}
      {showQuotaFilter && (
        <div className="flex flex-col">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Cotas</label>
          <select 
            value={globalFilters.quotaId || ''} 
            onChange={(e) => handleFilterChange('quotaId', e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-medium text-slate-700 cursor-pointer"
          >
            <option value="">Todas</option>
            {availableQuotas.map(q => (
              <option key={q.id} value={q.id}>{q.group} / {q.quotaNumber}</option>
            ))}
          </select>
        </div>
      )}

      {/* 6. Ações (Exportação, etc.) */}
      {actions && (
        <div className="flex items-center gap-2 lg:col-span-1 xl:col-span-1">
          {actions}
        </div>
      )}
    </div>
  );
};

export default ConsortiumFilterBar;
