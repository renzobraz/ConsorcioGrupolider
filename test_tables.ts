import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkTables() {
  const tables = [
    'manual_transactions',
    'manual_tx',
    'transactions',
    'quota_transactions',
    'manual_payments',
    'extra_payments'
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table '${table}' does not exist or error: ${error.message}`);
    } else {
      console.log(`Table '${table}' EXISTS!`);
    }
  }
}

checkTables();
