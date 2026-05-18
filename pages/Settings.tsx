
import React, { useState, useEffect } from 'react';
import { Save, Database, Cloud, CheckCircle, AlertTriangle, Copy, Info, Download, Upload, Activity, Wifi, Trash2, Calendar, Mail, Clock } from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../services/supabaseClient';
import { useConsortium } from '../store/ConsortiumContext';
import { db } from '../services/database';

import { getTodayStr } from '../utils/formatters';
import { EmailSettings } from '../components/EmailSettings';
import { SendEmailModal } from '../components/SendEmailModal';
import { AVAILABLE_REPORT_COLUMNS } from '../constants/reportAvailableColumns';
import { ScheduledReport } from '../types';

const Settings = () => {
  const { 
    refreshData, 
    isCloudConnected, 
    connectionError, 
    scheduledReports, 
    deleteScheduledReport,
    addScheduledReport,
    companies,
    administrators
  } = useConsortium();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [serverConfig, setServerConfig] = useState<{ isConfigured: boolean, url: string | null } | null>(null);
  const [editingReport, setEditingReport] = useState<ScheduledReport | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [triggeringReportId, setTriggeringReportId] = useState<string | null>(null);

  useEffect(() => {
    const config = getSupabaseConfig();
    if (config.url) setUrl(config.url);
    if (config.key) setKey(config.key);

    // Check server-side config
    fetch('/api/config-status')
      .then(res => res.json())
      .then(data => {
        if (data.supabase) {
          setServerConfig({
            isConfigured: data.supabase.isConfigured,
            url: data.supabase.url
          });
        }
      })
      .catch(err => console.error('Error checking server config:', err));
  }, []);

  const handleTestConnection = async () => {
    if (!url || !key) {
      alert("Preencha a URL e a API Key antes de testar.");
      return;
    }

    const isNewFormat = key.trim().length < 50 && key.trim().startsWith('sb_');
    if (key.trim().length < 50 && !isNewFormat) {
      alert("⚠️ CHAVE MUITO CURTA\n\nA API Key do Supabase é um texto longo (JWT) ou começa com 'sb_publishable_'.\n\nCertifique-se de copiar a chave 'anon' (public) ou 'Publishable key' que tem muitos caracteres.");
      return;
    }

    setIsTesting(true);
    try {
      // Limpeza rigorosa dos inputs para o teste
      const cleanUrl = url.trim().replace(/\/$/, "");
      const cleanKey = key.trim().replace(/^Bearer\s+/i, "");
      
      const response = await fetch(`${cleanUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': cleanKey,
          'Authorization': `Bearer ${cleanKey}`
        }
      });

      let errorDetail = "";
      try {
        const body = await response.json();
        if (body && body.message) {
          errorDetail = `\n\nDetalhe do Servidor: ${body.message}`;
          if (body.message.includes("schema") && body.message.includes("forbidden")) {
            errorDetail += "\n\n💡 SOLUÇÃO DEFINITIVA:\n1. No Supabase, vá em Settings > API.\n2. Em 'Exposed schemas', digite 'public' e clique em SAVE (mesmo que já esteja escrito).\n3. Isso reinicia a API e aplica as permissões que você deu no SQL Editor.";
          }
        }
      } catch (e) {
        // Se não for JSON, ignora o detalhe
      }

      if (response.ok || response.status === 200) {
        alert("✅ SUCESSO!\n\nConexão estabelecida. Este computador consegue acessar o banco de dados.");
      } else if (response.status === 401 || response.status === 403) {
        alert(`⚠️ FALHA DE AUTENTICAÇÃO (401/403)${errorDetail}\n\nO computador acessou o servidor, mas a 'API Key' foi recusada.`);
      } else if (response.status === 404) {
        alert("⚠️ URL INVÁLIDA (404)\n\nO servidor foi encontrado, mas o caminho da API não existe.\nVerifique se a URL termina corretamente em '.supabase.co'.");
      } else {
        alert(`⚠️ ERRO NO SERVIDOR\n\nCódigo: ${response.status}${errorDetail}`);
      }

    } catch (error: any) {
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
         alert("🚫 ERRO DE REDE (BLOQUEIO)\n\nO navegador NÃO conseguiu chegar ao servidor.\n\nCausas Prováveis:\n1. Firewall da empresa bloqueando 'supabase.co'.\n2. Data/Hora do computador errada (Falha SSL).\n3. Sem internet.\n4. Antivírus bloqueando a conexão.");
      } else {
         alert(`❌ Erro Desconhecido: ${error.message}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleTriggerReport = async (reportId: string) => {
    setTriggeringReportId(reportId);
    try {
      const response = await fetch(`/api/trigger-report/${reportId}`, {
        method: 'POST',
      });
      
      const data = await response.json();
      if (response.ok) {
        alert("✅ Relatório disparado com sucesso!");
        refreshData(); // Refresh to update last_sent
      } else {
        alert(`❌ Falha ao disparar relatório: ${data.error || 'Erro desconhecido'}`);
      }
    } catch (err: any) {
      console.error("Error triggering report:", err);
      alert(`❌ Erro ao conectar com o servidor: ${err.message}`);
    } finally {
      setTriggeringReportId(null);
    }
  };

  const handleSave = () => {
    let cleanedUrl = url.trim().replace(/\/$/, "");
    const cleanedKey = key.trim().replace(/^Bearer\s+/i, "");

    // Se o usuário colou apenas o ID (ex: seu-projeto-id), transforma em URL
    if (cleanedUrl && !cleanedUrl.includes('.') && !cleanedUrl.startsWith('http')) {
      cleanedUrl = `https://${cleanedUrl}.supabase.co`;
      setUrl(cleanedUrl);
    }

    if (cleanedUrl.startsWith('postgres://') || cleanedUrl.startsWith('postgresql://') || cleanedUrl.includes('@')) {
      alert("Erro: Você inseriu a String de Conexão do Banco de Dados (PostgreSQL).\n\nVocê deve usar a 'Project URL' (API REST).\n\n1. Vá em Project Settings > API no Supabase.\n2. Copie a URL que começa com 'https://'.");
      return;
    }

    if (cleanedUrl && !cleanedUrl.startsWith('https://')) {
      alert("Erro: A URL do projeto deve começar com 'https://'.");
      return;
    }

    if (cleanedUrl && !cleanedUrl.includes('.')) {
      alert("Erro: A URL deve ser o link completo (ex: https://xyz.supabase.co), não apenas o ID do projeto.");
      return;
    }

    const isNewFormat = cleanedKey.startsWith('sb_');
    if (cleanedKey && !isNewFormat && cleanedKey.length < 50) {
      alert("⚠️ CHAVE INVÁLIDA\n\nA API Key que você colou parece muito curta. \n\nSe a sua chave NÃO começa com 'sb_', ela deve ser um texto bem longo (JWT) começando com 'eyJ...'.\n\nCertifique-se de que copiou o código inteiro da 'Publishable key' ou 'anon' key.");
      return;
    }

    if (cleanedKey && isNewFormat && cleanedKey.length < 20) {
        alert("⚠️ CHAVE MUITO CURTA\n\nMesmo no formato novo (sb_), a chave deve ser mais longa que isso.");
        return;
    }

    if (cleanedUrl && cleanedKey) {
      saveSupabaseConfig(cleanedUrl, cleanedKey);
      setSaved(true);
      refreshData();
      setTimeout(() => setSaved(false), 3000);
    }
  };

  const handleClear = () => {
    clearSupabaseConfig();
    setUrl('');
    setKey('');
    refreshData();
  };

  const handleExport = async () => {
    try {
      const data = await db.exportAllData();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consorcio_backup_${getTodayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Falha ao exportar dados.");
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;
      
      if(!window.confirm("Atenção: Importar um backup irá substituir seus dados locais atuais. Deseja continuar?")) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = JSON.parse(event.target?.result as string);
              if(data.quotas) localStorage.setItem('consortium_quotas_db', JSON.stringify(data.quotas));
              if(data.indices) localStorage.setItem('consortium_indices_db', JSON.stringify(data.indices));
              if(data.administrators) localStorage.setItem('consortium_admins_db', JSON.stringify(data.administrators));
              if(data.companies) localStorage.setItem('consortium_companies_db', JSON.stringify(data.companies));
              if(data.payments) {
                  Object.keys(data.payments).forEach(key => {
                      localStorage.setItem(key, JSON.stringify(data.payments[key]));
                  });
              }
              if(data.credit_usages) localStorage.setItem('consortium_credit_usages_db', JSON.stringify(data.credit_usages));
              if(data.manual_transactions) localStorage.setItem('consortium_manual_transactions_db', JSON.stringify(data.manual_transactions));
              if(data.users) localStorage.setItem('consortium_users_db', JSON.stringify(data.users));
              
              alert('Backup restaurado com sucesso! Se estiver conectado à nuvem, você pode usar o botão "Sincronizar Local -> Nuvem" para subir esses dados.');
              refreshData();
          } catch (err) {
              console.error("Import failed:", err);
              alert("Falha ao importar arquivo. Verifique se o formato está correto.");
          }
      };
      reader.readAsText(file);
  };

  const handleCloudMigration = async () => {
    if (!isCloudConnected) {
      alert("Conecte ao Supabase primeiro.");
      return;
    }

    if (!window.confirm("Isso irá enviar todos os seus dados locais para o banco de dados na nuvem. Deseja continuar?")) {
      return;
    }

    setIsTesting(true);
    try {
      // 1. Get local data
      const localData = {
        quotas: JSON.parse(localStorage.getItem('consortium_quotas_db') || '[]'),
        indices: JSON.parse(localStorage.getItem('consortium_indices_db') || '[]'),
        administrators: JSON.parse(localStorage.getItem('consortium_admins_db') || '[]'),
        companies: JSON.parse(localStorage.getItem('consortium_companies_db') || '[]'),
        credit_usages: JSON.parse(localStorage.getItem('consortium_credit_usages_db') || '[]'),
        manual_transactions: JSON.parse(localStorage.getItem('consortium_manual_transactions_db') || '[]'),
        users: JSON.parse(localStorage.getItem('consortium_users_db') || '[]'),
        payments: Object.keys(localStorage).reduce((acc, key) => {
          if (key.startsWith('payments_')) {
            acc[key] = JSON.parse(localStorage.getItem(key) || '{}');
          }
          return acc;
        }, {} as any)
      };

      console.log("Migrando dados...", localData);

      // 2. Migration logic
      for (const admin of localData.administrators) await db.saveAdministrator(admin);
      for (const comp of localData.companies) await db.saveCompany(comp);
      for (const user of localData.users) await db.saveUser(user);
      for (const idx of localData.indices) await db.saveIndex(idx);
      for (const usage of localData.credit_usages) await db.saveCreditUsage(usage);
      for (const tx of localData.manual_transactions) await db.saveManualTransaction(tx);
      
      for (const quota of localData.quotas) {
        await db.saveQuota(quota);
        const pKey = `payments_${quota.id}`;
        if (localData.payments[pKey]) {
          const qPayments = localData.payments[pKey];
          for (const instNum of Object.keys(qPayments)) {
            await db.savePayment(quota.id, parseInt(instNum), qPayments[instNum]);
          }
        }
      }

      alert("✅ Sincronização concluída com sucesso!");
      refreshData();
    } catch (err: any) {
      console.error("Migration failed:", err);
      alert(`❌ Falha na sincronização: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const sqlScript = `
-- 1. MIGRATION: GARANTIR QUE COLUNAS DE ID SEJAM UUID
-- Este bloco corrige o erro "operator does not exist: text = uuid"
DO $$
BEGIN
    -- Converter users.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id' AND data_type = 'text') THEN
        ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::uuid;
    END IF;
    -- Converter companies.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'id' AND data_type = 'text') THEN
        ALTER TABLE companies ALTER COLUMN id TYPE UUID USING id::uuid;
    END IF;
    -- Converter quotas.id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'id' AND data_type = 'text') THEN
        ALTER TABLE quotas ALTER COLUMN id TYPE UUID USING id::uuid;
    END IF;
    -- Converter quotas.company_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'company_id' AND data_type = 'text') THEN
        ALTER TABLE quotas ALTER COLUMN company_id TYPE UUID USING company_id::uuid;
    END IF;
    -- Converter payments.quota_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'quota_id' AND data_type = 'text') THEN
        ALTER TABLE payments ALTER COLUMN quota_id TYPE UUID USING quota_id::uuid;
    END IF;
END $$;

-- 2. PERMISSÕES BÁSICAS DE SCHEMA
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- Garantir acesso explícito às tabelas para anon (necessário para login e bootstrap)
GRANT SELECT ON public.users TO anon;
GRANT SELECT ON public.companies TO anon;

-- 3. CRIAÇÃO DAS TABELAS (Caso não existam)
CREATE TABLE IF NOT EXISTS administrators (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT,
  role TEXT,
  permissions JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  company_id UUID REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS quotas (
    id UUID PRIMARY KEY,
    group_code TEXT NOT NULL,
    quota_number TEXT NOT NULL,
    contract_number TEXT,
    credit_value DECIMAL(15,2) NOT NULL,
    adhesion_date DATE,
    first_assembly_date DATE,
    term_months INTEGER,
    admin_fee_rate DECIMAL(10,5),
    reserve_fund_rate DECIMAL(10,5),
    product_type TEXT,
    due_day INTEGER,
    first_due_date DATE,
    correction_index TEXT,
    payment_plan TEXT,
    is_contemplated BOOLEAN DEFAULT FALSE,
    contemplation_date DATE,
    bid_free DECIMAL(15,2) DEFAULT 0,
    bid_embedded DECIMAL(15,2) DEFAULT 0,
    bid_total DECIMAL(15,2) DEFAULT 0,
    credit_manual_adjustment DECIMAL(15,2) DEFAULT 0,
    administrator_id UUID REFERENCES administrators(id),
    company_id UUID REFERENCES companies(id),
    bid_free_correction DECIMAL(15,2) DEFAULT 0,
    calculation_method TEXT DEFAULT 'LINEAR',
    index_table JSONB,
    acquired_from_third_party BOOLEAN DEFAULT FALSE,
    assumed_installment INTEGER,
    pre_paid_fc_percent DECIMAL(10,5),
    acquisition_cost DECIMAL(15,2),
    correction_rate_cap DECIMAL(10,5),
    index_reference_month INTEGER,
    bid_base TEXT,
    anticipate_correction_month BOOLEAN DEFAULT FALSE,
    prioritize_fees_in_bid BOOLEAN DEFAULT FALSE,
    is_draw_contemplation BOOLEAN DEFAULT FALSE,
    contract_file_url TEXT,
    is_announced BOOLEAN DEFAULT FALSE,
    announced_at TIMESTAMP WITH TIME ZONE,
    market_value_override DECIMAL(15,2),
    market_status TEXT DEFAULT 'DRAFT',
    market_notes TEXT
);

CREATE TABLE IF NOT EXISTS payments (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
    installment_number INTEGER NOT NULL,
    amount_paid DECIMAL(15,2),
    payment_date TIMESTAMP WITH TIME ZONE,
    manual_fc DECIMAL(15,2),
    manual_fr DECIMAL(15,2),
    manual_ta DECIMAL(15,2),
    manual_fine DECIMAL(15,2),
    manual_interest DECIMAL(15,2),
    manual_insurance DECIMAL(15,2),
    manual_amortization DECIMAL(15,2),
    manual_earnings DECIMAL(15,2),
    status TEXT DEFAULT 'PREVISTO',
    UNIQUE(quota_id, installment_number)
);

CREATE TABLE IF NOT EXISTS manual_transactions (
    id UUID PRIMARY KEY,
    quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    fc DECIMAL(15,2),
    fr DECIMAL(15,2),
    ta DECIMAL(15,2),
    insurance DECIMAL(15,2),
    amortization DECIMAL(15,2),
    fine DECIMAL(15,2),
    interest DECIMAL(15,2)
);

CREATE TABLE IF NOT EXISTS correction_indices (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    date DATE NOT NULL,
    rate DECIMAL(10,6) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_usages (
    id UUID PRIMARY KEY,
    quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    date DATE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    seller TEXT
);

CREATE TABLE IF NOT EXISTS credit_updates (
    id UUID PRIMARY KEY,
    quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    value DECIMAL(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS smtp_config (
    id TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    port INTEGER NOT NULL,
    secure BOOLEAN DEFAULT TRUE,
    user_name TEXT NOT NULL,
    password TEXT NOT NULL,
    from_name TEXT,
    from_email TEXT,
    report_recipient TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_reports (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT,
    message TEXT,
    frequency TEXT NOT NULL,
    selected_columns JSONB,
    filters JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    last_sent TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. FUNÇÕES DE APOIO PARA RLS (COM CASTS EXPLÍCITOS)
CREATE OR REPLACE FUNCTION is_admin() 
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_user_company_ids()
RETURNS uuid[] AS $$
DECLARE
    user_company_id uuid;
    allowed_ids jsonb;
    result_ids uuid[];
BEGIN
    SELECT company_id, permissions->'allowedCompanyIds' 
    INTO user_company_id, allowed_ids
    FROM users 
    WHERE id = auth.uid();

    IF user_company_id IS NOT NULL THEN
        result_ids := array_append(result_ids, user_company_id);
    END IF;

    IF allowed_ids IS NOT NULL AND jsonb_array_length(allowed_ids) > 0 THEN
        result_ids := ARRAY(
            SELECT DISTINCT unnest(
                array_cat(
                    COALESCE(result_ids, '{}'::uuid[]),
                    ARRAY(SELECT jsonb_array_elements_text(allowed_ids)::uuid)
                )
            )
        );
    END IF;

    RETURN result_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. APLICAÇÃO DE RLS
DO $$ 
DECLARE pol record;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Políticas simplificadas com casts
CREATE POLICY "allow_anon_read_users" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "allow_initial_bootstrap" ON users FOR INSERT TO anon WITH CHECK (NOT EXISTS (SELECT 1 FROM users));
CREATE POLICY "users_view_self" ON users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "admins_full_access_users" ON users FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "view_allowed_companies" ON companies FOR SELECT TO authenticated USING (id = ANY(get_user_company_ids()) OR is_admin());
CREATE POLICY "admins_modify_companies" ON companies FOR ALL TO authenticated USING (is_admin());

CREATE POLICY "quota_isolation" ON quotas FOR ALL TO authenticated 
USING (company_id = ANY(get_user_company_ids()) OR is_admin());

CREATE POLICY "payment_isolation" ON payments FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM quotas WHERE id = quota_id AND (company_id = ANY(get_user_company_ids()) OR is_admin())));

CREATE POLICY "manual_tx_isolation" ON manual_transactions FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM quotas WHERE id = quota_id AND (company_id = ANY(get_user_company_ids()) OR is_admin())));

CREATE POLICY "view_shared" ON administrators FOR SELECT TO authenticated USING (true);
CREATE POLICY "view_indices" ON correction_indices FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins_modify_shared" ON administrators FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "admins_modify_indices" ON correction_indices FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "admin_full_access_system" ON smtp_config FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "admin_reports_access" ON scheduled_reports FOR ALL TO authenticated USING (is_admin());

-- 6. GARANTIR ADMIN PADRÃO
INSERT INTO users (id, email, name, password, role, is_active, permissions)
VALUES (
  '00000000-0000-0000-0000-000000000000', 
  'renzo.amaral@gmail.com', 
  'Administrador Geral', 
  '123', 
  'ADMIN', 
  true, 
  '{"canViewDashboard": true, "canManageQuotas": true, "canSimulate": true, "canViewReports": true, "canManageSettings": true, "canMarkQuotas": true}'
)
ON CONFLICT (email) DO UPDATE SET is_active = EXCLUDED.is_active, role = EXCLUDED.role;
  `;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlScript);
    alert("SQL copiado para a área de transferência!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10 pt-4">
      {/* Email Config */}
      <EmailSettings />

      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Erro de Conexão Detectado</p>
            <p className="text-sm">{connectionError}</p>
          </div>
        </div>
      )}

      {/* Scheduled Reports Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6 bg-white rounded-lg">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
            <Calendar size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Relatórios Agendados</h2>
            <p className="text-sm text-slate-500">Gerencie os relatórios que são enviados automaticamente por e-mail.</p>
          </div>
        </div>

        {scheduledReports.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
            <Mail className="mx-auto text-slate-300 mb-2" size={32} />
            <p className="text-slate-400 text-sm">Nenhum relatório agendado encontrado.</p>
            <p className="text-slate-400 text-xs mt-1">Agende um novo relatório na página de Relatórios.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nome</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Frequência</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Destinatário</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status/Último Envio</th>
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scheduledReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-slate-700">{report.name}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
                        {report.frequency === 'DAILY' || report.frequency === 'daily' ? 'Diário' : 
                         report.frequency === 'WEEKLY' || report.frequency === 'weekly' ? 'Semanal' : 
                         report.frequency === 'MONTHLY' || report.frequency === 'monthly' ? 'Mensal' : 'Nenhum'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">{report.recipient}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-slate-400" />
                          <span>{report.lastSent ? new Date(report.lastSent).toLocaleString('pt-BR') : 'Nunca Enviado'}</span>
                        </div>
                        {report.lastError && (
                          <div className="flex items-start gap-1.5 mt-1 p-2 bg-red-50 border border-red-100 rounded text-[10px] text-red-700 max-w-xs">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-500" />
                            <div className="flex flex-col">
                              <span className="font-bold">Falha no último envio:</span>
                              <span className="break-words line-clamp-2 md:line-clamp-none">{report.lastError}</span>
                              {report.lastError.includes('Senha de App') && (
                                <button 
                                  onClick={() => alert('Para corrigir este erro:\n1. Acesse sua Conta Google (Segurança)\n2. Ative Verificação em Duas Etapas\n3. Crie uma "Senha de App"\n4. Copie o código de 16 letras\n5. Cole no campo de Senha SMTP em Configurações de E-mail')}
                                  className="text-blue-600 font-bold hover:underline mt-1 text-left"
                                >
                                  Ver como resolver
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleTriggerReport(report.id)}
                          disabled={triggeringReportId === report.id}
                          className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Disparar e-mail agora"
                        >
                          {triggeringReportId === report.id ? <Activity size={18} className="animate-spin" /> : <Mail size={18} />}
                        </button>
                        <button
                          onClick={() => {
                            setEditingReport(report);
                            setIsEditModalOpen(true);
                          }}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar agendamento"
                        >
                          <Calendar size={18} />
                        </button>
                        <button
                          onClick={() => {
                            deleteScheduledReport(report.id);
                          }}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir agendamento"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Database Config */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6 bg-white rounded-lg">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-full">
            <Cloud size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Conexão Supabase (Nuvem)</h2>
            <p className="text-sm text-slate-500">Insira as credenciais da API do seu projeto.</p>
          </div>
        </div>

        <div className="space-y-4">
          {serverConfig && !serverConfig.isConfigured && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-lg flex items-start gap-3 mb-4">
              <AlertTriangle className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Atenção: Agendador não configurado no Servidor</p>
                <p className="text-sm">
                  Os relatórios agendados são processados pelo servidor. Para que funcionem, você deve configurar as variáveis de ambiente 
                  <strong>SUPABASE_URL</strong> e <strong>SUPABASE_ANON_KEY</strong> no menu <strong>Settings</strong> do AI Studio.
                </p>
              </div>
            </div>
          )}
          
          {serverConfig && serverConfig.isConfigured && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg flex items-start gap-3 mb-4">
              <CheckCircle className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">Servidor Conectado</p>
                <p className="text-xs">
                  O servidor está conectado ao Supabase ({serverConfig.url}). Os relatórios agendados serão processados automaticamente.
                </p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-4">
            <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-2">
              <Info size={16} /> Como obter as credenciais corretas:
            </h3>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal ml-4">
              <li>Acesse seu painel no <strong>Supabase.com</strong>.</li>
              <li>Vá em <strong>Project Settings</strong> (ícone de engrenagem) &gt; <strong>API</strong>.</li>
              <li>Em <strong>Project URL</strong>, copie a URL (ex: <code>https://xyz.supabase.co</code>).</li>
              <li>Em <strong>Project API Keys</strong>, procure por <code>anon</code> (public). <strong>NÃO use a service_role</strong>.</li>
              <li>Clique em <strong>Copy</strong> na chave <code>anon</code> (é um texto bem longo começando com <code>eyJ...</code>).</li>
            </ol>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 bg-white">Project URL (API)</label>
            <input 
              type="text" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyzproject.supabase.co"
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1 bg-white">API Key (anon/public)</label>
            <input 
              type="password" 
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button 
            onClick={handleSave}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Save size={18} /> Salvar Conexão
          </button>
          
          <button 
            onClick={handleTestConnection}
            disabled={isTesting || !url || !key}
            className="px-4 py-2.5 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            title="Diagnosticar problemas de conexão"
          >
             {isTesting ? <Activity size={18} className="animate-spin" /> : <Wifi size={18} />}
             {isTesting ? "Testando..." : "Testar Conexão"}
          </button>

          {saved && <span className="flex items-center text-emerald-600 text-sm"><CheckCircle size={16} className="mr-1"/> Salvo!</span>}
          
          {(url || key) && (
             <button 
              onClick={handleClear}
              className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors ml-auto"
            >
              Desconectar
            </button>
          )}
        </div>
        <p className="mt-4 text-xs text-slate-400">
           Dica: Se a conexão for perdida ao atualizar o sistema, você pode editar o arquivo <code>services/supabaseClient.ts</code> e preencher as variáveis <code>FIXED_URL</code> e <code>FIXED_KEY</code> para fixá-las permanentemente.
        </p>
      </div>

      {/* SQL Helper */}
      <div className="bg-slate-900 rounded-xl shadow-lg border border-slate-800 p-6 text-slate-300">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Configuração do Banco de Dados</h3>
          </div>
          <button onClick={copyToClipboard} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded flex items-center gap-2">
            <Copy size={14} /> Copiar SQL
          </button>
        </div>
        
        {connectionError && (connectionError.includes('Tabela') || connectionError.includes('column') || connectionError.includes('constraint') || connectionError.includes('manual_transactions') || connectionError.includes('smtp_config') || connectionError.includes('recursion')) && (
            <div className="bg-amber-600/20 border border-amber-600 text-amber-100 p-3 rounded mb-4 text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                <div>
                    <p className="font-bold">Ação Necessária: Estrutura ou Permissões Desatualizadas</p>
                    <p className="mt-1">
                        Se você encontrar erros de <strong>"infinite recursion"</strong> ou tabelas ausentes, copie o SQL abaixo e rode no SQL Editor do Supabase. 
                        Isso corrigirá as políticas de segurança e a estrutura das tabelas.
                    </p>
                </div>
            </div>
        )}

        <div className="bg-black/50 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-slate-700">
          <pre className="text-emerald-400">
            {sqlScript}
          </pre>
        </div>
        
        <div className="mt-4 flex gap-2 text-sm text-slate-400 bg-slate-800 p-3 rounded-lg border border-slate-700 items-start">
           <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
           <p>
             Copie o código acima e execute no <strong>SQL Editor</strong> do seu painel Supabase para criar ou atualizar as tabelas necessárias.
           </p>
        </div>
      </div>
      
      {/* Backup Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-6 bg-white rounded-lg">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-full">
            <Database size={24} />
            </div>
            <div>
            <h2 className="text-lg font-semibold text-slate-800">Backup e Dados</h2>
            <p className="text-sm text-slate-500">Exporte seus dados (Local + Nuvem) para um arquivo ou restaure um backup local.</p>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleExport} className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors">
                <Download size={18}/> Salvar Backup Completo (JSON)
            </button>
            
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer">
                <Upload size={18}/> Restaurar Backup Local
                <input type="file" accept=".json" className="hidden" onChange={handleImport}/>
            </label>

            {isCloudConnected && (
              <button 
                onClick={handleCloudMigration} 
                disabled={isTesting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isTesting ? <Activity size={18} className="animate-spin" /> : <Cloud size={18}/>}
                Sincronizar Local {"->"} Nuvem
              </button>
            )}

            <button 
              onClick={() => {
                if(window.confirm("⚠️ ATENÇÃO: Isso irá apagar TODOS os dados locais e desconectar do Supabase. Esta ação é irreversível. Deseja continuar?")) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-auto"
            >
              <AlertTriangle size={18}/> Resetar Aplicativo
            </button>
        </div>
        {isCloudConnected && (
            <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle size={12} />
                O backup agora inclui dados sincronizados do Supabase.
            </p>
        )}
      </div>
      {/* Modal de Edição de Agendamento */}
      {editingReport && (
        <SendEmailModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingReport(null);
          }}
          onSend={async (config) => {
            try {
              await addScheduledReport({
                id: editingReport.id,
                name: config.reportName,
                recipient: config.recipient,
                subject: config.subject,
                message: config.message,
                frequency: config.frequency,
                selectedColumns: config.selectedColumns,
                filters: config.filters,
                isActive: true,
                createdAt: editingReport.createdAt || new Date().toISOString()
              });
              setIsEditModalOpen(false);
              setEditingReport(null);
              alert('Agendamento atualizado com sucesso!');
            } catch (error) {
              console.error('Erro ao atualizar agendamento:', error);
              alert('Erro ao atualizar agendamento. Verifique o console.');
            }
          }}
          defaultRecipient={editingReport.recipient}
          defaultSubject={editingReport.subject}
          defaultMessage={editingReport.message}
          defaultSelectedColumns={typeof editingReport.selected_columns === 'string' ? JSON.parse(editingReport.selected_columns) : editingReport.selected_columns}
          defaultFrequency={editingReport.frequency}
          defaultReportName={editingReport.name}
          defaultSaveAsScheduled={true}
          availableColumns={AVAILABLE_REPORT_COLUMNS}
          currentFilters={typeof editingReport.filters === 'string' ? JSON.parse(editingReport.filters) : editingReport.filters}
          companies={companies}
          administrators={administrators}
        />
      )}
    </div>
  );
};

export default Settings;
