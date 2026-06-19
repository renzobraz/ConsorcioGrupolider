-- =============================================================
-- 001_initial_schema.sql
-- Schema inicial do ConsorcioManager Pro
-- Reconstruído em 2026-06-18 a partir de types.ts + database.ts
-- Aplicar no Supabase SQL Editor em ambiente novo/zerado
-- =============================================================

-- ============================================================
-- administrators
-- ============================================================
CREATE TABLE IF NOT EXISTS public.administrators (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

-- ============================================================
-- companies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  document      TEXT,
  document_type TEXT CHECK (document_type IN ('CPF', 'CNPJ'))
);

-- ============================================================
-- correction_indices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.correction_indices (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  date TEXT NOT NULL,   -- formato YYYY-MM-01
  rate NUMERIC NOT NULL
);

-- ============================================================
-- quotas  (tabela central)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quotas (
  id                          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code                  TEXT    NOT NULL,
  quota_number                TEXT    NOT NULL,
  contract_number             TEXT,
  credit_value                NUMERIC NOT NULL,
  adhesion_date               TEXT,
  first_assembly_date         TEXT,
  term_months                 INTEGER NOT NULL,
  admin_fee_rate              NUMERIC NOT NULL,
  reserve_fund_rate           NUMERIC NOT NULL,
  product_type                TEXT    NOT NULL CHECK (product_type IN ('VEICULO', 'IMOVEL')),
  due_day                     INTEGER NOT NULL DEFAULT 25,
  first_due_date              TEXT,
  correction_index            TEXT    NOT NULL,
  payment_plan                TEXT    NOT NULL,
  is_contemplated             BOOLEAN NOT NULL DEFAULT FALSE,
  contemplation_date          TEXT,
  bid_free                    NUMERIC,
  bid_embedded                NUMERIC,
  bid_total                   NUMERIC,
  credit_manual_adjustment    NUMERIC DEFAULT 0,
  administrator_id            UUID    REFERENCES public.administrators(id) ON DELETE SET NULL,
  company_id                  UUID    REFERENCES public.companies(id)      ON DELETE SET NULL,
  bid_free_correction         NUMERIC DEFAULT 0,
  calculation_method          TEXT    NOT NULL DEFAULT 'LINEAR',
  index_table                 JSONB,
  acquired_from_third_party   BOOLEAN DEFAULT FALSE,
  assumed_installment         INTEGER,
  pre_paid_fc_percent         NUMERIC,
  acquisition_cost            NUMERIC,
  correction_rate_cap         NUMERIC,
  index_reference_month       INTEGER,
  bid_base                    TEXT,
  anticipate_correction_month BOOLEAN DEFAULT FALSE,
  prioritize_fees_in_bid      BOOLEAN DEFAULT FALSE,
  is_draw_contemplation       BOOLEAN DEFAULT FALSE,
  stop_credit_correction      BOOLEAN DEFAULT FALSE,
  contract_file_url           TEXT,
  is_announced                BOOLEAN DEFAULT FALSE,
  announced_at                TEXT,
  market_value_override       NUMERIC,
  market_status               TEXT    DEFAULT 'DRAFT',
  market_notes                TEXT,
  holder_document             TEXT,
  marketplace_status          TEXT    DEFAULT 'none',
  asking_price                NUMERIC,
  reserve_fund_accumulated    NUMERIC,
  insurance_rate              NUMERIC,
  insurance_value             NUMERIC
);

-- ============================================================
-- payments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id            UUID    NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  installment_number  INTEGER NOT NULL,
  amount_paid         NUMERIC,
  manual_fc           NUMERIC,
  manual_fr           NUMERIC,
  manual_ta           NUMERIC,
  manual_fine         NUMERIC,
  manual_interest     NUMERIC,
  manual_insurance    NUMERIC,
  manual_amortization NUMERIC,
  manual_earnings     NUMERIC,
  status              TEXT DEFAULT 'PREVISTO',
  payment_date        TIMESTAMPTZ,
  UNIQUE (quota_id, installment_number)
);

-- ============================================================
-- credit_usages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_usages (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id    UUID    NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  description TEXT,
  date        TEXT    NOT NULL,
  amount      NUMERIC NOT NULL,
  seller      TEXT
);

-- ============================================================
-- manual_transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.manual_transactions (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id     UUID    NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  date         TEXT    NOT NULL,
  amount       NUMERIC NOT NULL,
  type         TEXT    NOT NULL,
  description  TEXT,
  fc           NUMERIC,
  fr           NUMERIC,
  ta           NUMERIC,
  insurance    NUMERIC,
  amortization NUMERIC,
  fine         NUMERIC,
  interest     NUMERIC
);

-- ============================================================
-- credit_updates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_updates (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  quota_id  UUID    NOT NULL REFERENCES public.quotas(id) ON DELETE CASCADE,
  date      TEXT    NOT NULL,
  value     NUMERIC NOT NULL
);

-- ============================================================
-- users  (espelha auth.users do Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID    PRIMARY KEY,
  email       TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
  permissions JSONB   NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  company_id  UUID    REFERENCES public.companies(id) ON DELETE SET NULL
);

-- ============================================================
-- smtp_config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.smtp_config (
  id               TEXT    PRIMARY KEY DEFAULT 'default',
  host             TEXT    NOT NULL,
  port             INTEGER NOT NULL DEFAULT 587,
  secure           BOOLEAN NOT NULL DEFAULT FALSE,
  user_name        TEXT    NOT NULL,
  password         TEXT    NOT NULL,
  from_name        TEXT,
  from_email       TEXT,
  report_recipient TEXT
);

-- ============================================================
-- scheduled_reports  (relatórios agendados via Vercel Cron)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  recipient        TEXT        NOT NULL,
  subject          TEXT,
  message          TEXT,
  frequency        TEXT        NOT NULL DEFAULT 'NONE',
  selected_columns JSONB       DEFAULT '[]',
  filters          JSONB       DEFAULT '{}',
  last_sent        TIMESTAMPTZ,
  last_error       TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
