
import React, { useState, useEffect } from 'react';
import { Save, Database, Cloud, CheckCircle, AlertTriangle, Copy, Info, Download, Upload, Activity, Wifi, Trash2, Calendar, Mail } from 'lucide-react';
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

    // Se o usuário colou apenas o ID (ex: qxbuopbrsvxybektxobs), transforma em URL
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
              
              alert('Backup restaurado com sucesso! A página será recarregada.');
              window.location.reload();
          } catch (err) {
              console.error("Import failed:", err);
              alert("Falha ao importar arquivo. Verifique se o formato está correto.");
          }
      };
      reader.readAsText(file);
  };

  const sqlScript = `
-- COMANDO PARA LIBERAR ACESSO (Execute se receber erro 'Forbidden')
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;

-- Tabela de Configuração SMTP
CREATE TABLE IF NOT EXISTS smtp_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  secure BOOLEAN DEFAULT FALSE,
  user_name TEXT NOT NULL,
  password TEXT NOT NULL,
  from_name TEXT,
  from_email TEXT,
  report_recipient TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabela de Relatórios Agendados
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT,
  frequency TEXT NOT NULL,
  selected_columns JSONB NOT NULL,
  filters JSONB NOT NULL,
  last_sent TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Administradoras
CREATE TABLE IF NOT EXISTS administrators (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- Tabela de Empresas Compradoras
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- Tabela de Cotas
CREATE TABLE IF NOT EXISTS quotas (
  id UUID PRIMARY KEY,
  group_code VARCHAR(50) NOT NULL,
  quota_number VARCHAR(50) NOT NULL,
  contract_number VARCHAR(50),
  credit_value DECIMAL(12, 2) NOT NULL,
  adhesion_date DATE,
  first_assembly_date DATE,
  term_months INTEGER NOT NULL,
  admin_fee_rate DECIMAL(10, 4) NOT NULL, 
  reserve_fund_rate DECIMAL(5, 2) NOT NULL,
  product_type VARCHAR(20),
  due_day INTEGER DEFAULT 25,
  first_due_date DATE,
  correction_index VARCHAR(10),
  payment_plan VARCHAR(20),
  is_contemplated BOOLEAN DEFAULT FALSE,
  contemplation_date DATE,
  bid_free DECIMAL(12, 2) DEFAULT 0,
  bid_embedded DECIMAL(12, 2) DEFAULT 0,
  bid_total DECIMAL(12, 2) DEFAULT 0,
  credit_manual_adjustment DECIMAL(12, 2) DEFAULT 0,
  administrator_id UUID REFERENCES administrators(id),
  company_id UUID REFERENCES companies(id),
  bid_free_correction DECIMAL(12, 2) DEFAULT 0,
  calculation_method VARCHAR(30) DEFAULT 'LINEAR',
  index_table JSONB,
  acquired_from_third_party BOOLEAN DEFAULT FALSE,
  assumed_installment INTEGER,
  pre_paid_fc_percent DECIMAL(10, 4),
  acquisition_cost DECIMAL(12, 2),
  correction_rate_cap DECIMAL(10, 4),
  index_reference_month INTEGER,
  bid_base VARCHAR(20),
  anticipate_correction_month BOOLEAN DEFAULT FALSE,
  prioritize_fees_in_bid BOOLEAN DEFAULT FALSE,
  UNIQUE(group_code, quota_number) -- PREVENÇÃO DE DUPLICIDADE
);

-- Migração: Adicionar colunas se não existirem em quotas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'due_day') THEN
        ALTER TABLE quotas ADD COLUMN due_day INTEGER DEFAULT 25;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'credit_manual_adjustment') THEN
        ALTER TABLE quotas ADD COLUMN credit_manual_adjustment DECIMAL(12, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'administrator_id') THEN
        ALTER TABLE quotas ADD COLUMN administrator_id UUID REFERENCES administrators(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'company_id') THEN
        ALTER TABLE quotas ADD COLUMN company_id UUID REFERENCES companies(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'bid_free_correction') THEN
        ALTER TABLE quotas ADD COLUMN bid_free_correction DECIMAL(12, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'calculation_method') THEN
        ALTER TABLE quotas ADD COLUMN calculation_method VARCHAR(30) DEFAULT 'LINEAR';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'index_table') THEN
        ALTER TABLE quotas ADD COLUMN index_table JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'acquired_from_third_party') THEN
        ALTER TABLE quotas ADD COLUMN acquired_from_third_party BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'assumed_installment') THEN
        ALTER TABLE quotas ADD COLUMN assumed_installment INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'pre_paid_fc_percent') THEN
        ALTER TABLE quotas ADD COLUMN pre_paid_fc_percent DECIMAL(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'acquisition_cost') THEN
        ALTER TABLE quotas ADD COLUMN acquisition_cost DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'correction_rate_cap') THEN
        ALTER TABLE quotas ADD COLUMN correction_rate_cap DECIMAL(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'index_reference_month') THEN
        ALTER TABLE quotas ADD COLUMN index_reference_month INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'bid_base') THEN
        ALTER TABLE quotas ADD COLUMN bid_base VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'anticipate_correction_month') THEN
        ALTER TABLE quotas ADD COLUMN anticipate_correction_month BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'quotas' AND column_name = 'prioritize_fees_in_bid') THEN
        ALTER TABLE quotas ADD COLUMN prioritize_fees_in_bid BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- Adicionar Restrição de Unicidade se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'quotas' AND constraint_type = 'UNIQUE') THEN
        ALTER TABLE quotas ADD CONSTRAINT unique_group_quota UNIQUE (group_code, quota_number);
    END IF;
    ALTER TABLE quotas ALTER COLUMN admin_fee_rate TYPE DECIMAL(10, 4);
END
$$;

-- Tabela de Pagamentos
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  amount_paid DECIMAL(12, 2),
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  manual_fc DECIMAL(12, 2),
  manual_fr DECIMAL(12, 2),
  manual_ta DECIMAL(12, 2),
  manual_fine DECIMAL(12, 2),
  manual_interest DECIMAL(12, 2),
  manual_insurance DECIMAL(12, 2),
  manual_amortization DECIMAL(12, 2),
  manual_earnings DECIMAL(12, 2),
  status VARCHAR(20) DEFAULT 'PREVISTO',
  UNIQUE(quota_id, installment_number)
);

-- Migração: Adicionar colunas se não existirem em payments
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_fc') THEN
        ALTER TABLE payments ADD COLUMN manual_fc DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_fr') THEN
        ALTER TABLE payments ADD COLUMN manual_fr DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_ta') THEN
        ALTER TABLE payments ADD COLUMN manual_ta DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_fine') THEN
        ALTER TABLE payments ADD COLUMN manual_fine DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_interest') THEN
        ALTER TABLE payments ADD COLUMN manual_interest DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_insurance') THEN
        ALTER TABLE payments ADD COLUMN manual_insurance DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_amortization') THEN
        ALTER TABLE payments ADD COLUMN manual_amortization DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'manual_earnings') THEN
        ALTER TABLE payments ADD COLUMN manual_earnings DECIMAL(12, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'status') THEN
        ALTER TABLE payments ADD COLUMN status VARCHAR(20) DEFAULT 'PREVISTO';
    END IF;
    
    -- Make amount_paid nullable if it is currently NOT NULL
    ALTER TABLE payments ALTER COLUMN amount_paid DROP NOT NULL;
END
$$;

-- Tabela de Uso do Crédito (Compras)
CREATE TABLE IF NOT EXISTS credit_usages (
  id UUID PRIMARY KEY,
  quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  seller TEXT
);

-- Tabela de Lançamentos Manuais (Ajustes de Saldo)
CREATE TABLE IF NOT EXISTS manual_transactions (
  id UUID PRIMARY KEY,
  quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  type VARCHAR(20) NOT NULL,
  description TEXT
);

-- Tabela de Índices de Correção
CREATE TABLE IF NOT EXISTS correction_indices (
  id UUID PRIMARY KEY,
  type VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  rate DECIMAL(10, 4) NOT NULL
);

-- Tabela de Usuários
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password TEXT,
  role TEXT,
  permissions JSONB,
  is_active BOOLEAN DEFAULT TRUE
);

-- Políticas de Segurança (Row Level Security)
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem para evitar erro de duplicidade
DROP POLICY IF EXISTS "Public access for demo" ON quotas;
DROP POLICY IF EXISTS "Public access for demo" ON payments;
DROP POLICY IF EXISTS "Public access for demo" ON correction_indices;
DROP POLICY IF EXISTS "Public access for demo" ON administrators;
DROP POLICY IF EXISTS "Public access for demo" ON companies;
DROP POLICY IF EXISTS "Public access for demo" ON credit_usages;
DROP POLICY IF EXISTS "Public access for demo" ON manual_transactions;
DROP POLICY IF EXISTS "Public access for demo" ON users;
DROP POLICY IF EXISTS "Public access for demo" ON smtp_config;
DROP POLICY IF EXISTS "Public access for demo" ON scheduled_reports;

-- Cria as políticas novamente
CREATE POLICY "Public access for demo" ON quotas FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON payments FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON correction_indices FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON administrators FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON companies FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON credit_usages FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON manual_transactions FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON users FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON smtp_config FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON scheduled_reports FOR ALL USING (true);
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlScript);
    alert("SQL copiado para a área de transferência!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
        <p className="text-slate-500">Conecte seu aplicativo a um banco de dados PostgreSQL na nuvem ou gerencie backups.</p>
      </div>

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
                  <th className="py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Último Envio</th>
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
                      {report.last_sent ? new Date(report.last_sent).toLocaleString('pt-BR') : 'Nunca'}
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
        
        {connectionError && (connectionError.includes('Tabela') || connectionError.includes('column') || connectionError.includes('constraint') || connectionError.includes('manual_transactions') || connectionError.includes('smtp_config')) && (
            <div className="bg-amber-600/20 border border-amber-600 text-amber-100 p-3 rounded mb-4 text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                <p>
                    <strong>Ação Necessária:</strong> Sua estrutura de banco de dados está desatualizada ou faltam tabelas.
                    Copie o SQL abaixo e rode no SQL Editor do Supabase para corrigir tabelas, colunas e restrições.
                </p>
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
