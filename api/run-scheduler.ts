import { VercelRequest, VercelResponse } from '@vercel/node';
import { runScheduler } from '../server/scheduler';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  
  if (process.env.NODE_ENV === 'production') {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    await runScheduler();
    res.status(200).json({ success: true, message: 'Scheduler executed successfully' });
  } catch (error: any) {
    console.error("Error running scheduler:", error);
    res.status(500).json({ error: error.message });
  }
}
