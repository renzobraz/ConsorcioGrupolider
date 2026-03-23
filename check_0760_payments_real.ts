import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkPayments() {
  const quotaId = "5d6ceb87-5312-41a5-bce8-906fcd825f2f";
  const { data: payments, error } = await supabase
    .from('payments')
    .select('*')
    .eq('quota_id', quotaId)
    .order('installment_number', { ascending: true });
  
  if (error) {
    console.error('Error fetching payments:', error);
  } else {
    console.log(`Payments for quota 0760-00 (5d6ceb87):`);
    payments.forEach(p => {
      console.log(`Inst: ${p.installment_number}, Date: ${p.payment_date}, Status: ${p.status}, Amount: ${p.amount_paid}`);
    });
  }
}
checkPayments();
