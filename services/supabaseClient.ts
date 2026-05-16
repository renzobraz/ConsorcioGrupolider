
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO ---
// As credenciais são buscadas prioritariamente no LocalStorage (configurado pelo usuário na UI)
// e secundariamente em variáveis de ambiente (.env).
// Nenhuma credencial deve ficar hardcoded aqui.

const cleanConfig = (value: string | null) => {
  if (!value) return '';
  // Remove whitespace, accidental surrounding quotes and "Bearer " prefix
  return value.trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '');
};

export const getSupabaseConfig = () => {
  const url = localStorage.getItem('supabase_url');
  const key = localStorage.getItem('supabase_key');

  const cleanUrl = cleanConfig(url);
  const cleanKey = cleanConfig(key);

  // Validação: Se o que estiver no localStorage for visivelmente inválido
  // (ex: URL não começa com https ou é muito curta), ignoramos e usamos as variáveis de ambiente
  const isLocalUrlValid = cleanUrl.startsWith('https://') && cleanUrl.includes('.supabase.co');
  const isLocalKeyValid = cleanKey.length > 50; // Chaves anon do Supabase são bem longas

  // Prioridade 1: LocalStorage (se válido)
  // Prioridade 2: Variáveis de ambiente VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  const finalUrl = (cleanUrl && isLocalUrlValid) 
    ? cleanUrl 
    : cleanConfig(import.meta.env.VITE_SUPABASE_URL || '');

  const finalKey = (cleanKey && isLocalKeyValid) 
    ? cleanKey 
    : cleanConfig(import.meta.env.VITE_SUPABASE_ANON_KEY || '');

  return { 
    url: finalUrl, 
    key: finalKey 
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
          const timeout = 30000; // 30 seconds timeout
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
