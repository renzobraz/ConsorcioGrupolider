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
      const port = Number(smtpConfig.port);
      const isSecure = port === 465;
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: port,
        secure: isSecure, // true para 465 (Implicit TLS), false para 587 (STARTTLS)
        auth: {
          user: smtpConfig.user?.trim(),
          pass: smtpConfig.pass?.trim(),
        },
        tls: {
          // Não falha em certificados inválidos
          rejectUnauthorized: false,
          // Garante compatibilidade com versões mais antigas se necessário
          minVersion: 'TLSv1.2'
        },
        // Enforce STARTTLS for port 587 if not secure
        requireTLS: port === 587
      });

      // Force line length limits to avoid SMTP 555-5.5.2 errors
      // and use quoted-printable encoding for data
      const sanitize = (val: string) => val?.replace(/(.{900})/g, '$1\r\n');
      const sanitizedHtml = sanitize(html);
      const sanitizedText = sanitize(text);

      const info = await transporter.sendMail({
        from: `"${smtpConfig.fromName || 'Consórcio Manager'}" <${smtpConfig.fromEmail || smtpConfig.user}>`,
        to,
        subject,
        text: sanitizedText,
        html: sanitizedHtml,
        textEncoding: 'quoted-printable',
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
      
      if (errorMessage.includes('535-5.7.8') || errorMessage.includes('Username and Password not accepted') || errorMessage.includes('Invalid login') || errorMessage.includes('Authentication failed') || errorMessage.includes('failed to login') || errorMessage.includes('authentication failed')) {
        if (errorMessage.includes('outside of security zone')) {
          errorMessage = 'Bloqueio de Segurança (Microsoft/Outlook): Seu provedor bloqueou o acesso pois o sistema está em um servidor externo. RESOLUÇÃO: Use uma "Senha de Aplicativo" ou peça ao TI para liberar o "SMTP AUTH" para esta conta.';
        } else if (errorMessage.includes('(4)') || errorMessage.includes('(15)') || errorMessage.includes('Username and Password not accepted')) {
          errorMessage = 'Senha Rejeitada: O servidor não aceitou sua senha. ATENÇÃO: Contas Gmail ou Outlook profissional EXIGEM uma "Senha de Aplicativo" (App Password) de 16 letras. Sua senha normal de login NÃO funciona aqui. Gere o código de 16 letras em sua conta e cole no campo de senha.';
        } else if (smtpConfig.host?.includes('gmail.com') || smtpConfig.user?.includes('gmail.com')) {
          errorMessage = 'Autenticação Gmail Falhou: O Google EXIGE uma "Senha de App". Sua senha comum NÃO funciona. Ative a verificação em duas etapas e crie uma "Senha de Aplicativo" no seu painel Google (Segurança > Senhas de Aplicativo).';
        } else {
          errorMessage = 'Autenticação falhou: Usuário ou senha incorretos. DICA: Verifique se sua conta exige "Senha de Aplicativo" ou se o TI bloqueia o acesso externo (SMTP AUTH).';
        }
      } else if (errorMessage.includes('CERT_HAS_EXPIRED')) {
        errorMessage = 'Erro de Segurança: O certificado SSL do seu servidor de e-mail expirou.';
      } else if (errorMessage.includes('wrong version number') || errorMessage.includes('TLS') || errorMessage.includes('SSL')) {
        errorMessage = 'Erro de SSL/TLS (Incompatibilidade): Verifique a Porta e o SSL. Se usar porta 587 (Gmail/Outlook), o campo "SSL/TLS" deve estar DESATIVADO. Se usar porta 465, ele deve estar ATIVADO. O sistema tentou corrigir isso automaticamente, verifique se a porta está correta.';
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        errorMessage = 'Erro de Conexão: Não foi possível alcançar o servidor SMTP. Verifique o Host e a Porta.';
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
