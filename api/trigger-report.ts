import { VercelRequest, VercelResponse } from '@vercel/node';
import { triggerScheduledReport } from '../server/scheduler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Handle both /api/trigger-report?id=xxx and /api/trigger-report/xxx
  // Vercel rewrites or query params
  const id = req.query.id as string || req.body.id;

  if (!id) {
    return res.status(400).json({ error: 'Report ID is required' });
  }

  try {
    await triggerScheduledReport(id);
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Error triggering report:", error);
    res.status(500).json({ error: error.message });
  }
}
