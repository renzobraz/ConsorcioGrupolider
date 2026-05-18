
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIds() {
  console.log('Fetching quotas...');
  const { data: quotas, error: qError } = await supabase.from('quotas').select('id, quota_number').limit(5);
  if (qError) {
    console.error('Error fetching quotas:', qError);
    return;
  }
  console.log('Quotas:', quotas);

  console.log('\nFetching payments...');
  const { data: payments, error: pError } = await supabase.from('payments').select('quota_id, installment_number').limit(5);
  if (pError) {
    console.error('Error fetching payments:', pError);
    return;
  }
  console.log('Payments:', payments);

  if (quotas && payments && payments.length > 0) {
    const firstPaymentQuotaId = payments[0].quota_id;
    console.log(`\nChecking if payment quota_id ${firstPaymentQuotaId} exists in quotas table...`);
    const { data: foundQuota, error: fError } = await supabase.from('quotas').select('id, quota_number').eq('id', firstPaymentQuotaId).single();
    if (fError) {
      console.error('Error finding quota:', fError);
    } else {
      console.log('Found Quota:', foundQuota);
    }
  }
}

checkIds();
