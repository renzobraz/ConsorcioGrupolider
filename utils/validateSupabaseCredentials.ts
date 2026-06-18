export interface ValidationResult {
  valid: boolean;
  error: string;
}

export function isValidSupabaseUrl(raw: string): ValidationResult {
  const url = raw.trim().replace(/\/$/, '');

  if (!url) return { valid: false, error: 'URL obrigatória.' };
  if (url.startsWith('postgres://') || url.startsWith('postgresql://') || url.includes('@') || url.toLowerCase().includes('postgres')) {
    return { valid: false, error: 'Use a URL REST do projeto (https://xyz.supabase.co), não a string de conexão PostgreSQL.' };
  }
  if (!url.startsWith('https://')) return { valid: false, error: 'A URL deve começar com https://.' };

  try {
    new URL(url);
  } catch {
    return { valid: false, error: 'URL inválida. Use o formato https://xyz.supabase.co.' };
  }

  return { valid: true, error: '' };
}

function isBase64Url(segment: string): boolean {
  return segment.length > 0 && /^[A-Za-z0-9\-_]*={0,2}$/.test(segment);
}

export function isValidSupabaseKey(raw: string): ValidationResult {
  const key = raw.trim().replace(/^Bearer\s+/i, '');

  if (!key) return { valid: false, error: 'API Key obrigatória.' };

  if (key.startsWith('sb_')) {
    if (key.length < 20) return { valid: false, error: 'Chave no formato sb_ muito curta.' };
    return { valid: true, error: '' };
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'A API Key deve ser um JWT com três segmentos separados por ponto, ou começar com sb_.' };
  }

  if (!parts.every(isBase64Url)) {
    return { valid: false, error: 'A API Key contém caracteres inválidos para um JWT.' };
  }

  if (!key.startsWith('eyJ')) {
    return { valid: false, error: 'A API Key JWT deve começar com eyJ. Certifique-se de copiar a chave anon completa.' };
  }

  return { valid: true, error: '' };
}
