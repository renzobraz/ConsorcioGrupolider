
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://qxbuopbrsvxybektxobs.supabase.co";
const supabaseKey = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkQuota() {
    const { data: quota, error } = await supabase
        .from('quotas')
        .select('*')
        .eq('id', '5d6ceb87-5312-41a5-bce8-906fcd825f2f')
        .single();

    if (error) {
        console.error('Error fetching quota:', error);
        return;
    }

    console.log('Quota Details:', JSON.stringify(quota, null, 2));
}

checkQuota();
