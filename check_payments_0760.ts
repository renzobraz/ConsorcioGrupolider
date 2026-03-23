import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const quotaId = "1c649148-2eac-433f-940a-c7d95de1577a";
  console.log('Checking payments for Quota ID:', quotaId);

  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('quota_id', quotaId)
    .order('installment_number', { ascending: true });
  
  if (paymentError) {
    console.error('Error fetching payments:', paymentError);
  } else {
    console.log('Payments for Quota 1c649148-2eac-433f-940a-c7d95de1577a:', JSON.stringify(payments, null, 2));
  }
}
check();
