import { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
      secure: isSecure,
      auth: {
        user: smtpConfig.user?.trim(),
        pass: smtpConfig.pass?.trim(),
      },
      tls: {
        rejectUnauthorized: false,
        minVersion: 'TLSv1.2'
      },
      requireTLS: port === 587
    });

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

    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error("Error sending email:", error);
    let errorMessage = error.message;
    
    if (errorMessage.includes('535-5.7.8') || errorMessage.includes('Username and Password not accepted') || errorMessage.includes('Invalid login') || errorMessage.includes('Authentication failed') || errorMessage.includes('failed to login')) {
      if (errorMessage.includes('outside of security zone')) {
        errorMessage = 'Bloqueio de Segurança (Microsoft/Outlook): Seu provedor bloqueou o acesso pois o sistema está em um servidor externo. RESOLUÇÃO: Use uma "Senha de Aplicativo" ou peça ao TI para liberar o "SMTP AUTH" para esta conta.';
      } else if (errorMessage.includes('(4)') || errorMessage.includes('(15)') || errorMessage.includes('Username and Password not accepted')) {
        errorMessage = 'Senha Rejeitada: O servidor não aceitou sua senha. ATENÇÃO: Contas Gmail ou Outlook profissional EXIGEM uma "Senha de Aplicativo" (App Password) de 16 letras. Sua senha normal de login NÃO funciona aqui.';
      } else {
        errorMessage = 'Autenticação falhou: Usuário ou senha incorretos.';
      }
    }
    
    res.status(500).json({ error: errorMessage });
  }
}
