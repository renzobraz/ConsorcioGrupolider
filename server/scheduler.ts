import cron from 'node-cron';
import { supabase, isSupabaseConfigured } from './supabase';
import { generateReportPdf } from './pdfGenerator';
import nodemailer from 'nodemailer';
import { calculateCurrentCreditValue, calculateScheduleSummary, generateSchedule, calculateCDICorrection } from '../services/calculationService';
import { Quota, MonthlyIndex, ReportFrequency } from '../types';
import { REPORT_COLUMNS } from '../constants/reportColumns';

async function fetchWithRetry<T>(fetchFn: () => PromiseLike<{ data: T | null, error: any }>, retries = 3, delay = 1000): Promise<{ data: T | null, error: any }> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      const result = await fetchFn();
      if (!result.error) return result as { data: T | null, error: any };
      lastError = result.error;
    } catch (e: any) {
      lastError = e;
      if (e.message?.includes('fetch failed')) {
        console.warn(`Fetch attempt ${i + 1} failed, retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
      return { data: null, error: e };
    }
  }
  return { data: null, error: lastError };
}

async function getSmtpConfig() {
  const { data, error } = await fetchWithRetry(() => supabase.from('smtp_config').select('*').single());
  if (error) {
    if (error.code === 'PGRST205') {
       console.warn('⚠️ A tabela "smtp_config" não foi encontrada no banco de dados. Por favor, execute o script SQL na página de Configurações para criá-la.');
    } else {
       console.error('Error fetching SMTP config for scheduler:', error);
    }
    return null;
  }
  return data;
}

async function sendEmail(smtp: any, to: string, subject: string, text: string, attachments: any[]) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: parseInt(smtp.port),
    secure: smtp.secure,
    auth: {
      user: smtp.user_name, // Fixed field name
      pass: smtp.password, // Fixed field name
    },
  });

  await transporter.sendMail({
    from: `"${smtp.from_name || 'Consórcio Manager'}" <${smtp.from_email || smtp.user_name}>`,
    to,
    subject,
    text,
    attachments,
  });
}

async function processScheduledReports(isInitialRun = false) {
  if (!isSupabaseConfigured()) {
    if (!isInitialRun) console.log('Supabase not configured for scheduled reports. Skipping...');
    return;
  }

  if (!isInitialRun) console.log('Checking for scheduled reports...');

  try {
    const { data: reports, error } = await fetchWithRetry<any[]>(() => supabase
      .from('scheduled_reports')
      .select('*')
      .eq('is_active', true));

    if (error) {
      if (error.code === 'PGRST205') {
        if (!isInitialRun) console.warn('⚠️ A tabela "scheduled_reports" não foi encontrada no banco de dados.');
      } else if (error.message?.includes('fetch failed')) {
        const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
        const msg = `❌ Erro de conexão com Supabase (fetch failed). URL: ${supabaseUrl}`;
        if (isInitialRun) {
          console.warn(`⚠️ Agendador: Falha na conexão inicial com Supabase. Verifique as configurações se desejar usar relatórios agendados.`);
        } else {
          console.error(msg);
        }
      } else {
        console.error('Error fetching scheduled reports from Supabase:', error);
      }
      return;
    }

    if (!reports || reports.length === 0) {
      console.log('No active scheduled reports found.');
      return;
    }

    const now = new Date();
    const reportsToProcess = reports.filter(report => {
      const lastSent = report.last_sent ? new Date(report.last_sent) : null;
      if (!lastSent) return true;

      const diffTime = Math.abs(now.getTime() - lastSent.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (report.frequency === ReportFrequency.DAILY && diffDays >= 1) return true;
      if (report.frequency === ReportFrequency.WEEKLY && diffDays >= 7) return true;
      if (report.frequency === ReportFrequency.MONTHLY && diffDays >= 30) return true;
      
      return false;
    });

    if (reportsToProcess.length > 0) {
      await sendReports(reportsToProcess);
    }
  } catch (err) {
    console.error('Unexpected error in processScheduledReports:', err);
  }
}

async function sendReports(reports: any[]) {
  const smtp = await getSmtpConfig();
  if (!smtp) {
    console.error('SMTP not configured, skipping scheduled reports.');
    return;
  }

  // Fetch all data once
  const results = await Promise.all([
    fetchWithRetry<any[]>(() => supabase.from('quotas').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('payments').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('correction_indices').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('companies').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('administrators').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('credit_updates').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('credit_usages').select('*')),
    fetchWithRetry<any[]>(() => supabase.from('manual_transactions').select('*'))
  ]);

  const [quotasRes, paymentsRes, indicesRes, companiesRes, administratorsRes, creditUpdatesRes, creditUsagesRes, manualTransactionsRes] = results;

  if (results.some(r => r.error)) {
    console.error('Failed to fetch required data for reports from Supabase. Some queries failed.');
    return;
  }

  const quotas = (quotasRes.data || []).map(dbQ => ({
    id: dbQ.id,
    group: dbQ.group_code,
    quotaNumber: dbQ.quota_number,
    contractNumber: dbQ.contract_number,
    creditValue: Number(dbQ.credit_value),
    adhesionDate: dbQ.adhesion_date,
    firstAssemblyDate: dbQ.first_assembly_date,
    termMonths: Number(dbQ.term_months),
    adminFeeRate: Number(dbQ.admin_fee_rate),
    reserveFundRate: Number(dbQ.reserve_fund_rate),
    productType: dbQ.product_type,
    dueDay: Number(dbQ.due_day || 25),
    firstDueDate: dbQ.first_due_date,
    correctionIndex: dbQ.correction_index,
    paymentPlan: dbQ.payment_plan,
    isContemplated: dbQ.is_contemplated,
    contemplationDate: dbQ.contemplation_date,
    bidFree: Number(dbQ.bid_free || 0),
    bidEmbedded: Number(dbQ.bid_embedded || 0),
    bidTotal: Number(dbQ.bid_total || 0),
    creditManualAdjustment: Number(dbQ.credit_manual_adjustment || 0),
    administratorId: dbQ.administrator_id,
    companyId: dbQ.company_id,
    calculationMethod: dbQ.calculation_method,
    recalculateBalanceAfterHalfOrContemplation: dbQ.recalculate_balance_after_half_or_contemplation,
    anticipateCorrectionMonth: dbQ.anticipate_correction_month,
    prioritizeFeesInBid: dbQ.prioritize_fees_in_bid,
    acquiredFromThirdParty: dbQ.acquired_from_third_party,
    assumedInstallment: dbQ.assumed_installment,
    prePaidFCPercent: dbQ.pre_paid_fc_percent,
    acquisitionCost: dbQ.acquisition_cost,
    correctionRateCap: dbQ.correction_rate_cap,
    indexReferenceMonth: dbQ.index_reference_month,
    isDrawContemplation: dbQ.is_draw_contemplation,
    stopCreditCorrection: dbQ.stop_credit_correction
  })) as Quota[];

  const payments = (paymentsRes.data || []).map(dbP => ({
    quotaId: dbP.quota_id,
    installmentNumber: dbP.installment_number,
    amount: Number(dbP.amount_paid),
    manualFC: dbP.manual_fc !== null ? Number(dbP.manual_fc) : null,
    manualFR: dbP.manual_fr !== null ? Number(dbP.manual_fr) : null,
    manualTA: dbP.manual_ta !== null ? Number(dbP.manual_ta) : null,
    manualFine: dbP.manual_fine !== null ? Number(dbP.manual_fine) : null,
    manualInterest: dbP.manual_interest !== null ? Number(dbP.manual_interest) : null,
    manualInsurance: dbP.manual_insurance !== null ? Number(dbP.manual_insurance) : null,
    manualAmortization: dbP.manual_amortization !== null ? Number(dbP.manual_amortization) : null,
    manualEarnings: dbP.manual_earnings !== null ? Number(dbP.manual_earnings) : null,
    status: dbP.status,
    paymentDate: dbP.payment_date
  }));

  const indices = (indicesRes.data || []).map(i => ({
    id: i.id,
    type: i.type,
    date: i.date,
    rate: Number(i.rate)
  })) as MonthlyIndex[];

  const companies = (companiesRes.data || []) as any[];
  const administrators = (administratorsRes.data || []) as any[];

  const allCreditUpdates = (creditUpdatesRes.data || []).map(dbU => ({
    id: dbU.id,
    quotaId: dbU.quota_id,
    date: dbU.date,
    value: Number(dbU.value)
  }));

  const allCreditUsages = (creditUsagesRes.data || []).map(dbU => ({
    id: dbU.id,
    quotaId: dbU.quota_id,
    description: dbU.description,
    date: dbU.date,
    amount: Number(dbU.amount),
    seller: dbU.seller
  }));

  const allManualTransactions = (manualTransactionsRes.data || []).map(dbT => ({
    id: dbT.id,
    quotaId: dbT.quota_id,
    date: dbT.date,
    amount: Number(dbT.amount),
    type: dbT.type,
    description: dbT.description,
    fc: dbT.fc !== null ? Number(dbT.fc) : undefined,
    fr: dbT.fr !== null ? Number(dbT.fr) : undefined,
    ta: dbT.ta !== null ? Number(dbT.ta) : undefined,
    insurance: dbT.insurance !== null ? Number(dbT.insurance) : undefined,
    amortization: dbT.amortization !== null ? Number(dbT.amortization) : undefined,
    fine: dbT.fine !== null ? Number(dbT.fine) : undefined,
    interest: dbT.interest !== null ? Number(dbT.interest) : undefined
  }));

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  for (const report of reports) {
    try {
      console.log(`Sending scheduled report: ${report.name} to ${report.recipient}`);
      
      // Filter and process data
      let filteredQuotas = quotas;
      const filters = typeof report.filters === 'string' ? JSON.parse(report.filters) : report.filters;
      const selectedColumnIds = typeof report.selected_columns === 'string' ? JSON.parse(report.selected_columns) : report.selected_columns;

      const refDateStr = filters?.referenceDate || todayStr;
      const refDate = new Date(refDateStr + 'T23:59:59');

      if (filters) {
        if (filters.companyId) filteredQuotas = filteredQuotas.filter(q => q.companyId === filters.companyId);
        if (filters.administratorId) filteredQuotas = filteredQuotas.filter(q => q.administratorId === filters.administratorId);
        if (filters.status) {
          if (filters.status === 'CONTEMPLATED') filteredQuotas = filteredQuotas.filter(q => q.isContemplated);
          if (filters.status === 'ACTIVE') filteredQuotas = filteredQuotas.filter(q => !q.isContemplated);
        }
        if (filters.productType) {
          filteredQuotas = filteredQuotas.filter(q => q.productType === filters.productType);
        }
      }

      const processedData = filteredQuotas.map(q => {
        const qPayments = payments.filter(p => p.quotaId === q.id);
        const qManualTransactions = allManualTransactions.filter(t => t.quotaId === q.id);
        const paymentsMap = qPayments.reduce((acc, p) => ({ ...acc, [p.installmentNumber]: p }), {});
        
        const schedule = generateSchedule({ ...q, manualTransactions: qManualTransactions }, indices, paymentsMap);
        
        let vlrCartaAtual = q.creditValue;
        if (schedule.length > 0) {
           const pastOrPresent = schedule.filter(i => i.dueDate.split('T')[0] <= refDateStr);
           vlrCartaAtual = pastOrPresent.length > 0 ? pastOrPresent[pastOrPresent.length - 1].correctedCreditValue || q.creditValue : q.creditValue;
        }

        const summary = calculateScheduleSummary(q, schedule, paymentsMap);
        const currentCredit = calculateCurrentCreditValue(q, indices, refDate);
        const correction92CDI = calculateCDICorrection(q.bidFree || 0, q.contemplationDate, indices, refDateStr);
        
        const bidEmbedded = q.bidEmbedded || 0;
        const valorLiquido = currentCredit - bidEmbedded;
        
        const quotaUpdates = allCreditUpdates.filter(u => u.quotaId === q.id);
        const latestUpdateValue = quotaUpdates.length > 0 
          ? [...quotaUpdates].sort((a, b) => b.date.localeCompare(a.date))[0].value 
          : 0;
        
        const creditoTotal = valorLiquido + latestUpdateValue;
        
        const quotaUsages = allCreditUsages.filter(u => u.quotaId === q.id && u.date <= refDateStr);
        const creditoUtilizado = quotaUsages.reduce((sum, u) => sum + u.amount, 0);

        return {
          ...q,
          creditValue: vlrCartaAtual,
          saldoVencido: summary.paid.total,
          saldoAVencer: summary.toPay.total,
          paidPercent: summary.paid.percent,
          toPayPercent: summary.toPay.percent,
          company: companies.find(c => c.id === q.companyId)?.name || '-',
          administrator: administrators.find(a => a.id === q.administratorId)?.name || '-',
          status: q.isContemplated ? 'Contemplada' : 'Em Andamento',
          bidTotal: q.bidTotal || 0,
          bidFree: q.bidFree || 0,
          bidEmbedded: bidEmbedded,
          creditAtContemplation: currentCredit,
          valorRealCarta: valorLiquido,
          creditManualAdjustment: latestUpdateValue,
          creditoTotal: creditoTotal,
          bidFreeCorrection: correction92CDI,
          creditoUtilizado,
          saldoDisponivel: creditoTotal - creditoUtilizado
        };
      });

      // Calculate Summary for Cards
      const reportSummary = processedData.reduce((acc, row) => ({
        count: acc.count + 1,
        creditValue: acc.creditValue + row.creditValue,
        paid: acc.paid + (row.saldoVencido || 0),
        toPay: acc.toPay + (row.saldoAVencer || 0),
        bids: acc.bids + (row.bidFree || 0),
        creditBruto: acc.creditBruto + row.creditAtContemplation,
        creditLiquido: acc.creditLiquido + row.valorRealCarta,
        creditTotal: acc.creditTotal + row.creditoTotal,
        creditUsed: acc.creditUsed + row.creditoUtilizado,
        creditAvailable: acc.creditAvailable + row.saldoDisponivel,
        creditContemplatedAvailable: acc.creditContemplatedAvailable + (row.isContemplated ? row.saldoDisponivel : 0)
      }), { count: 0, creditValue: 0, paid: 0, toPay: 0, bids: 0, creditBruto: 0, creditLiquido: 0, creditTotal: 0, creditUsed: 0, creditAvailable: 0, creditContemplatedAvailable: 0 });

      const columns = REPORT_COLUMNS.filter(col => selectedColumnIds.includes(col.id)).map(col => ({
        header: col.label,
        key: col.key,
        type: col.type
      }));

      const pdfBuffer = await generateReportPdf(processedData, columns, report.subject || report.name, reportSummary, refDateStr);

      await sendEmail(smtp, report.recipient, report.subject || report.name, report.message || '', [
        {
          filename: `${report.name}.pdf`,
          content: Buffer.from(pdfBuffer),
        },
      ]);

      await supabase
        .from('scheduled_reports')
        .update({ last_sent: now.toISOString() })
        .eq('id', report.id);

      console.log(`Successfully sent report: ${report.name}`);
    } catch (err) {
      console.error(`Error processing report ${report.name}:`, err);
      throw err;
    }
  }
}

export async function triggerScheduledReport(reportId: string) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: report, error } = await supabase
    .from('scheduled_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error || !report) {
    throw new Error(`Report not found: ${error?.message || 'Unknown error'}`);
  }

  await sendReports([report]);
}

export function startScheduler() {
  // Run every hour
  cron.schedule('0 * * * *', () => {
    processScheduledReports();
  });

  // Also run once on start
  processScheduledReports(true);
}
