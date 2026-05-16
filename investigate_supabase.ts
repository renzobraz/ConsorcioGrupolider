
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://qxbuopbrsvxybektxobs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4YnVvcGJyc3Z4eWJla3R4b2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3NTIzMjEsImV4cCI6MjA3OTMyODMyMX0.8GC3d6mS9kxrPIdtvFqf03nYFv6WA1760t7aXA08_pw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
  'users',
  'quotas',
  'payments',
  'correction_indices',
  'administrators',
  'companies',
  'credit_usages',
  'credit_updates',
  'manual_transactions',
  'smtp_config'
];

async function runDiagnostic() {
  console.log("=== DIAGNÓSTICO DE CONEXÃO SUPABASE ===");
  console.log(`URL: ${SUPABASE_URL}`);
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.error(`❌ Tabela [${table}]: Erro - ${error.message} (Código: ${error.code})`);
      } else {
        console.log(`✅ Tabela [${table}]: OK (${count} registros)`);
      }
    } catch (err: any) {
      console.error(`❌ Tabela [${table}]: Exceção - ${err.message}`);
    }
  }

  console.log("\n=== VERIFICANDO STORAGE ===");
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
  if (bucketError) {
    console.error(`❌ Erro ao listar buckets: ${bucketError.message}`);
  } else {
    console.log(`✅ Buckets encontrados: ${buckets?.map(b => b.name).join(', ') || 'Nenhum'}`);
    const hasContracts = buckets?.some(b => b.name === 'contracts' || b.name === 'Contratos');
    if (!hasContracts) {
      console.warn("⚠️ ALERTA: Bucket 'contracts' não encontrado. Upload de arquivos pode falhar.");
    }
  }

  console.log("\n=== TESTE DE ESCRITA (RLS) ===");
  const testId = 'test_' + Date.now();
  const { error: writeError } = await supabase.from('correction_indices').insert({
    id: testId,
    type: 'TESTE',
    date: new Date().toISOString(),
    rate: 0
  });

  if (writeError) {
    console.log(`ℹ️ Teste de escrita bloqueado (provavelmente RLS ativo - isso é bom!): ${writeError.message}`);
  } else {
    console.log("✅ Escrita permitida diretamente (CUIDADO: Verifique se o RLS está configurado corretamente)");
    // Limpa o teste
    await supabase.from('correction_indices').delete().eq('id', testId);
  }

  console.log("\n=== DIAGNÓSTICO CONCLUÍDO ===");
}

runDiagnostic();
