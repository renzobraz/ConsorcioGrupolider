
import React, { useState, useEffect } from 'react';
import { Save, Database, Cloud, CheckCircle, AlertTriangle, Copy, Info, Download, Upload } from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../services/supabaseClient';
import { useConsortium } from '../store/ConsortiumContext';

const Settings = () => {
  const { refreshData, isCloudConnected, connectionError } = useConsortium();
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const config = getSupabaseConfig();
    if (config.url) setUrl(config.url);
    if (config.key) setKey(config.key);
  }, []);

  const handleSave = () => {
    const cleanedUrl = url.trim();
    const cleanedKey = key.trim();

    if (cleanedUrl.startsWith('postgres://') || cleanedUrl.startsWith('postgresql://') || cleanedUrl.includes('@')) {
      alert("Erro: Você inseriu a String de Conexão do Banco de Dados (PostgreSQL).\n\nVocê deve usar a 'Project URL' (API REST).\n\n1. Vá em Project Settings > API no Supabase.\n2. Copie a URL que começa com 'https://'.");
      return;
    }

    if (cleanedUrl && !cleanedUrl.startsWith('https://')) {
      alert("Erro: A URL do projeto deve começar com 'https://'.");
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

  const handleExport = () => {
    const data = {
       quotas: JSON.parse(localStorage.getItem('consortium_quotas_db') || '[]'),
       indices: JSON.parse(localStorage.getItem('consortium_indices_db') || '[]'),
       administrators: JSON.parse(localStorage.getItem('consortium_admins_db') || '[]'),
       companies: JSON.parse(localStorage.getItem('consortium_companies_db') || '[]'),
       payments: Object.keys(localStorage).reduce((acc, key) => {
          if(key.startsWith('payments_')) {
             acc[key] = JSON.parse(localStorage.getItem(key) || '{}');
          }
          return acc;
       }, {} as any),
       credit_usages: JSON.parse(localStorage.getItem('consortium_credit_usages_db') || '[]')
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consorcio_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
              
              alert('Backup restaurado com sucesso! A página será recarregada.');
              window.location.reload();
          } catch (err) {
              alert('Erro ao ler arquivo de backup. Verifique se é um JSON válido.');
          }
      };
      reader.readAsText(file);
  };

  const sqlScript = `
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
  UNIQUE(group_code, quota_number) -- PREVENÇÃO DE DUPLICIDADE
);

-- Migração: Adicionar colunas se não existirem
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
  amount_paid DECIMAL(12, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  manual_fc DECIMAL(12, 2),
  manual_fr DECIMAL(12, 2),
  manual_ta DECIMAL(12, 2),
  manual_fine DECIMAL(12, 2),
  manual_interest DECIMAL(12, 2),
  UNIQUE(quota_id, installment_number)
);

-- Tabela de Uso do Crédito (Compras)
CREATE TABLE IF NOT EXISTS credit_usages (
  id UUID PRIMARY KEY,
  quota_id UUID REFERENCES quotas(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  seller TEXT
);

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
END
$$;

-- Tabela de Índices de Correção
CREATE TABLE IF NOT EXISTS correction_indices (
  id UUID PRIMARY KEY,
  type VARCHAR(10) NOT NULL,
  date DATE NOT NULL,
  rate DECIMAL(10, 4) NOT NULL
);

-- Políticas de Segurança (Row Level Security)
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usages ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem para evitar erro de duplicidade
DROP POLICY IF EXISTS "Public access for demo" ON quotas;
DROP POLICY IF EXISTS "Public access for demo" ON payments;
DROP POLICY IF EXISTS "Public access for demo" ON correction_indices;
DROP POLICY IF EXISTS "Public access for demo" ON administrators;
DROP POLICY IF EXISTS "Public access for demo" ON companies;
DROP POLICY IF EXISTS "Public access for demo" ON credit_usages;

-- Cria as políticas novamente
CREATE POLICY "Public access for demo" ON quotas FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON payments FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON correction_indices FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON administrators FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON companies FOR ALL USING (true);
CREATE POLICY "Public access for demo" ON credit_usages FOR ALL USING (true);
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlScript);
    alert("SQL copiado para a área de transferência!");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
        <p className="text-slate-500">Conecte seu aplicativo a um banco de dados PostgreSQL na nuvem ou gerencie backups.</p>
      </div>

      {connectionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Erro de Conexão Detectado</p>
            <p className="text-sm">{connectionError}</p>
          </div>
        </div>
      )}

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

        <div className="mt-6 flex gap-3">
          <button 
            onClick={handleSave}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Save size={18} /> Salvar Conexão
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
        
        {connectionError && (connectionError.includes('Tabela') || connectionError.includes('column') || connectionError.includes('constraint')) && (
            <div className="bg-amber-600/20 border border-amber-600 text-amber-100 p-3 rounded mb-4 text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5"/>
                <p>
                    <strong>Ação Necessária:</strong> Sua estrutura de banco de dados está desatualizada.
                    Copie o SQL abaixo e rode no SQL Editor do Supabase para corrigir tabelas, colunas e restrições de unicidade.
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
            <h2 className="text-lg font-semibold text-slate-800">Backup e Dados (Local)</h2>
            <p className="text-sm text-slate-500">Exporte seus dados para um arquivo ou restaure um backup.</p>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleExport} className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors">
                <Download size={18}/> Salvar Backup (JSON)
            </button>
            
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer">
                <Upload size={18}/> Restaurar Backup
                <input type="file" accept=".json" className="hidden" onChange={handleImport}/>
            </label>
        </div>
        {isCloudConnected && (
            <p className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle size={12} />
                Atenção: O backup acima salva apenas dados do navegador (Offline). Dados no Supabase não são exportados por aqui.
            </p>
        )}
      </div>
    </div>
  );
};

export default Settings;
