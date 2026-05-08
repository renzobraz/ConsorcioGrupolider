
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://qxbuopbrsvxybektxobs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4YnVvcGJyc3Z4eWJla3R4b2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NTIzMjEsImV4cCI6MjA3OTMyODMyMX0.8GC3d6mS9kxrPIdtvFqf03nYFv6WA1760t7aXA08_pw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkUser() {
  console.log("Verificando usuários no Supabase...");
  const { data, error } = await supabase.from('users').select('email, is_active');
  
  if (error) {
    console.error("Erro ao buscar usuários:", error.message);
    return;
  }

  console.log("Usuários encontrados:", data);
  
  const flavio = data?.find(u => u.email.toLowerCase().includes('flavio.wilson'));
  if (flavio) {
    console.log("✅ Usuário flavio.wilson encontrado na nuvem!", flavio);
  } else {
    console.log("❌ Usuário flavio.wilson NÃO cadastrado na nuvem.");
  }
}

checkUser();
