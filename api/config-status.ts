import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  
  res.status(200).json({
    supabase: {
      isConfigured: !!supabaseUrl && !!supabaseKey,
      url: supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : null,
      hasKey: !!supabaseKey
    }
  });
}
