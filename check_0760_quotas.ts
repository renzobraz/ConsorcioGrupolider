import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkQuotas() {
  const { data: quotas, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('quota_number', '0760-00');
  
  if (error) {
    console.error('Error fetching quotas:', error);
  } else {
    console.log('Quotas matching 0760-00:', quotas);
  }
}
checkQuotas();
