import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function checkTables() {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');
  
  if (error) {
    console.error('Error fetching tables:', error);
    // Try another way to list tables if information_schema is restricted
    const { data: tables, error: tablesError } = await supabase.rpc('get_tables');
    if (tablesError) {
        console.error('Error fetching tables via RPC:', tablesError);
    } else {
        console.log('Tables via RPC:', tables);
    }
  } else {
    console.log('Tables in public schema:', data.map(t => t.table_name));
  }
}
checkTables();
