-- =============================================================
-- 002_rls_policies.sql
-- RLS: habilita segurança por linha em todas as tabelas
-- e garante acesso total apenas para usuários autenticados.
-- Aplicado em produção em 2026-06-17.
-- =============================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.quotas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.administrators     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_updates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smtp_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports  ENABLE ROW LEVEL SECURITY;

-- Remove políticas inseguras legadas (se existirem)
DO $$ DECLARE
  t TEXT;
  p TEXT;
  unsafe_policies TEXT[] := ARRAY[
    'Allow select for all', 'Allow insert for all', 'Allow update for all', 'Allow delete for all',
    'public_read_quotas', 'public_read_payments', 'public_read_correction_indices',
    'public_read_administrators', 'public_read_companies', 'public_read_credit_usages',
    'public_read_manual_transactions', 'public_read_credit_updates',
    'public_read_users', 'public_read_smtp_config', 'public_read_scheduled_reports',
    'auth_all_quotas', 'auth_all_payments', 'auth_all_correction_indices',
    'auth_all_administrators', 'auth_all_companies', 'auth_all_credit_usages',
    'auth_all_manual_transactions', 'auth_all_credit_updates',
    'auth_all_users', 'auth_all_smtp_config', 'auth_all_scheduled_reports'
  ];
  tables TEXT[] := ARRAY[
    'quotas', 'payments', 'correction_indices', 'administrators', 'companies',
    'credit_usages', 'manual_transactions', 'credit_updates', 'users', 'smtp_config', 'scheduled_reports'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOREACH p IN ARRAY unsafe_policies LOOP
      IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t AND policyname = p
      ) THEN
        EXECUTE format('DROP POLICY %I ON public.%I', p, t);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Cria a única política correta: acesso total para authenticated
CREATE POLICY authenticated_full_access ON public.quotas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.correction_indices
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.administrators
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.companies
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.credit_usages
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.manual_transactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.credit_updates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.users
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.smtp_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY authenticated_full_access ON public.scheduled_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verificação: deve retornar 11 linhas com policy_count=1
-- SELECT tablename, rowsecurity AS rls_enabled, count(policyname) AS policy_count
-- FROM pg_tables t
-- LEFT JOIN pg_policies p USING (schemaname, tablename)
-- WHERE t.schemaname = 'public'
-- GROUP BY tablename, rowsecurity
-- ORDER BY tablename;
