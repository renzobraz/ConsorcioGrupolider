import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const { data: quotas, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('quota_number', '0760-00');
  
  if (error) {
    console.error('Error fetching quota:', error);
  } else {
    console.log('Quota 0760-00 Full Details:', JSON.stringify(quotas, null, 2));
  }
}
check();
