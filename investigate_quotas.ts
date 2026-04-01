import { createClient } from '@supabase/supabase-js';

const url = "https://qxbuopbrsvxybektxobs.supabase.co";
const key = "sb_publishable_ZkyIA-weUr0kLvUZ4oR6OA_betFG8t5";

const supabase = createClient(url, key);

async function investigate() {
  console.log('--- Investigating Quotas 0977 and 1017 in Group 010658 ---');
  
  const { data: quotas, error: qError } = await supabase
    .from('quotas')
    .select('*')
    .eq('group_code', '010658')
    .in('quota_number', ['0977', '1017', '0977-00', '1017-00']);
  
  if (qError) {
    console.error('Error fetching quotas:', qError);
    return;
  }

  if (!quotas || quotas.length === 0) {
    console.log('No quotas found for group 010658 and numbers 0977/1017.');
    return;
  }

  for (const q of quotas) {
    console.log(`\nQuota: ${q.quota_number}`);
    console.log(`  Credit Value: ${q.credit_value}`);
    console.log(`  Is Contemplated: ${q.is_contemplated}`);
    console.log(`  Contemplation Date: ${q.contemplation_date}`);
    console.log(`  Stop Credit Correction: ${q.stop_credit_correction}`);
    console.log(`  Index Reference Month: ${q.index_reference_month}`);
    console.log(`  Correction Index: ${q.correction_index}`);
    console.log(`  First Assembly Date: ${q.first_assembly_date}`);
    console.log(`  Anticipate Correction Month: ${q.anticipate_correction_month}`);
    
    // Fetch credit updates
    const { data: creditUpdates, error: cuError } = await supabase
      .from('credit_updates')
      .select('*')
      .eq('quota_id', q.id)
      .order('date', { ascending: true });
    
    if (cuError) {
      console.error(`  Error fetching credit updates for ${q.id}:`, cuError);
    } else {
      console.log(`  Credit Updates for ${q.id}:`);
      creditUpdates?.forEach(cu => console.log(`    ${cu.date}: ${cu.value}`));
    }

    // Fetch payments
    const { data: payments, error: pError } = await supabase
      .from('payments')
      .select('*')
      .eq('quota_id', q.id)
      .order('installment_number', { ascending: true });
    
    if (pError) {
      console.error(`  Error fetching payments for ${q.id}:`, pError);
    } else {
      console.log(`  Payments for ${q.id}:`);
      payments?.forEach(p => {
          if (p.installment_number >= 12 && p.installment_number <= 14) {
              console.log(`    Inst ${p.installment_number}: Status=${p.status}, Amount=${p.amount}, ManualFC=${p.manual_fc}`);
          }
      });
    }

    // Fetch indices for this correction index
    if (q.correction_index) {
      const { data: indices, error: iError } = await supabase
        .from('correction_indices')
        .select('*')
        .eq('type', q.correction_index)
        .order('date', { ascending: false })
        .limit(24);
      
      if (iError) {
        console.error(`  Error fetching indices for ${q.correction_index}:`, iError);
      } else {
        console.log(`  Indices for ${q.correction_index} (last 24):`);
        indices?.forEach(idx => console.log(`    ${idx.date}: ${idx.rate}%`));
      }
    }
  }
}

investigate();
