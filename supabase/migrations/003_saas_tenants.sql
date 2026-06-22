-- 003_saas_tenants.sql
-- Infra multi-tenant: planos de assinatura, tenants, isolamento por tenant_id

-- ─── 1. Novas tabelas ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_plans (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT          NOT NULL,
  description        TEXT,
  price_monthly      NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly       NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_quotas         INT,
  max_users          INT           NOT NULL DEFAULT 10,
  features           JSONB         NOT NULL DEFAULT '[]',
  is_active          BOOLEAN       NOT NULL DEFAULT true,
  mp_plan_id_monthly TEXT,
  mp_plan_id_yearly  TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT        NOT NULL,
  document             TEXT,
  email                TEXT        NOT NULL,
  plan_id              UUID        REFERENCES subscription_plans(id),
  status               TEXT        NOT NULL DEFAULT 'trial'
                                   CHECK (status IN ('trial','active','suspended','cancelled')),
  grace_period_days    INT         NOT NULL DEFAULT 7,
  trial_ends_at        TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  mp_subscription_id   TEXT,
  mp_preapproval_id    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 2. Plano e tenant padrão (Grupo Líder) ──────────────────────────────────

INSERT INTO subscription_plans (id, name, description, price_monthly, price_yearly, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Plano Proprietário',
  'Plano interno — Grupo Líder (uso próprio, sem cobrança)',
  0, 0, true
) ON CONFLICT (id) DO NOTHING;

INSERT INTO tenants (id, name, email, status, plan_id, grace_period_days)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Grupo Líder',
  'renzo.braz@grupolider.com.br',
  'active',
  '00000000-0000-0000-0000-000000000001',
  3650
) ON CONFLICT (id) DO NOTHING;

-- ─── 3. Adicionar tenant_id às tabelas existentes ─────────────────────────────
-- correction_indices é dado público de mercado — mantido global, SEM isolamento

ALTER TABLE quotas              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payments            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE administrators      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE companies           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE credit_usages       ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE manual_transactions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE credit_updates      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE users               ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE smtp_config         ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE scheduled_reports   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- Constraint: cada tenant tem no máximo uma config SMTP
ALTER TABLE smtp_config DROP CONSTRAINT IF EXISTS smtp_config_tenant_id_key;
ALTER TABLE smtp_config ADD CONSTRAINT smtp_config_tenant_id_key UNIQUE (tenant_id);

-- ─── 4. Migrar dados existentes para o Grupo Líder ────────────────────────────

UPDATE quotas              SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE payments            SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE administrators      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE companies           SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE credit_usages       SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE manual_transactions SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE credit_updates      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE users               SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE smtp_config         SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE scheduled_reports   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Promover renzo para SUPER_ADMIN
UPDATE public.users
SET role = 'SUPER_ADMIN'
WHERE id = (SELECT id FROM auth.users WHERE email = 'renzo.braz@grupolider.com.br' LIMIT 1);

-- ─── 5. Funções auxiliares ────────────────────────────────────────────────────

-- Retorna o tenant_id do usuário autenticado (SECURITY DEFINER contorna RLS de users)
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid()
$$;

-- Verifica se o usuário autenticado é SUPER_ADMIN
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  )
$$;

-- Trigger: auto-preenche tenant_id em inserts quando NULL
CREATE OR REPLACE FUNCTION public.auto_set_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_my_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Aplica o trigger nas 10 tabelas isoladas por tenant
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'quotas','payments','administrators','companies','credit_usages',
    'manual_transactions','credit_updates','users','smtp_config','scheduled_reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_auto_tenant_id ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_auto_tenant_id
       BEFORE INSERT ON %I
       FOR EACH ROW EXECUTE FUNCTION public.auto_set_tenant_id()',
      tbl
    );
  END LOOP;
END;
$$;

-- ─── 6. RLS: novas tabelas ────────────────────────────────────────────────────

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read_all    ON subscription_plans;
DROP POLICY IF EXISTS plans_write_admin ON subscription_plans;

CREATE POLICY plans_read_all ON subscription_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY plans_write_admin ON subscription_plans
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS tenants_access ON tenants;

CREATE POLICY tenants_access ON tenants
  FOR ALL TO authenticated
  USING    (id = public.get_my_tenant_id() OR public.is_super_admin())
  WITH CHECK (id = public.get_my_tenant_id() OR public.is_super_admin());

-- ─── 7. RLS: tabelas existentes — isolamento por tenant ──────────────────────

DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'quotas','payments','administrators','companies','credit_usages',
    'manual_transactions','credit_updates','smtp_config','scheduled_reports'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS authenticated_full_access ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    EXECUTE format('
      CREATE POLICY tenant_isolation ON %I
        FOR ALL TO authenticated
        USING    (tenant_id = public.get_my_tenant_id() OR public.is_super_admin())
        WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_super_admin())
    ', tbl);
  END LOOP;
END;
$$;

-- users: tratado separadamente (fora do loop acima)
DROP POLICY IF EXISTS authenticated_full_access ON users;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  FOR ALL TO authenticated
  USING    (tenant_id = public.get_my_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_super_admin());
