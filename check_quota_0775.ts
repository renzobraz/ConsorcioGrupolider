import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function check() {
  const { data: companies, error: cError } = await supabase
    .from('companies')
    .select('*');
  
  if (cError) {
    console.error('Error fetching companies:', cError);
  } else {
    console.log('Companies:', companies);
  }
}
check();
