
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qxbuopbrsvxybektxobs.supabase.co";
const supabaseKey = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('quotas')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching quotas:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in quotas table:', Object.keys(data[0]));
  } else {
    console.log('No data in quotas table to check columns.');
    // Try to get column info from rpc or just try to insert a dummy one
  }
}

checkColumns();
