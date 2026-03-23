import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const quotaId = "5d6ceb87-5312-41a5-bce8-906fcd825f2f";
  console.log('Checking manual transactions for Quota ID:', quotaId);

  const { data: txs, error: txError } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('quota_id', quotaId)
    .order('date', { ascending: true });
  
  if (txError) {
    console.error('Error fetching manual transactions:', txError);
  } else {
    console.log('Manual Transactions for Quota 5d6ceb87-5312-41a5-bce8-906fcd825f2f:', JSON.stringify(txs, null, 2));
  }
}
check();
