import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkPayments() {
  const quotaId = "927b4e12-864b-494e-ad92-1b3b8df8d248";
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*')
    .eq('quota_id', quotaId)
    .order('installment_number', { ascending: true });
  
  if (error) {
    console.error('Error fetching payments:', error);
  } else {
    console.log(`Payments for quota ${quotaId}:`);
    payments.forEach(p => {
      console.log(`Inst: ${p.installment_number}, Date: ${p.payment_date}, Status: ${p.status}, Amount: ${p.amount_paid}`);
    });
  }
}
checkPayments();
