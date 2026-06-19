-- =============================================================
-- AUDITORIA DE SEGURANÇA — RLS (Row Level Security)
-- ConsorcioManager Pro — Grupo Líder
-- =============================================================
--
-- OBJETIVO: Bloquear acesso anônimo (anon key) a todos os dados.
-- Qualquer chamada direta à API REST do Supabase sem um JWT de
-- usuário autenticado será rejeitada.
--
-- COMO USAR:
--   1. Acesse o Supabase Dashboard → SQL Editor
--   2. Cole e execute este script completo
--   3. Confirme o resultado com a query de verificação no final
--
-- ARQUITETURA DE ACESSO:
--   - Browser (frontend) : usa VITE_SUPABASE_ANON_KEY + JWT do usuário → RLS aplicado
--   - Serverless (Vercel): usa SUPABASE_SERVICE_ROLE_KEY            → RLS bypassado
-- =============================================================


-- -----------------------------------------------------------
-- PASSO 1: Habilitar RLS em todas as tabelas sensíveis
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY é idempotente)
-- -----------------------------------------------------------

ALTER TABLE quotas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE correction_indices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE administrators      ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_updates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_config         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports   ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------
-- PASSO 2: Remover policies anteriores (evita conflitos em
-- re-execuções)
-- -----------------------------------------------------------

DROP POLICY IF EXISTS "authenticated_full_access" ON quotas;
DROP POLICY IF EXISTS "authenticated_full_access" ON payments;
DROP POLICY IF EXISTS "authenticated_full_access" ON correction_indices;
DROP POLICY IF EXISTS "authenticated_full_access" ON administrators;
DROP POLICY IF EXISTS "authenticated_full_access" ON companies;
DROP POLICY IF EXISTS "authenticated_full_access" ON credit_usages;
DROP POLICY IF EXISTS "authenticated_full_access" ON manual_transactions;
DROP POLICY IF EXISTS "authenticated_full_access" ON credit_updates;
DROP POLICY IF EXISTS "authenticated_full_access" ON users;
DROP POLICY IF EXISTS "authenticated_full_access" ON smtp_config;
DROP POLICY IF EXISTS "authenticated_full_access" ON scheduled_reports;

-- Remove nomes alternativos que possam existir de configs anteriores
DROP POLICY IF EXISTS "Enable all for authenticated" ON quotas;
DROP POLICY IF EXISTS "Enable all for authenticated" ON payments;
DROP POLICY IF EXISTS "Enable all for authenticated" ON correction_indices;
DROP POLICY IF EXISTS "Enable all for authenticated" ON administrators;
DROP POLICY IF EXISTS "Enable all for authenticated" ON companies;
DROP POLICY IF EXISTS "Enable all for authenticated" ON credit_usages;
DROP POLICY IF EXISTS "Enable all for authenticated" ON manual_transactions;
DROP POLICY IF EXISTS "Enable all for authenticated" ON credit_updates;
DROP POLICY IF EXISTS "Enable all for authenticated" ON users;
DROP POLICY IF EXISTS "Enable all for authenticated" ON smtp_config;
DROP POLICY IF EXISTS "Enable all for authenticated" ON scheduled_reports;


-- -----------------------------------------------------------
-- PASSO 3: Criar policies — acesso total para authenticated,
-- zero acesso para anon
-- -----------------------------------------------------------

-- quotas: dados financeiros + CPF/CNPJ do titular
CREATE POLICY "authenticated_full_access" ON quotas
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- payments: histórico detalhado de pagamentos por cota
CREATE POLICY "authenticated_full_access" ON payments
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- correction_indices: índices mensais (INCC, IPCA, CDI...)
CREATE POLICY "authenticated_full_access" ON correction_indices
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- administrators: cadastro de administradoras
CREATE POLICY "authenticated_full_access" ON administrators
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- companies: empresas compradoras com CPF/CNPJ
CREATE POLICY "authenticated_full_access" ON companies
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- credit_usages: utilizações de crédito pós-contemplação
CREATE POLICY "authenticated_full_access" ON credit_usages
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- manual_transactions: aportes e rendimentos manuais
CREATE POLICY "authenticated_full_access" ON manual_transactions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- credit_updates: atualizações de valor de crédito
CREATE POLICY "authenticated_full_access" ON credit_updates
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- users: perfis com roles e permissões
-- Nota: o auto-provisionamento (AuthContext.tsx) faz INSERT com o JWT
-- do novo usuário, portanto precisa de acesso total para authenticated.
CREATE POLICY "authenticated_full_access" ON users
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- smtp_config: credenciais de e-mail (host, user, senha)
-- O frontend lê estas credenciais para enviar e-mails via /api/send-email.
-- TODO futuro: mover o envio de e-mail completamente para serverless e
-- remover o acesso do frontend, restringindo esta tabela só a ADMIN.
CREATE POLICY "authenticated_full_access" ON smtp_config
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- scheduled_reports: relatórios agendados
CREATE POLICY "authenticated_full_access" ON scheduled_reports
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);


-- -----------------------------------------------------------
-- PASSO 4: Verificação — execute esta query após o script e
-- confirme que todas as tabelas têm rls_enabled = true e
-- policy_count >= 1
-- -----------------------------------------------------------

SELECT
  t.tablename,
  t.rowsecurity          AS rls_enabled,
  COUNT(p.policyname)    AS policy_count,
  STRING_AGG(p.policyname, ', ') AS policies
FROM pg_tables t
LEFT JOIN pg_policies p
  ON p.tablename = t.tablename
  AND p.schemaname = t.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'quotas', 'payments', 'correction_indices', 'administrators',
    'companies', 'credit_usages', 'manual_transactions', 'credit_updates',
    'users', 'smtp_config', 'scheduled_reports'
  )
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
