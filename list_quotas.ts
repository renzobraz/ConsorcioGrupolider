import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const { data: quotas, error } = await supabase
    .from('quotas')
    .select('quota_number, group_code, company_id');
  
  if (error) {
    console.error('Error fetching quotas:', error);
  } else {
    console.log('Quotas:', quotas);
  }
}
check();
