
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qxbuopbrsvxybektxobs.supabase.co';
const supabaseKey = 'sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPayments() {
  const quotaId = '5d6ceb87-5312-41a5-bce8-906fcd825f2f';
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('quota_id', quotaId)
    .order('installment_number', { ascending: true });

  if (error) {
    console.error('Error fetching payments:', error);
    return;
  }

  console.log(`Payments for Quota ${quotaId}:`, JSON.stringify(data, null, 2));
}

checkPayments();
