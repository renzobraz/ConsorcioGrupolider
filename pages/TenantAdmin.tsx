import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, CreditCard, Plus, Edit3, Loader, X, Check,
  BadgeCheck, Clock, Ban, AlertTriangle, RefreshCw, Users, Hash
} from 'lucide-react';
import { db } from '../services/database';
import { Tenant, SubscriptionPlan, TenantStatus } from '../types';
import { formatCurrency } from '../utils/formatters';

// ─── helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<TenantStatus, { label: string; color: string; Icon: any }> = {
  trial:     { label: 'Trial',     color: 'bg-blue-100 text-blue-700 border-blue-200',    Icon: Clock },
  active:    { label: 'Ativo',     color: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: BadgeCheck },
  suspended: { label: 'Suspenso',  color: 'bg-amber-100 text-amber-700 border-amber-200', Icon: AlertTriangle },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-700 border-red-200',       Icon: Ban },
};

const StatusBadge = ({ status }: { status: TenantStatus }) => {
  const { label, color, Icon } = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${color}`}>
      <Icon size={10} /> {label}
    </span>
  );
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('pt-BR') : '—';

// ─── EMPTY FORMS ──────────────────────────────────────────────────────────────

const EMPTY_PLAN: Omit<SubscriptionPlan, 'id' | 'createdAt'> = {
  name: '', description: '', priceMonthly: 0, priceYearly: 0,
  maxQuotas: null, maxUsers: 10, features: [], isActive: true,
  mpPlanIdMonthly: null, mpPlanIdYearly: null,
};

const EMPTY_TENANT: Omit<Tenant, 'id' | 'createdAt' | 'mpSubscriptionId' | 'mpPreapprovalId'> = {
  name: '', document: '', email: '', planId: null,
  status: 'trial', gracePeriodDays: 7,
  trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null,
};

// ─── MODALS ───────────────────────────────────────────────────────────────────

const PlanModal = ({
  plan, onSave, onClose
}: {
  plan: SubscriptionPlan | null;
  onSave: (data: Partial<SubscriptionPlan> & { name: string }) => Promise<void>;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<Omit<SubscriptionPlan, 'id' | 'createdAt'>>(
    plan ? { ...plan } : { ...EMPTY_PLAN }
  );
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState('');

  const set = (key: keyof typeof form, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const addFeature = () => {
    const f = featureInput.trim();
    if (f && !form.features.includes(f)) set('features', [...form.features, f]);
    setFeatureInput('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...(plan ? { id: plan.id } : {}), ...form });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
      {node}
    </div>
  );

  const inp = (key: keyof typeof form, type = 'text', placeholder = '') => (
    <input
      type={type} placeholder={placeholder}
      value={(form[key] as any) ?? ''}
      onChange={e => set(key, type === 'number' ? (Number(e.target.value) || 0) : e.target.value)}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
    />
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <CreditCard size={18} className="text-blue-600" />
            {plan ? 'Editar Plano' : 'Novo Plano'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {field('Nome do Plano *', inp('name', 'text', 'Ex: Plano Básico'))}
          {field('Descrição', inp('description', 'text', 'Descrição curta para o cliente'))}

          <div className="grid grid-cols-2 gap-4">
            {field('Preço Mensal (R$)', inp('priceMonthly', 'number'))}
            {field('Preço Anual (R$)', inp('priceYearly', 'number'))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Máx. Cotas (vazio = ilimitado)',
              <input type="number" placeholder="ilimitado"
                value={form.maxQuotas ?? ''}
                onChange={e => set('maxQuotas', e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            {field('Máx. Usuários', inp('maxUsers', 'number'))}
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Recursos inclusos</label>
            <div className="flex gap-2 mb-2">
              <input value={featureInput} onChange={e => setFeatureInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFeature()}
                placeholder="Ex: Relatórios ilimitados" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={addFeature} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {form.features.map(f => (
                <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-100">
                  {f}
                  <button onClick={() => set('features', form.features.filter(x => x !== f))} className="hover:text-red-500">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="planActive" checked={form.isActive}
              onChange={e => set('isActive', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600" />
            <label htmlFor="planActive" className="text-sm font-medium text-slate-700">Plano ativo (visível para novos clientes)</label>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar Plano
          </button>
        </div>
      </div>
    </div>
  );
};

const TenantModal = ({
  tenant, plans, onSave, onClose
}: {
  tenant: Tenant | null;
  plans: SubscriptionPlan[];
  onSave: (data: Partial<Tenant> & { name: string; email: string }) => Promise<void>;
  onClose: () => void;
}) => {
  const [form, setForm] = useState<Omit<Tenant, 'id' | 'createdAt' | 'mpSubscriptionId' | 'mpPreapprovalId'>>(
    tenant ? { ...tenant } : { ...EMPTY_TENANT }
  );
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      await onSave({ ...(tenant ? { id: tenant.id } : {}), ...form });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{label}</label>
      {node}
    </div>
  );

  const inp = (key: keyof typeof form, type = 'text', placeholder = '') => (
    <input type={type} placeholder={placeholder}
      value={(form[key] as any) ?? ''}
      onChange={e => set(key, type === 'number' ? (Number(e.target.value) || 0) : e.target.value)}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
  );

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Building2 size={18} className="text-emerald-600" />
            {tenant ? 'Editar Tenant' : 'Novo Tenant'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {field('Nome da Empresa *', inp('name', 'text', 'Ex: Consórcio Alfa Ltda'))}

          <div className="grid grid-cols-2 gap-4">
            {field('E-mail *', inp('email', 'email', 'contato@empresa.com'))}
            {field('CNPJ / CPF', inp('document', 'text', '00.000.000/0000-00'))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Plano',
              <select value={form.planId ?? ''}
                onChange={e => set('planId', e.target.value || null)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sem plano</option>
                {plans.filter(p => p.isActive).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            {field('Status',
              <select value={form.status}
                onChange={e => set('status', e.target.value as TenantStatus)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500">
                <option value="trial">Trial</option>
                <option value="active">Ativo</option>
                <option value="suspended">Suspenso</option>
                <option value="cancelled">Cancelado</option>
              </select>
            )}
          </div>

          {field('Dias de Tolerância (após vencimento)',
            <input type="number" min={0} max={90}
              value={form.gracePeriodDays}
              onChange={e => set('gracePeriodDays', Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          )}

          {form.status === 'trial' && field('Trial até',
            <input type="date"
              value={form.trialEndsAt ? form.trialEndsAt.split('T')[0] : ''}
              onChange={e => set('trialEndsAt', e.target.value || null)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
          )}

          {form.status === 'active' && (
            <div className="grid grid-cols-2 gap-4">
              {field('Início do Período',
                <input type="date"
                  value={form.currentPeriodStart ? form.currentPeriodStart.split('T')[0] : ''}
                  onChange={e => set('currentPeriodStart', e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              )}
              {field('Fim do Período',
                <input type="date"
                  value={form.currentPeriodEnd ? form.currentPeriodEnd.split('T')[0] : ''}
                  onChange={e => set('currentPeriodEnd', e.target.value || null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.email.trim()}
            className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

const TenantAdmin = () => {
  const [tab, setTab] = useState<'tenants' | 'plans'>('tenants');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, t] = await Promise.all([db.getSubscriptionPlans(), db.getTenants()]);
      setPlans(p); setTenants(t);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const planName = (planId: string | null) => plans.find(p => p.id === planId)?.name ?? '—';

  const handleSavePlan = async (data: Partial<SubscriptionPlan> & { name: string }) => {
    await db.saveSubscriptionPlan(data);
    setShowPlanModal(false); setEditingPlan(null);
    await load();
  };

  const handleSaveTenant = async (data: Partial<Tenant> & { name: string; email: string }) => {
    await db.saveTenant(data);
    setShowTenantModal(false); setEditingTenant(null);
    await load();
  };

  const handleChangeStatus = async (tenant: Tenant, status: TenantStatus) => {
    if (!window.confirm(`Alterar status de "${tenant.name}" para "${STATUS_META[status].label}"?`)) return;
    try {
      await db.updateTenantStatus(tenant.id, status);
      await load();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar status');
    }
  };

  // counts
  const byPlan = (planId: string) => tenants.filter(t => t.planId === planId).length;
  const byStatus = (s: TenantStatus) => tenants.filter(t => t.status === s).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-800">Administração da Plataforma</h1>
          <p className="text-xs text-slate-500 mt-0.5">Gerencie tenants e planos de assinatura</p>
        </div>
        <button onClick={load} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total de Tenants', value: tenants.length, color: 'text-slate-700', bg: 'bg-white' },
          { label: 'Ativos', value: byStatus('active'), color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Trial', value: byStatus('trial'), color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Suspensos', value: byStatus('suspended'), color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Cancelados', value: byStatus('cancelled'), color: 'text-red-700', bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} border border-slate-200 rounded-xl p-4 flex flex-col`}>
            <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">{c.label}</span>
            <span className={`text-2xl font-black ${c.color}`}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(['tenants', 'plans'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t === 'tenants' ? (
              <span className="flex items-center gap-2"><Building2 size={14} /> Tenants ({tenants.length})</span>
            ) : (
              <span className="flex items-center gap-2"><CreditCard size={14} /> Planos ({plans.length})</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* ── TENANTS TAB ── */}
      {tab === 'tenants' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 flex items-center gap-2"><Building2 size={16} /> Tenants</h2>
            <button onClick={() => { setEditingTenant(null); setShowTenantModal(true); }}
              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-emerald-700">
              <Plus size={14} /> Novo Tenant
            </button>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader className="animate-spin text-slate-400" size={24} /></div>
          ) : tenants.length === 0 ? (
            <div className="p-12 text-center text-slate-400">Nenhum tenant cadastrado</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Plano</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Tolerância</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Cadastro</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-800">{t.name}</div>
                        {t.document && <div className="text-[10px] text-slate-400">{t.document}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{t.email}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{planName(t.planId)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-center font-bold text-slate-600">{t.gracePeriodDays}d</td>
                      <td className="px-4 py-3 text-slate-500">
                        {t.status === 'trial' && t.trialEndsAt && (
                          <span className="text-blue-600">Trial até {fmtDate(t.trialEndsAt)}</span>
                        )}
                        {t.status === 'active' && t.currentPeriodEnd && (
                          <span>{fmtDate(t.currentPeriodStart)} → {fmtDate(t.currentPeriodEnd)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{fmtDate(t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditingTenant(t); setShowTenantModal(true); }}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                            <Edit3 size={14} />
                          </button>
                          {t.status !== 'active' && (
                            <button onClick={() => handleChangeStatus(t, 'active')}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Ativar">
                              <BadgeCheck size={14} />
                            </button>
                          )}
                          {t.status === 'active' && (
                            <button onClick={() => handleChangeStatus(t, 'suspended')}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg" title="Suspender">
                              <AlertTriangle size={14} />
                            </button>
                          )}
                          {t.status !== 'cancelled' && (
                            <button onClick={() => handleChangeStatus(t, 'cancelled')}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Cancelar">
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PLANS TAB ── */}
      {tab === 'plans' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-bold text-slate-700 flex items-center gap-2"><CreditCard size={16} /> Planos de Assinatura</h2>
            <button onClick={() => { setEditingPlan(null); setShowPlanModal(true); }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-700">
              <Plus size={14} /> Novo Plano
            </button>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader className="animate-spin text-slate-400" size={24} /></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {plans.map(p => (
                <div key={p.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-800">{p.name}</span>
                        {p.isActive
                          ? <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-bold border border-emerald-200">ATIVO</span>
                          : <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold border border-slate-200">INATIVO</span>
                        }
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold border border-slate-200 flex items-center gap-1">
                          <Users size={9} /> {byPlan(p.id)} tenant{byPlan(p.id) !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {p.description && <p className="text-xs text-slate-500 mb-2">{p.description}</p>}
                      <div className="flex flex-wrap gap-4 text-xs">
                        <div>
                          <span className="text-slate-400">Mensal: </span>
                          <span className="font-bold text-slate-700">{p.priceMonthly > 0 ? formatCurrency(p.priceMonthly) : 'Gratuito'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Anual: </span>
                          <span className="font-bold text-slate-700">{p.priceYearly > 0 ? formatCurrency(p.priceYearly) : 'Gratuito'}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Hash size={10} className="text-slate-400" />
                          <span className="text-slate-500">{p.maxQuotas ?? '∞'} cotas · {p.maxUsers} usuários</span>
                        </div>
                      </div>
                      {p.features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {p.features.map(f => (
                            <span key={f} className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-full border border-blue-100">{f}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setEditingPlan(p); setShowPlanModal(true); }}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg flex-shrink-0">
                      <Edit3 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {plans.length === 0 && (
                <div className="p-12 text-center text-slate-400">Nenhum plano cadastrado</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showPlanModal && (
        <PlanModal plan={editingPlan} onSave={handleSavePlan} onClose={() => { setShowPlanModal(false); setEditingPlan(null); }} />
      )}
      {showTenantModal && (
        <TenantModal tenant={editingTenant} plans={plans} onSave={handleSaveTenant} onClose={() => { setShowTenantModal(false); setEditingTenant(null); }} />
      )}
    </div>
  );
};

export default TenantAdmin;
