import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const { data: companies, error } = await supabase
    .from('companies')
    .select('*');
  
  if (error) {
    console.error('Error fetching companies:', error);
  } else {
    console.log('Companies:', companies);
  }
}
check();
