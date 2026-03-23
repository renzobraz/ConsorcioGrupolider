import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkQuota() {
  const quotaId = "927b4e12-864b-494e-ad92-1b3b8df8d248";
  const { data: quota, error } = await supabase
    .from('quotas')
    .select('*')
    .eq('id', quotaId)
    .single();
  
  if (error) {
    console.error('Error fetching quota:', error);
  } else {
    console.log('Quota 927b4e12-864b-494e-ad92-1b3b8df8d248:', quota);
  }
}
checkQuota();
