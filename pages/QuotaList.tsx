
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useConsortium } from '../store/ConsortiumContext';
import { formatCurrency } from '../utils/formatters';
import { Trash2, Search, Calculator, Plus, Car, Home, FileText, Pencil, Filter, X, ShoppingBag, AlertTriangle, Loader, Copy, ChevronUp, ChevronDown, Tag, TrendingUp, DollarSign } from 'lucide-react';
import { ProductType, Quota } from '../types';
import { calculateCurrentCreditValue, generateSchedule, calculateIRR, calculateScheduleSummary } from '../services/calculationService';
import { calculateMarketAnalysis, MarketAnalysis } from '../services/marketService';
import { db } from '../services/database';

const QuotaList = () => {
  const { quotas, deleteQuota, updateQuota, setCurrentQuota, administrators, companies, indices, allCreditUpdates, allCreditUsages, globalFilters, setGlobalFilters } = useConsortium();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  // Filter States - Lendo search da URL, mas usando globalFilters para o resto
  const search = searchParams.get('q') || '';

  // Função auxiliar para atualizar a URL apenas para a busca
  const updateSearch = (value: string) => {
      setSearchParams(prev => {
          const newParams = new URLSearchParams(prev);
          if (value) {
              newParams.set('q', value);
          } else {
              newParams.delete('q');
          }
          return newParams;
      }, { replace: true });
  };

  // Delete Modal State
  const [quotaToDelete, setQuotaToDelete] = useState<{ id: string, label: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Market Modal State
  const [marketQuota, setMarketQuota] = useState<{ quota: Quota; analysis: any } | null>(null);
  const [customAgio, setCustomAgio] = useState<number>(0);
  const [agioMode, setAgioMode] = useState<'currency' | 'percent'>('currency');
  const [agioPercent, setAgioPercent] = useState<number>(0);
  const [reserveFundAccumulated, setReserveFundAccumulated] = useState<number>(0);
  const [insuranceRate, setInsuranceRate] = useState<number>(0);
  const [insuranceValue, setInsuranceValue] = useState<number>(0);
  const [isAnnouncing, setIsAnnouncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const filteredQuotas = quotas.filter(q => {
    const matchesSearch = 
      (q.group || '').toLowerCase().includes(search.toLowerCase()) || 
      (q.quotaNumber || '').toLowerCase().includes(search.toLowerCase()) || 
      (q.contractNumber || '').toLowerCase().includes(search.toLowerCase());

    const matchesAdmin = !globalFilters.administratorId || q.administratorId === globalFilters.administratorId;
    const matchesCompany = !globalFilters.companyId || q.companyId === globalFilters.companyId;
    
    // Robust product type matching (handles legacy 'VEHICLE'/'REAL_ESTATE' keys if they exist)
    let qProduct = q.productType;
    if (qProduct === 'VEHICLE') qProduct = ProductType.VEHICLE;
    if (qProduct === 'REAL_ESTATE') qProduct = ProductType.REAL_ESTATE;
    
    const matchesProduct = !globalFilters.productType || qProduct === globalFilters.productType;

    let matchesStatus = true;
    if (globalFilters.status === 'CONTEMPLATED') matchesStatus = q.isContemplated;
    if (globalFilters.status === 'ACTIVE') matchesStatus = !q.isContemplated;

    return matchesSearch && matchesAdmin && matchesCompany && matchesProduct && matchesStatus;
  });

  const sortedQuotas = [...filteredQuotas].sort((a, b) => {
    if (!sortConfig) return 0;
    
    const { key, direction } = sortConfig;
    let aValue: any;
    let bValue: any;

    switch (key) {
      case 'product':
        aValue = a.productType;
        bValue = b.productType;
        break;
      case 'id':
        aValue = `${a.group}-${a.quotaNumber}`;
        bValue = `${b.group}-${b.quotaNumber}`;
        break;
      case 'credit':
        aValue = a.creditValue;
        bValue = b.creditValue;
        break;
      case 'current':
        aValue = calculateCurrentCreditValue(a, indices);
        bValue = calculateCurrentCreditValue(b, indices);
        break;
      case 'plano':
        aValue = a.paymentPlan;
        bValue = b.paymentPlan;
        break;
      case 'indice':
        aValue = a.correctionIndex;
        bValue = b.correctionIndex;
        break;
      case 'prazo':
        aValue = a.termMonths;
        bValue = b.termMonths;
        break;
      case 'status':
        aValue = a.isContemplated ? 1 : 0;
        bValue = b.isContemplated ? 1 : 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <div className="w-4" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />;
  };

  const handleSimulate = (quota: any) => {
    setCurrentQuota(quota);
    navigate('/simulate');
  };

  const confirmDelete = async () => {
    if (!quotaToDelete) return;
    setIsDeleting(true);
    try {
      await deleteQuota(quotaToDelete.id);
      setQuotaToDelete(null);
    } catch (error) {
      console.error("Erro ao deletar cota:", error);
      alert('Erro ao excluir a cota. Verifique sua conexão com o banco de dados.');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearchParams({});
    setGlobalFilters({ companyId: '', administratorId: '', status: '', productType: '' });
  };

  const hasActiveFilters = search || globalFilters.administratorId || globalFilters.companyId || globalFilters.status || globalFilters.productType;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Minhas Cotas</h1>
          <p className="text-slate-500">Gerencie suas cotas cadastradas no banco de dados</p>
        </div>
        <button 
          onClick={() => navigate('/new')}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2 font-medium"
        >
          <Plus size={20} /> Nova Cota
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 relative min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar..." 
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    value={search}
                    onChange={(e) => updateSearch(e.target.value)}
                />
            </div>
            <div className="flex-1">
                <select 
                    value={globalFilters.companyId} 
                    onChange={(e) => setGlobalFilters({ ...globalFilters, companyId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Empresas</option>
                    {companies.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <select 
                    value={globalFilters.administratorId} 
                    onChange={(e) => setGlobalFilters({ ...globalFilters, administratorId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todas as Administradoras</option>
                    {administrators.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex-1">
                <select 
                    value={globalFilters.productType} 
                    onChange={(e) => setGlobalFilters({ ...globalFilters, productType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todos os Produtos</option>
                    <option value="VEICULO">Veículo</option>
                    <option value="IMOVEL">Imóvel</option>
                </select>
            </div>
            <div className="flex-1">
                <select 
                    value={globalFilters.status} 
                    onChange={(e) => setGlobalFilters({ ...globalFilters, status: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 text-slate-600"
                >
                    <option value="">Todos os Status</option>
                    <option value="CONTEMPLATED">Contempladas</option>
                    <option value="ACTIVE">Em Andamento</option>
                </select>
            </div>
            
            {hasActiveFilters && (
                <button 
                    onClick={clearFilters}
                    className="px-4 py-2 text-slate-500 hover:text-red-500 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors flex items-center justify-center gap-1 text-sm font-medium whitespace-nowrap"
                >
                    <X size={16} /> Limpar
                </button>
            )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {sortedQuotas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('product')}>
                    <div className="flex items-center">Produto <SortIcon column="product" /></div>
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('id')}>
                    <div className="flex items-center">Identificação <SortIcon column="id" /></div>
                  </th>
                  <th className="p-4 font-semibold text-right cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('credit')}>
                    <div className="flex items-center justify-end">Valor Carta <SortIcon column="credit" /></div>
                  </th>
                  <th className="p-4 font-semibold text-right bg-emerald-50/50 text-emerald-800 border-l border-emerald-100 cursor-pointer hover:bg-emerald-100/50 transition-colors" onClick={() => handleSort('current')}>
                    <div className="flex items-center justify-end">Vlr Atual <SortIcon column="current" /></div>
                  </th>
                  <th className="p-4 font-semibold text-right bg-blue-50/50 text-blue-800 border-l border-blue-100">Taxas (TA/FR)</th>
                  <th className="p-4 font-semibold text-right bg-amber-50 text-amber-800 border-l border-emerald-100">Cred. Usado</th>
                  <th className="p-4 font-semibold text-center bg-slate-100 text-slate-800 border-l border-slate-200">CET Anual</th>
                  <th className="p-4 font-semibold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('plano')}>
                    <div className="flex items-center justify-center">Plano <SortIcon column="plano" /></div>
                  </th>
                  <th className="p-4 font-semibold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('indice')}>
                    <div className="flex items-center justify-center">Índice <SortIcon column="indice" /></div>
                  </th>
                  <th className="p-4 font-semibold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('prazo')}>
                    <div className="flex items-center justify-center">Prazo <SortIcon column="prazo" /></div>
                  </th>
                  <th className="p-4 font-semibold text-center cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleSort('status')}>
                    <div className="flex items-center justify-center">Status <SortIcon column="status" /></div>
                  </th>
                  <th className="p-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedQuotas.map((quota) => {
                  const currentValue = calculateCurrentCreditValue(quota, indices);
                  const usedCredit = allCreditUsages
                      .filter(u => u.quotaId === quota.id)
                      .reduce((acc, curr) => acc + curr.amount, 0);

                  const adminFeeValue = (quota.adminFeeRate / 100) * quota.creditValue;
                  const reserveFundValue = (quota.reserveFundRate / 100) * quota.creditValue;

                  return (
                  <tr key={quota.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-700 font-medium">
                        {quota.productType === ProductType.VEHICLE ? <Car size={18} className="text-blue-500" /> : <Home size={18} className="text-orange-500" />}
                        <span className="text-sm">{quota.productType === ProductType.VEHICLE ? 'Veículo' : 'Imóvel'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-800">Gp: {quota.group} / Cota: {quota.quotaNumber}</div>
                        {quota.isAnnounced && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black rounded uppercase tracking-tighter flex items-center gap-0.5">
                            <Tag size={8} /> Anunciada
                          </span>
                        )}
                      </div>
                      {quota.contractNumber && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <FileText size={10} /> {quota.contractNumber}
                        </div>
                      )}
                      {quota.contractFileUrl && (
                        <a 
                          href={quota.contractFileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-blue-600 font-bold hover:underline mt-1"
                          title="Ver Contrato Arquivado"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText size={10} /> CONTRATO ANEXADO
                        </a>
                      )}
                      <div className="flex flex-col mt-1 gap-0.5">
                         {quota.administratorId && (
                             <span className="text-[10px] text-slate-400 uppercase">
                                 ADM: {administrators.find(a => a.id === quota.administratorId)?.name || '...'}
                             </span>
                         )}
                         {quota.companyId && (
                             <span className="text-[10px] text-slate-400 uppercase">
                                 EMP: {companies.find(c => c.id === quota.companyId)?.name || '...'}
                             </span>
                         )}
                      </div>
                    </td>
                    <td className="p-4 text-right text-slate-600 text-sm">
                      {formatCurrency(quota.creditValue)}
                    </td>
                    <td className="p-4 text-right font-bold text-emerald-700 bg-emerald-50/30 border-l border-emerald-50">
                      {formatCurrency(currentValue)}
                    </td>
                    <td className="p-4 text-right bg-blue-50/20 border-l border-blue-50">
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-blue-500 uppercase">TA:</span>
                          <span className="text-xs font-black text-blue-700">{quota.adminFeeRate.toFixed(2)}%</span>
                          <span className="text-[10px] text-blue-400">({formatCurrency(adminFeeValue)})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase">FR:</span>
                          <span className="text-xs font-black text-indigo-700">{quota.reserveFundRate.toFixed(2)}%</span>
                          <span className="text-[10px] text-indigo-400">({formatCurrency(reserveFundValue)})</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium text-amber-700 bg-amber-50/30 border-l border-emerald-50">
                        {usedCredit > 0 ? formatCurrency(usedCredit) : '-'}
                    </td>
                    <td className="p-4 text-center bg-slate-50/50 border-l border-slate-100">
                      {(() => {
                        const schedule = generateSchedule(quota, indices);
                        const embeddedBid = quota.bidEmbedded || 0;
                        const netCredit = (calculateCurrentCreditValue(quota, indices)) - embeddedBid;
                        const acqCost = quota.acquisitionCost || 0;
                        
                        const cashFlows = [netCredit - acqCost];
                        schedule.forEach(inst => {
                            let outflow = inst.totalInstallment;
                            if (inst.bidFreeApplied && inst.bidFreeApplied > 0) {
                                outflow += inst.bidFreeApplied;
                            }
                            cashFlows.push(-outflow);
                        });

                        const irrMonthly = calculateIRR(cashFlows);
                        if (irrMonthly !== null && !isNaN(irrMonthly) && netCredit > 0) {
                            const irrAnnual = Math.pow(1 + irrMonthly, 12) - 1;
                            return (
                                <div className="flex flex-col items-center">
                                    <span className="text-sm font-black text-slate-800">{(irrAnnual * 100).toFixed(2)}%</span>
                                    <span className="text-[9px] text-slate-400 uppercase">a.a.</span>
                                </div>
                            );
                        } else if (netCredit > 0) {
                            const totalPaidInSchedule = schedule.reduce((sum, inst) => sum + inst.totalInstallment + (inst.bidFreeApplied || 0), 0);
                            const totalCost = totalPaidInSchedule + acqCost;
                            const linearCETAnnual = ((totalCost / netCredit) - 1) / (quota.termMonths / 12);
                            return (
                                <div className="flex flex-col items-center">
                                    <span className="text-sm font-bold text-slate-500">{(linearCETAnnual * 100).toFixed(2)}%</span>
                                    <span className="text-[9px] text-slate-400 uppercase">a.a. (lin)</span>
                                </div>
                            );
                        }
                        return <span className="text-slate-300">-</span>;
                      })()}
                    </td>
                    <td className="p-4 text-center text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        quota.paymentPlan === 'NORMAL' ? 'bg-slate-100 text-slate-600' : 
                        quota.paymentPlan === 'REDUZIDA' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                      }`}>
                        {quota.paymentPlan}
                      </span>
                    </td>
                    <td className="p-4 text-center text-sm font-medium text-slate-600">
                       <div className="flex flex-col items-center">
                         <span>{quota.correctionIndex}</span>
                         {quota.indexReferenceMonth && (
                           <span className="text-[10px] text-slate-400 uppercase">Ref: Mês {quota.indexReferenceMonth}</span>
                         )}
                       </div>
                    </td>
                    <td className="p-4 text-center text-slate-600">
                      {quota.termMonths} meses
                    </td>
                    <td className="p-4 text-center">
                      {quota.isContemplated ? (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            Contemplada
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                          Em andamento
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {quota.isContemplated && (
                            <button 
                              onClick={() => navigate(`/usage/${quota.id}`)}
                              className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors border border-transparent hover:border-violet-200"
                              title="Gestão de Uso do Crédito"
                            >
                              <ShoppingBag size={18} />
                            </button>
                        )}
                        <button 
                          onClick={() => navigate(`/edit/${quota.id}`)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button 
                          onClick={() => navigate(`/new?replicate=${quota.id}`)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-200"
                          title="Replicar"
                        >
                          <Copy size={18} />
                        </button>
                        <button 
                          onClick={() => handleSimulate(quota)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-transparent hover:border-emerald-200"
                          title="Simular"
                        >
                          <Calculator size={18} />
                        </button>
                        <button 
                          onClick={async () => {
                            setIsLoading(true);
                            try {
                              const [payments, manualTransactions] = await Promise.all([
                                db.getPayments(quota.id),
                                db.getManualTransactions(quota.id)
                              ]);
                              
                              const schedule = generateSchedule({ ...quota, manualTransactions }, indices, payments);
                              const summary = calculateScheduleSummary(quota, schedule, payments);
                              
                              const paidAmount = summary.paid.total;
                              const debtBalance = summary.toPay.total;
                              
                              const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === quota.id);
                              const latestUpdateValue = quotaUpdates.length > 0 
                                ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
                                : 0;
                              
                              const quotaUsages = allCreditUsages.filter(u => u.quotaId === quota.id);
                              const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

                              const analysis = calculateMarketAnalysis(
                                quota, 
                                indices, 
                                paidAmount, 
                                debtBalance, 
                                0, 
                                latestUpdateValue, 
                                creditoUtilizado
                              );
                              setMarketQuota({ quota, analysis });
                              setCustomAgio(analysis.agioValue);
                              
                              // Calculate initial percentage
                              if (paidAmount > 0) {
                                setAgioPercent(parseFloat(((analysis.agioValue / paidAmount) * 100).toFixed(2)));
                              } else {
                                setAgioPercent(0);
                              }
                              setAgioMode('currency');
                            } catch (err) {
                              console.error("Failed to prepare market analysis", err);
                              alert("Erro ao carregar dados da cota para o marketplace.");
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200"
                          title="Anunciar para Venda"
                        >
                          <Tag size={18} />
                        </button>
                        <button 
                          onClick={() => setQuotaToDelete({ id: quota.id, label: `${quota.group}/${quota.quotaNumber}` })}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center">
            <Search size={48} className="mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma cota encontrada</p>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {quotaToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Excluir Cota?</h3>
              <p className="text-slate-500 mb-6">
                Você está prestes a excluir a cota <span className="font-bold text-slate-800">{quotaToDelete.label}</span>. 
                Esta ação apagará permanentemente todos os pagamentos e históricos vinculados a ela.
              </p>
              
              <div className="flex flex-col gap-3">
                <button 
                  disabled={isDeleting}
                  onClick={confirmDelete}
                  className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader className="animate-spin" size={20} /> : <Trash2 size={20} />}
                  {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
                </button>
                <button 
                  disabled={isDeleting}
                  onClick={() => setQuotaToDelete(null)}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Manter Cota
                </button>
              </div>
            </div>
            <div className="bg-slate-50 p-4 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
              Ação Irreversível
            </div>
          </div>
        </div>
      )}

      {/* MARKETPLACE ANNOUNCEMENT MODAL */}
      {marketQuota && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">Anunciar para Venda</h3>
                  <p className="text-sm text-slate-500">Cota {marketQuota.quota.group}/{marketQuota.quota.quotaNumber}</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Seção de Precificação */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                      <TrendingUp size={18} className="text-emerald-500" />
                      Definição de Preço (Ágio)
                    </h4>
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-black uppercase">
                      Autonomia Total
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          {agioMode === 'currency' ? 'Quanto você quer receber (Ágio)?' : 'Percentual de Ágio (%)'}
                        </label>
                        <div className="flex bg-slate-200 p-0.5 rounded-lg">
                          <button 
                            onClick={() => setAgioMode('currency')}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${agioMode === 'currency' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            R$
                          </button>
                          <button 
                            onClick={() => setAgioMode('percent')}
                            className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${agioMode === 'percent' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                          >
                            %
                          </button>
                        </div>
                      </div>
                      
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                          {agioMode === 'currency' ? 'R$' : '%'}
                        </span>
                        <input 
                          type="number" 
                          value={agioMode === 'currency' ? customAgio : agioPercent}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            let newAgioValue = val;
                            
                            if (agioMode === 'percent') {
                              setAgioPercent(val);
                              newAgioValue = (val / 100) * marketQuota.analysis.investedAmount;
                              setCustomAgio(newAgioValue);
                            } else {
                              setCustomAgio(val);
                              if (marketQuota.analysis.investedAmount > 0) {
                                setAgioPercent(parseFloat(((val / marketQuota.analysis.investedAmount) * 100).toFixed(2)));
                              }
                            }

                            // Recalcular análise em tempo real
                            if (marketQuota) {
                              const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === marketQuota.quota.id);
                              const latestUpdateValue = quotaUpdates.length > 0 
                                ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
                                : 0;
                              
                              const quotaUsages = allCreditUsages.filter(u => u.quotaId === marketQuota.quota.id);
                              const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

                              const newAnalysis = calculateMarketAnalysis(
                                { 
                                  ...marketQuota.quota, 
                                  reserveFundAccumulated, 
                                  insuranceRate, 
                                  insuranceValue 
                                }, 
                                indices, 
                                marketQuota.analysis.investedAmount, 
                                marketQuota.analysis.debtBalance, 
                                newAgioValue,
                                latestUpdateValue,
                                creditoUtilizado
                              );
                              setMarketQuota({ ...marketQuota, analysis: newAnalysis });
                            }
                          }}
                          className="w-full pl-10 pr-4 py-3 bg-white border-2 border-emerald-100 rounded-xl outline-none focus:border-emerald-500 font-bold text-slate-700 transition-all"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        {agioMode === 'percent' 
                          ? `Equivale a ${formatCurrency(customAgio)} sobre o valor pago.`
                          : 'Este é o valor que você pede pela transferência da cota.'}
                      </p>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor de Entrada (Comprador)</span>
                        <span className="text-lg font-black text-emerald-600">{formatCurrency(marketQuota.analysis.buyerEntry)}</span>
                      </div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Comissão Líder</span>
                        <span className="text-xs font-bold text-slate-600">{formatCurrency(marketQuota.analysis.platformFee)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Líquido Vendedor</span>
                        <span className="text-lg font-black text-slate-800">{formatCurrency(marketQuota.analysis.investedAmount + marketQuota.analysis.sellerNetPayout)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Novos Campos Financeiros */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <DollarSign size={18} className="text-blue-500" />
                    Dados Financeiros (Conforme Extrato)
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Fundo de Reserva Acumulado (R$)</label>
                      <input 
                        type="number" 
                        value={reserveFundAccumulated}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setReserveFundAccumulated(val);
                          if (marketQuota) {
                            const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === marketQuota.quota.id);
                            const latestUpdateValue = quotaUpdates.length > 0 
                              ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
                              : 0;
                            
                            const quotaUsages = allCreditUsages.filter(u => u.quotaId === marketQuota.quota.id);
                            const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

                            const newAnalysis = calculateMarketAnalysis(
                              { ...marketQuota.quota, reserveFundAccumulated: val, insuranceRate, insuranceValue }, 
                              indices, 
                              marketQuota.analysis.investedAmount, 
                              marketQuota.analysis.debtBalance, 
                              customAgio,
                              latestUpdateValue,
                              creditoUtilizado
                            );
                            setMarketQuota({ ...marketQuota, analysis: newAnalysis });
                          }
                        }}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700 transition-all"
                        placeholder="0,00"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Seguro de Vida/Garantia (%)</label>
                      <input 
                        type="number" 
                        value={insuranceRate}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setInsuranceRate(val);
                          if (marketQuota) {
                            const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === marketQuota.quota.id);
                            const latestUpdateValue = quotaUpdates.length > 0 
                              ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
                              : 0;
                            
                            const quotaUsages = allCreditUsages.filter(u => u.quotaId === marketQuota.quota.id);
                            const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

                            const newAnalysis = calculateMarketAnalysis(
                              { ...marketQuota.quota, reserveFundAccumulated, insuranceRate: val, insuranceValue }, 
                              indices, 
                              marketQuota.analysis.investedAmount, 
                              marketQuota.analysis.debtBalance, 
                              customAgio,
                              latestUpdateValue,
                              creditoUtilizado
                            );
                            setMarketQuota({ ...marketQuota, analysis: newAnalysis });
                          }
                        }}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500 font-bold text-slate-700 transition-all"
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Total Pago</span>
                    <span className="text-lg font-bold text-slate-700">{formatCurrency(marketQuota.analysis.investedAmount)}</span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Saldo Devedor</span>
                    <span className="text-lg font-bold text-slate-700">{formatCurrency(marketQuota.analysis.debtBalance)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl my-6">
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-bold">Como calculamos?</span> Para cotas {marketQuota.quota.isContemplated ? 'contempladas' : 'ativas'}, sugerimos um ágio de {(marketQuota.analysis.suggestedAgioPercent * 100).toFixed(0)}% sobre o valor do crédito atualizado, somado ao que você já pagou.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  disabled={isAnnouncing}
                  onClick={async () => {
                    if (!marketQuota) return;
                    setIsAnnouncing(true);
                    try {
                      const updatedQuota: Quota = {
                        ...marketQuota.quota,
                        isAnnounced: true,
                        announcedAt: new Date().toISOString(),
                        marketStatus: 'PENDING',
                        marketValueOverride: marketQuota.analysis.suggestedMarketValue,
                        marketNotes: JSON.stringify({
                          customAgio,
                          paidAmount: marketQuota.analysis.investedAmount,
                          debtBalance: marketQuota.analysis.debtBalance,
                          reserveFundAccumulated,
                          insuranceRate,
                          insuranceValue,
                          announcedAt: new Date().toISOString()
                        })
                      };
                      await updateQuota(updatedQuota);
                      setIsAnnouncing(false);
                      setMarketQuota(null);
                      alert('Cota enviada com sucesso! Nossa equipe analisará os dados e publicará no marketplace em até 24h.');
                    } catch (err) {
                      console.error("Failed to announce quota", err);
                      setIsAnnouncing(false);
                      alert('Erro ao enviar anúncio. Tente novamente.');
                    }
                  }}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-emerald-200"
                >
                  {isAnnouncing ? <Loader className="animate-spin" size={20} /> : <Tag size={20} />}
                  {isAnnouncing ? 'Processando...' : (marketQuota.quota.isAnnounced ? 'Atualizar Anúncio' : 'Confirmar Anúncio Grátis')}
                </button>

                {marketQuota.quota.isAnnounced && (
                  <button 
                    disabled={isAnnouncing}
                    onClick={async () => {
                      if (!marketQuota) return;
                      if (!window.confirm('Tem certeza que deseja remover este anúncio do marketplace?')) return;
                      
                      setIsAnnouncing(true);
                      try {
                        const updatedQuota: Quota = {
                          ...marketQuota.quota,
                          isAnnounced: false,
                          announcedAt: undefined,
                          marketStatus: 'DRAFT',
                          marketValueOverride: undefined,
                          marketNotes: `Anúncio removido pelo usuário em ${new Date().toLocaleDateString()}`
                        };
                        await updateQuota(updatedQuota);
                        setIsAnnouncing(false);
                        setMarketQuota(null);
                        alert('Anúncio removido com sucesso.');
                      } catch (err) {
                        console.error("Failed to remove announcement", err);
                        setIsAnnouncing(false);
                        alert('Erro ao remover anúncio. Tente novamente.');
                      }
                    }}
                    className="w-full py-3 bg-red-50 text-red-600 rounded-xl font-bold hover:bg-red-100 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 size={20} />
                    Remover Anúncio
                  </button>
                )}
                <button 
                  disabled={isAnnouncing}
                  onClick={() => setMarketQuota(null)}
                  className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Agora não
                </button>
              </div>
            </div>
            <div className="bg-slate-50 p-4 text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold">
              Venda Garantida • Sem Taxas de Anúncio
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuotaList;
