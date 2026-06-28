-- Migration 005: Add missing columns to quotas table (idempotent)
-- These columns were added to the schema after the initial table creation in production.

ALTER TABLE public.quotas
  ADD COLUMN IF NOT EXISTS anticipate_correction_month BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prioritize_fees_in_bid      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_draw_contemplation       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stop_credit_correction      BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS contract_file_url           TEXT,
  ADD COLUMN IF NOT EXISTS is_announced                BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS announced_at                TEXT,
  ADD COLUMN IF NOT EXISTS market_value_override       NUMERIC,
  ADD COLUMN IF NOT EXISTS market_status               TEXT DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS market_notes                TEXT,
  ADD COLUMN IF NOT EXISTS holder_document             TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_status          TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS asking_price                NUMERIC,
  ADD COLUMN IF NOT EXISTS reserve_fund_accumulated    NUMERIC,
  ADD COLUMN IF NOT EXISTS insurance_rate              NUMERIC,
  ADD COLUMN IF NOT EXISTS insurance_value             NUMERIC;
