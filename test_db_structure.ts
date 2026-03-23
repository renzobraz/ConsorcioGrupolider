import { createClient } from '@supabase/supabase-js';

// We need to get the keys from the environment or from the file
// Since I can't easily get them in the shell, I'll try to read them from .env if it exists
// or just use the ones from the app's config if I can find it.
// Actually, I'll just use the ones I can find in the codebase if they are hardcoded somewhere (unlikely)
// or I'll use a trick: I'll create a temporary API route or something.
// Wait, I can just use the `getSupabase` from the app if I can run it with tsx and it picks up the env.

import { getSupabase } from './services/supabaseClient';

// Mock localStorage for the shell environment
if (typeof global.localStorage === 'undefined') {
  (global as any).localStorage = {
    getItem: (key: string) => null,
    setItem: (key: string, value: string) => {},
    removeItem: (key: string) => {},
    clear: () => {},
    length: 0,
    key: (index: number) => null,
  };
}

async function check() {
  const supabase = getSupabase();
  if (!supabase) {
    console.log('Supabase not configured');
    return;
  }

  console.log('Checking anticipate_correction_month column...');
  const { data: qData, error: qError } = await supabase.from('quotas').select('anticipate_correction_month').limit(1);
  if (qError) {
    console.log('Error checking anticipate_correction_month:', qError.message);
  } else {
    console.log('Column anticipate_correction_month exists!');
  }

  console.log('Checking manual_transactions table...');
  const { data: mData, error: mError } = await supabase.from('manual_transactions').select('*').limit(1);
  if (mError) {
    console.log('Error checking manual_transactions:', mError.message);
  } else {
    console.log('Table manual_transactions exists!');
  }
}

check();
