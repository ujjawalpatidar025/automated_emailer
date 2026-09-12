import nodemailer from "nodemailer";

// One pooled SMTP connection per Gmail address, reused across sends/users.
// Rebuilt automatically if the stored app password changes (rotation).
const transportCache = new Map(); // gmailAddress -> { transport, appPassword }

function getTransport(gmailAddress, appPassword) {
  const cached = transportCache.get(gmailAddress);
  if (cached && cached.appPassword === appPassword) return cached.transport;

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailAddress, pass: appPassword },
    pool: true,
    maxConnections: 1,
    // Nodemailer's defaults (2 min connection, 10 min socket) mean a bad
    // password or a blocked outbound port (some hosts block SMTP entirely —
    // see README) leaves the UI hanging with no feedback for ages. Fail fast.
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  });
  transportCache.set(gmailAddress, { transport, appPassword });
  return transport;
}

/** Checks a Gmail address + App Password actually authenticate. */
export async function verifyMailerFor(user, appPassword) {
  const transport = getTransport(user.gmailAddress, appPassword);
  await transport.verify();
  return { ok: true, provider: "app_password", gmailAddress: user.gmailAddress };
}

/** Sends one email as `user`, using their (already-decrypted) App Password. */
export async function sendOneFor(user, appPassword, { to, subject, text, html, attachment }) {
  const transport = getTransport(user.gmailAddress, appPassword);
  const fromName = user.gmailSenderName || user.gmailAddress;

  const info = await transport.sendMail({
    from: `"${fromName}" <${user.gmailAddress}>`,
    to,
    subject,
    text,
    html,
    list: {
      unsubscribe: {
        url: `mailto:${user.gmailAddress}?subject=unsubscribe`,
        comment: "Unsubscribe",
      },
    },
    attachments: attachment
      ? [{ filename: attachment.originalName, path: attachment.path }]
      : [],
  });
  return { id: info.messageId };
}
