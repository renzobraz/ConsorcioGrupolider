import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Apenas aceitar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'O ID do usuário (userId) é obrigatório' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ 
      error: 'Configuração do Supabase Admin faltando no servidor (URL ou Service Role Key)' 
    });
  }

  try {
    // Inicializa o cliente com a Service Role Key para ter privilégios de admin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Deletar do Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    
    if (authError) {
      console.error('Erro ao deletar do Auth:', authError.message);
      return res.status(500).json({ error: `Erro Auth: ${authError.message}` });
    }

    // 2. Tentar deletar da tabela pública users (caso não tenha FK com cascade no Auth)
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (dbError) {
      console.warn('Usuário removido do Auth, mas houve erro na tabela users:', dbError.message);
      // Retornamos 200 porque o principal (Auth) foi removido
    }

    return res.status(200).json({ success: true, message: 'Usuário removido com sucesso' });
  } catch (error: any) {
    console.error('Erro inesperado ao deletar usuário:', error);
    return res.status(500).json({ error: error.message || 'Erro inesperado' });
  }
}
