
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO FIXA (OPCIONAL) ---
// Preencha estas variáveis se quiser que a conexão persista mesmo limpando o navegador.
// Útil para ambientes de desenvolvimento que resetam o LocalStorage.
const FIXED_URL = ""; // Coloque sua URL aqui. Ex: "https://xyz.supabase.co"
const FIXED_KEY = ""; // Coloque sua API Key aqui. Ex: "eyJh..."

const cleanConfig = (value: string | null) => {
  if (!value) return '';
  // Remove whitespace, accidental surrounding quotes and "Bearer " prefix
  return value.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '');
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
let lastUrl: string | null = null;
let lastKey: string | null = null;

export const saveSupabaseConfig = (url: string, key: string) => {
  const cleanUrl = cleanConfig(url);
  const cleanKey = cleanConfig(key);
  
  // Só reseta a instância se as credenciais realmente mudaram
  if (lastUrl !== cleanUrl || lastKey !== cleanKey) {
    localStorage.setItem('supabase_url', cleanUrl);
    localStorage.setItem('supabase_key', cleanKey);
    supabaseInstance = null; 
    lastUrl = null;
    lastKey = null;
  }
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('supabase_url');
  localStorage.removeItem('supabase_key');
  supabaseInstance = null;
  lastUrl = null;
  lastKey = null;
};

export const getSupabase = () => {
  const { url, key } = getSupabaseConfig();
  
  if (!url || !key) {
    supabaseInstance = null;
    lastUrl = null;
    lastKey = null;
    return null;
  }

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

  // Reutiliza a instância se a configuração não mudou
  if (supabaseInstance && lastUrl === url && lastKey === key) {
    return supabaseInstance;
  }

  // Se mudou ou não existe, cria nova
  try {
    // Gera uma storageKey única baseada na URL para evitar conflitos de GoTrueClient
    // Isso resolve o aviso "Multiple GoTrueClient instances detected"
    const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    
    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: storageKey
      },
      global: {
        fetch: (resource, options) => {
          const timeout = 15000; // 15 seconds timeout
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), timeout);
          return fetch(resource, {
            ...options,
            signal: controller.signal
          }).then(res => {
            clearTimeout(id);
            return res;
          }).catch(err => {
            clearTimeout(id);
            if (err.name === 'AbortError') {
              throw new Error('Tempo limite de conexão excedido. Verifique sua internet.');
            }
            throw err;
          });
        }
      }
    });
    
    lastUrl = url;
    lastKey = key;
    return supabaseInstance;
  } catch (err) {
    console.error("Erro ao instanciar Supabase:", err);
    return null;
  }
};
