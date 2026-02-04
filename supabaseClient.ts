
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO FIXA (OPCIONAL) ---
// Preencha estas variáveis se quiser que a conexão persista mesmo limpando o navegador.
// Útil para ambientes de desenvolvimento que resetam o LocalStorage.
const FIXED_URL = ""; // Coloque sua URL aqui. Ex: "https://xyz.supabase.co"
const FIXED_KEY = ""; // Coloque sua API Key aqui. Ex: "eyJh..."

const cleanConfig = (value: string | null) => {
  if (!value) return '';
  // Remove whitespace and accidental surrounding quotes
  return value.trim().replace(/^["']|["']$/g, '');
};

export const getSupabaseConfig = () => {
  let url = localStorage.getItem('supabase_url');
  let key = localStorage.getItem('supabase_key');

  // Se não encontrar no navegador, tenta usar as fixas
  if (!url && FIXED_URL) url = FIXED_URL;
  if (!key && FIXED_KEY) key = FIXED_KEY;

  return { 
    url: cleanConfig(url), 
    key: cleanConfig(key) 
  };
};

let supabaseInstance: any = null;

export const saveSupabaseConfig = (url: string, key: string) => {
  localStorage.setItem('supabase_url', cleanConfig(url));
  localStorage.setItem('supabase_key', cleanConfig(key));
  supabaseInstance = null; // Reset instance to force recreation with new credentials
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabaseInstance = null;
};

export const getSupabase = () => {
  const { url, key } = getSupabaseConfig();
  
  if (url && key) {
    // Strict validation to prevent "Failed to construct 'URL': Invalid URL" errors
    // Supabase API URL must start with https:// and should NOT be a postgres:// connection string
    if (!url.startsWith('https://')) {
      console.warn("Supabase Config Error: URL must start with https://. Fallback to offline mode.");
      return null;
    }

    if (url.includes('@') || url.includes('postgres')) {
       console.warn("Supabase Config Error: URL looks like a database connection string. Use the Project API URL.");
       return null;
    }

    if (!supabaseInstance) {
      try {
        // Inicializa o cliente com configurações de segurança e persistência explícitas
        // para evitar erros em navegadores com restrições de privacidade.
        supabaseInstance = createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });
      } catch (error) {
        console.error("Failed to initialize Supabase client:", error);
        return null;
      }
    }
    return supabaseInstance;
  }
  
  return null;
};
