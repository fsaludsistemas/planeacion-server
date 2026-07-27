const nodemailer = require('nodemailer');

const normalizeRecipients = (to) => {
  if (Array.isArray(to)) {
    return to.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof to === 'string') {
    return to
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const buildEmailHtml = ({ title, body, templateData = {} }) => {
  const safeTitle = title || 'Notificación';
  const safeBody = body || '';
  const lines = safeBody
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px; line-height:1.6; color:#1f2937;">${line}</p>`)
    .join('');

  const preheader = templateData.preheader || 'Nuevo mensaje desde el sistema';
  const footer = templateData.footer || 'Este correo fue generado automáticamente.';

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${safeTitle}</title>
    </head>
    <body style="margin:0; padding:0; background:#f3f4f6; font-family:Arial, Helvetica, sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6; padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 8px 24px rgba(15,23,42,0.08);">
              <tr>
                <td style="padding:28px 32px 16px; background:linear-gradient(135deg, #0f172a, #1d4ed8); color:#ffffff;">
                  <h1 style="margin:0; font-size:24px; line-height:1.2;">${safeTitle}</h1>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  ${lines || '<p style="margin:0; line-height:1.6; color:#1f2937;">Sin contenido.</p>'}
                </td>
              </tr>
              <tr>
                <td style="padding:0 32px 28px;">
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
};

const createTransporter = () => {
  const email = process.env.EMAIL;
  const password = process.env.EMAIL_PASSWORD;

  if (!email || !password) {
    throw new Error('Faltan las credenciales EMAIL o EMAIL_PASSWORD');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: email,
      pass: password,
    },
  });
};

const sendEmail = async (payload = {}) => {
  const recipients = normalizeRecipients(payload.to || payload.recipients);
  const subject = String(payload.subject || '').trim();

  if (!recipients.length) {
    return { status: false, message: 'Debes enviar al menos un destinatario.' };
  }

  if (!subject) {
    return { status: false, message: 'El asunto es obligatorio.' };
  }

  const transporter = createTransporter();
  const fromEmail = process.env.EMAIL;
  const fromName = process.env.EMAIL_FROM_NAME || fromEmail;
  const html = payload.html || buildEmailHtml({
    title: subject,
    body: payload.body || payload.text || '',
    templateData: payload.templateData,
  });

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: recipients.join(', '),
    subject,
    html,
    text: payload.text || payload.body || '',
    replyTo: payload.replyTo || fromEmail,
  });

  return {
    status: true,
    message: 'Correo enviado correctamente.',
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
};

module.exports = {
  sendEmail,
  buildEmailHtml,
  normalizeRecipients,
};
