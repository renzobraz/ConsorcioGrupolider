-- 004_security_fixes.sql
-- Corrige avisos de segurança reportados pelo Supabase Advisor

-- ─── 1. Revogar EXECUTE de anon nas funções SECURITY DEFINER ─────────────────
-- Funções internas não devem ser acessíveis via REST sem autenticação

REVOKE EXECUTE ON FUNCTION public.get_my_tenant_id()   FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_set_tenant_id() FROM anon;

-- ─── 2. Revogar EXECUTE de authenticated em auto_set_tenant_id ───────────────
-- Função de trigger exclusivamente — não deve ser chamada via RPC

REVOKE EXECUTE ON FUNCTION public.auto_set_tenant_id() FROM authenticated;

-- ─── 3. Corrigir RLS de correction_indices ───────────────────────────────────
-- Dado público de mercado: qualquer autenticado pode ler,
-- mas escrita restrita a SUPER_ADMIN (evita adulteração de índices)

DROP POLICY IF EXISTS authenticated_full_access ON public.correction_indices;

CREATE POLICY correction_indices_read ON public.correction_indices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY correction_indices_write ON public.correction_indices
  FOR ALL TO authenticated
  USING    (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 4. create_standard_policies ────────────────────────────────────────────
-- Aviso do Supabase Advisor ignorado: função não existe no banco (falso positivo)
