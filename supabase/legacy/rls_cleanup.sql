-- =============================================================
-- LIMPEZA DE POLICIES INSEGURAS — RLS
-- ConsorcioManager Pro — Grupo Líder
-- =============================================================
--
-- CONTEXTO:
-- A query de verificação revelou policies antigas que concedem
-- acesso ao role 'anon' (público), tornando o RLS ineficaz:
--
--   "Allow select for all"   → inclui anon
--   "Allow insert for all"   → inclui anon
--   "Allow update for all"   → inclui anon
--   "Allow delete for all"   → inclui anon
--   "public_read_*"          → leitura pública explícita
--   "auth_all_*"             → origem desconhecida, remover por segurança
--   "rls_*_read/insert/update" → origem desconhecida, remover por segurança
--
-- REGRA NO SUPABASE: policies são combinadas com OR.
-- Se QUALQUER policy libera 'anon', o dado fica exposto.
-- A solução é manter APENAS 'authenticated_full_access'.
--
-- INSTRUÇÕES: Execute no SQL Editor do Supabase.
-- =============================================================


-- -----------------------------------------------------------
-- PASSO 1: Remover todas as policies inseguras em cada tabela
-- -----------------------------------------------------------

-- quotas
DROP POLICY IF EXISTS "Allow select for all"         ON quotas;
DROP POLICY IF EXISTS "Allow insert for all"         ON quotas;
DROP POLICY IF EXISTS "Allow update for all"         ON quotas;
DROP POLICY IF EXISTS "Allow delete for all"         ON quotas;
DROP POLICY IF EXISTS "public_read_quotas"           ON quotas;
DROP POLICY IF EXISTS "auth_all_quotas"              ON quotas;
DROP POLICY IF EXISTS "rls_quotas_read"              ON quotas;
DROP POLICY IF EXISTS "rls_quotas_insert"            ON quotas;
DROP POLICY IF EXISTS "rls_quotas_update"            ON quotas;

-- payments
DROP POLICY IF EXISTS "Allow select for all"         ON payments;
DROP POLICY IF EXISTS "Allow insert for all"         ON payments;
DROP POLICY IF EXISTS "Allow update for all"         ON payments;
DROP POLICY IF EXISTS "Allow delete for all"         ON payments;
DROP POLICY IF EXISTS "public_read_payments"         ON payments;
DROP POLICY IF EXISTS "auth_all_payments"            ON payments;
DROP POLICY IF EXISTS "rls_payments_read"            ON payments;
DROP POLICY IF EXISTS "rls_payments_insert"          ON payments;
DROP POLICY IF EXISTS "rls_payments_update"          ON payments;

-- correction_indices
DROP POLICY IF EXISTS "Allow select for all"                ON correction_indices;
DROP POLICY IF EXISTS "Allow insert for all"                ON correction_indices;
DROP POLICY IF EXISTS "Allow update for all"                ON correction_indices;
DROP POLICY IF EXISTS "Allow delete for all"                ON correction_indices;
DROP POLICY IF EXISTS "public_read_correction_indices"      ON correction_indices;
DROP POLICY IF EXISTS "auth_all_correction_indices"         ON correction_indices;
DROP POLICY IF EXISTS "rls_correction_indices_read"         ON correction_indices;
DROP POLICY IF EXISTS "rls_correction_indices_insert"       ON correction_indices;
DROP POLICY IF EXISTS "rls_correction_indices_update"       ON correction_indices;

-- administrators
DROP POLICY IF EXISTS "Allow select for all"                ON administrators;
DROP POLICY IF EXISTS "Allow insert for all"                ON administrators;
DROP POLICY IF EXISTS "Allow update for all"                ON administrators;
DROP POLICY IF EXISTS "Allow delete for all"                ON administrators;
DROP POLICY IF EXISTS "public_read_administrators"          ON administrators;
DROP POLICY IF EXISTS "auth_all_administrators"             ON administrators;
DROP POLICY IF EXISTS "rls_administrators_read"             ON administrators;
DROP POLICY IF EXISTS "rls_administrators_insert"           ON administrators;
DROP POLICY IF EXISTS "rls_administrators_update"           ON administrators;

-- companies
DROP POLICY IF EXISTS "Allow select for all"         ON companies;
DROP POLICY IF EXISTS "Allow insert for all"         ON companies;
DROP POLICY IF EXISTS "Allow update for all"         ON companies;
DROP POLICY IF EXISTS "Allow delete for all"         ON companies;
DROP POLICY IF EXISTS "public_read_companies"        ON companies;
DROP POLICY IF EXISTS "auth_all_companies"           ON companies;
DROP POLICY IF EXISTS "rls_companies_read"           ON companies;
DROP POLICY IF EXISTS "rls_companies_insert"         ON companies;
DROP POLICY IF EXISTS "rls_companies_update"         ON companies;

-- credit_usages
DROP POLICY IF EXISTS "Allow select for all"                ON credit_usages;
DROP POLICY IF EXISTS "Allow insert for all"                ON credit_usages;
DROP POLICY IF EXISTS "Allow update for all"                ON credit_usages;
DROP POLICY IF EXISTS "Allow delete for all"                ON credit_usages;
DROP POLICY IF EXISTS "public_read_credit_usages"           ON credit_usages;
DROP POLICY IF EXISTS "auth_all_credit_usages"              ON credit_usages;
DROP POLICY IF EXISTS "rls_credit_usages_read"              ON credit_usages;
DROP POLICY IF EXISTS "rls_credit_usages_insert"            ON credit_usages;
DROP POLICY IF EXISTS "rls_credit_usages_update"            ON credit_usages;

-- manual_transactions
DROP POLICY IF EXISTS "Allow select for all"                    ON manual_transactions;
DROP POLICY IF EXISTS "Allow insert for all"                    ON manual_transactions;
DROP POLICY IF EXISTS "Allow update for all"                    ON manual_transactions;
DROP POLICY IF EXISTS "Allow delete for all"                    ON manual_transactions;
DROP POLICY IF EXISTS "public_read_manual_transactions"         ON manual_transactions;
DROP POLICY IF EXISTS "auth_all_manual_transactions"            ON manual_transactions;
DROP POLICY IF EXISTS "rls_manual_transactions_read"            ON manual_transactions;
DROP POLICY IF EXISTS "rls_manual_transactions_insert"          ON manual_transactions;
DROP POLICY IF EXISTS "rls_manual_transactions_update"          ON manual_transactions;

-- credit_updates
DROP POLICY IF EXISTS "Allow select for all"                ON credit_updates;
DROP POLICY IF EXISTS "Allow insert for all"                ON credit_updates;
DROP POLICY IF EXISTS "Allow update for all"                ON credit_updates;
DROP POLICY IF EXISTS "Allow delete for all"                ON credit_updates;
DROP POLICY IF EXISTS "public_read_credit_updates"          ON credit_updates;
DROP POLICY IF EXISTS "auth_all_credit_updates"             ON credit_updates;
DROP POLICY IF EXISTS "rls_credit_updates_read"             ON credit_updates;
DROP POLICY IF EXISTS "rls_credit_updates_insert"           ON credit_updates;
DROP POLICY IF EXISTS "rls_credit_updates_update"           ON credit_updates;

-- smtp_config
DROP POLICY IF EXISTS "Allow select for all"                ON smtp_config;
DROP POLICY IF EXISTS "Allow insert for all"                ON smtp_config;
DROP POLICY IF EXISTS "Allow update for all"                ON smtp_config;
DROP POLICY IF EXISTS "Allow delete for all"                ON smtp_config;
DROP POLICY IF EXISTS "public_read_smtp_config"             ON smtp_config;
DROP POLICY IF EXISTS "auth_all_smtp_config"                ON smtp_config;

-- scheduled_reports
DROP POLICY IF EXISTS "Allow select for all"                    ON scheduled_reports;
DROP POLICY IF EXISTS "Allow insert for all"                    ON scheduled_reports;
DROP POLICY IF EXISTS "Allow update for all"                    ON scheduled_reports;
DROP POLICY IF EXISTS "Allow delete for all"                    ON scheduled_reports;
DROP POLICY IF EXISTS "public_read_scheduled_reports"           ON scheduled_reports;
DROP POLICY IF EXISTS "auth_all_scheduled_reports"              ON scheduled_reports;

-- users (limpar policy duplicada antiga, se existir)
DROP POLICY IF EXISTS "users_authenticated_all"             ON users;


-- -----------------------------------------------------------
-- PASSO 2: Verificação final
-- Resultado esperado: policy_count = 1 em todas as tabelas,
-- apenas "authenticated_full_access"
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
