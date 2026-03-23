import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .gt('installment_number', 14);
  
  if (paymentError) {
    console.error('Error fetching payments:', paymentError);
  } else {
    console.log('Payments with installment_number > 14:', JSON.stringify(payments, null, 2));
  }
}
check();
