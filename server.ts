import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { startScheduler, triggerScheduledReport } from "./server/scheduler";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Start the automated report scheduler
  startScheduler();

  // API Routes
  app.get("/api/config-status", (req, res) => {
    const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
    const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
    
    res.json({
      supabase: {
        isConfigured: !!supabaseUrl && !!supabaseKey,
        url: supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : null,
        hasKey: !!supabaseKey
      }
    });
  });

  app.post("/api/trigger-report/:id", async (req, res) => {
    const { id } = req.params;
    try {
      await triggerScheduledReport(id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error triggering report:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/send-email", async (req, res) => {
    const { smtpConfig, to, subject, text, html, attachments } = req.body;

    if (!smtpConfig || !to) {
      return res.status(400).json({ error: "SMTP configuration and recipient are required." });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: Number(smtpConfig.port),
        secure: smtpConfig.secure, // true for 465, false for other ports
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      const info = await transporter.sendMail({
        from: `"${smtpConfig.fromName || 'Consórcio Manager'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
        to,
        subject,
        text,
        html,
        attachments: attachments?.map((att: any) => ({
          filename: att.filename,
          content: Buffer.from(att.content, 'base64'),
          contentType: att.contentType
        }))
      });

      console.log("Message sent: %s", info.messageId);
      res.json({ success: true, messageId: info.messageId });
    } catch (error: any) {
      console.error("Error sending email:", error);
      let errorMessage = error.message;
      if (errorMessage.includes('Application-specific password required')) {
        errorMessage = 'Autenticação falhou: O Gmail requer uma "Senha de App" para enviar e-mails. Por favor, gere uma nas configurações da sua conta Google.';
      } else if (errorMessage.includes('Invalid login')) {
        errorMessage = 'Autenticação falhou: Usuário ou senha do SMTP incorretos.';
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
