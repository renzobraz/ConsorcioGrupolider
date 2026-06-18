/**
 * Testes unitários para utils/validateSupabaseCredentials.ts
 *
 * Cobre os dois validadores exportados:
 *   - isValidSupabaseUrl  — formato https://, rejeita strings de conexão postgres
 *   - isValidSupabaseKey  — JWT (3 segmentos base64url) OU formato novo sb_
 */

import { describe, it, expect } from 'vitest';
import {
  isValidSupabaseUrl,
  isValidSupabaseKey,
} from '../utils/validateSupabaseCredentials';

// ─── isValidSupabaseUrl ────────────────────────────────────────────────────────

describe('isValidSupabaseUrl', () => {
  it('URL vazia retorna inválida', () => {
    expect(isValidSupabaseUrl('').valid).toBe(false);
  });

  it('URL supabase.co padrão é válida', () => {
    const r = isValidSupabaseUrl('https://xyzproject.supabase.co');
    expect(r.valid).toBe(true);
    expect(r.error).toBe('');
  });

  it('URL sem https:// é inválida', () => {
    const r = isValidSupabaseUrl('http://xyzproject.supabase.co');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/https/i);
  });

  it('string de conexão postgres:// é inválida', () => {
    const r = isValidSupabaseUrl('postgres://user:pass@db.supabase.co:5432/postgres');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/postgres|REST/i);
  });

  it('URL com @ (string de conexão disfarçada) é inválida', () => {
    const r = isValidSupabaseUrl('https://user@db.supabase.co');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/postgres|REST/i);
  });

  it('URL não-parseável é inválida', () => {
    const r = isValidSupabaseUrl('https://not a valid url!!');
    expect(r.valid).toBe(false);
  });

  it('URL self-hosted (não .supabase.co) ainda é aceita', () => {
    const r = isValidSupabaseUrl('https://supabase.mycompany.internal');
    expect(r.valid).toBe(true);
  });

  it('trailing slash é tolerado (limpo internamente)', () => {
    const r = isValidSupabaseUrl('https://xyzproject.supabase.co/');
    expect(r.valid).toBe(true);
  });
});

// ─── isValidSupabaseKey ────────────────────────────────────────────────────────

describe('isValidSupabaseKey', () => {
  const VALID_JWT =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
    '.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ' +
    '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  it('chave vazia retorna inválida', () => {
    expect(isValidSupabaseKey('').valid).toBe(false);
  });

  it('JWT válido (eyJ...) é aceito', () => {
    const r = isValidSupabaseKey(VALID_JWT);
    expect(r.valid).toBe(true);
    expect(r.error).toBe('');
  });

  it('JWT com apenas 2 segmentos é inválido', () => {
    const r = isValidSupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/JWT|segmento/i);
  });

  it('JWT com 4 segmentos é inválido', () => {
    const r = isValidSupabaseKey('eyJa.eyJb.sig.extra');
    expect(r.valid).toBe(false);
  });

  it('JWT que não começa com eyJ é inválido', () => {
    const r = isValidSupabaseKey('abc.def.ghi');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/eyJ/i);
  });

  it('JWT com caracteres inválidos no payload é inválido', () => {
    const r = isValidSupabaseKey('eyJhbGci.ey!!INVALID.sig');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/inválido|caracteres/i);
  });

  it('prefixo "Bearer " é ignorado antes de validar', () => {
    const r = isValidSupabaseKey(`Bearer ${VALID_JWT}`);
    expect(r.valid).toBe(true);
  });

  it('formato novo sb_ longo o suficiente é aceito', () => {
    const r = isValidSupabaseKey('sb_publishable_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890');
    expect(r.valid).toBe(true);
  });

  it('formato novo sb_ muito curto é inválido', () => {
    const r = isValidSupabaseKey('sb_pub_short');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/curta/i);
  });

  it('string aleatória sem formato reconhecido é inválida', () => {
    const r = isValidSupabaseKey('naoeumjwtnemsbformat123');
    expect(r.valid).toBe(false);
  });
});
