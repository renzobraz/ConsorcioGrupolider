
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', url);
console.log('Key:', key ? 'exists' : 'missing');

if (!url || !key) {
  process.exit(1);
}

const supabase = createClient(url, key);

async function checkQuotaPayments() {
  const quotaId = 'a9d793ca-3427-4f3a-9a3e-376fedaf8ec5'; // Quota 0783-00
  console.log(`Checking payments for Quota ID: ${quotaId}`);
  
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*')
    .eq('quota_id', quotaId);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Payments found:', JSON.stringify(payments, null, 2));
}

checkQuotaPayments();
