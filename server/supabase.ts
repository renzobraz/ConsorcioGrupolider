import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
// Serverless functions must use the Service Role Key to bypass RLS.
// NEVER use the anon key here — it would be blocked by RLS policies.
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

// Auto-fix if only project ID is provided
if (supabaseUrl && !supabaseUrl.includes('://')) {
  supabaseUrl = `https://${supabaseUrl}.supabase.co`;
}

const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

// Logging for server-side diagnostics
if (supabaseUrl) {
  if (!isValidUrl(supabaseUrl)) {
    console.error(`❌ SUPABASE_URL inválida no servidor: "${supabaseUrl}". Deve começar com https://`);
  } else {
    console.log(`✅ Supabase URL detectada no servidor: ${supabaseUrl.substring(0, 20)}...`);
  }
} else {
  console.log('ℹ️ SUPABASE_URL não encontrada no ambiente do servidor. Relatórios agendados estão desativados.');
}

if (!supabaseKey) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY não encontrada no ambiente do servidor. Relatórios agendados estão desativados.');
}

// Only create the client if we have valid credentials
export const supabase: SupabaseClient = supabaseUrl && isValidUrl(supabaseUrl) && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null as any;

export const isSupabaseConfigured = () => !!supabaseUrl && isValidUrl(supabaseUrl) && !!supabaseKey && !!supabase;
