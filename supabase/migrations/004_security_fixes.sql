-- 004_security_fixes.sql
-- Corrige avisos de segurança reportados pelo Supabase Advisor

-- ─── 1. Revogar grant PUBLIC nas funções SECURITY DEFINER ────────────────────
-- Por padrão PostgreSQL concede EXECUTE a PUBLIC (= anon + authenticated).
-- Revogar de roles individuais não basta — é preciso revogar do PUBLIC.

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_id()   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_set_tenant_id() FROM PUBLIC;

-- ─── 2. Regranar EXECUTE só para authenticated nas funções usadas por RLS ─────
-- auto_set_tenant_id é trigger exclusivamente — não recebe grant.

GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin()   TO authenticated;

-- ─── 3. Corrigir RLS de correction_indices ───────────────────────────────────
-- Dado público de mercado: qualquer autenticado pode ler,
-- mas escrita restrita a SUPER_ADMIN (evita adulteração de índices)

DROP POLICY IF EXISTS authenticated_full_access  ON public.correction_indices;
DROP POLICY IF EXISTS correction_indices_read    ON public.correction_indices;
DROP POLICY IF EXISTS correction_indices_write   ON public.correction_indices;

CREATE POLICY correction_indices_read ON public.correction_indices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY correction_indices_write ON public.correction_indices
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 4. create_standard_policies ────────────────────────────────────────────
-- Aviso do Supabase Advisor ignorado: função não existe no banco (falso positivo)
