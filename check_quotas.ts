import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function check() {
  const { data, error } = await supabase.from('quotas').select('quota_number, group_code, bid_free, contemplation_date, is_contemplated');
  const filtered = data.filter(q => ['0840', '0770', '0820', '0791', '0790'].includes(q.quota_number));
  console.log(filtered);
}
check();
