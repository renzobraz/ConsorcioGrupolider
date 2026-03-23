
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qxbuopbrsvxybektxobs.supabase.co";
const supabaseKey = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching payments:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('Columns in payments table:', Object.keys(data[0]));
  } else {
    console.log('No data in payments table to check columns.');
  }
}

checkColumns();
