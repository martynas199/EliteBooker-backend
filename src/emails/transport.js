import nodemailer from "nodemailer";
import * as Sentry from "@sentry/node";
import { createConsoleLogger } from "../utils/logger.js";

const LOG_EMAIL =
  process.env.LOG_EMAIL === "true" || process.env.LOG_VERBOSE === "true";
const console = createConsoleLogger({
  scope: "email-transport",
  verbose: LOG_EMAIL,
});

let cachedTransport = null;
let cachedSignature = null;
let missingConfigLogged = false;
let verifyPromise = null;

function buildSmtpConfig() {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  };
}

function getTransportSignature(config) {
  return `${config.host}:${config.port}:${config.auth.user}`;
}

export function getDefaultFromEmail() {
  return (
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    null
  );
}

export function getEmailTransport({ loggerPrefix = "[MAILER]" } = {}) {
  const smtpConfig = buildSmtpConfig();

  if (!smtpConfig) {
    if (!missingConfigLogged) {
      console.warn(`${loggerPrefix} SMTP not configured - emails will be skipped`);
      missingConfigLogged = true;
    }
    return null;
  }

  missingConfigLogged = false;

  const transportSignature = getTransportSignature(smtpConfig);
  if (cachedTransport && cachedSignature === transportSignature) {
    return cachedTransport;
  }

  cachedSignature = transportSignature;
  cachedTransport = nodemailer.createTransport({
    ...smtpConfig,
    pool: process.env.SMTP_POOL !== "false",
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 5),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 200),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  });

  verifyPromise = cachedTransport
    .verify()
    .then(() => {
      if (process.env.NODE_ENV !== "test") {
        console.log(`${loggerPrefix} SMTP transport verified`);
      }
    })
    .catch((error) => {
      console.error(`${loggerPrefix} SMTP verification failed:`, error?.message);
      if (Sentry.getClient()) {
        Sentry.captureException(error, {
          tags: { source: "email_transport_verify" },
        });
      }
    });

  return cachedTransport;
}

export function escapeHtml(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachments,
  from,
  replyTo,
  cc,
  bcc,
  loggerPrefix = "[MAILER]",
}) {
  const transport = getEmailTransport({ loggerPrefix });
  if (!transport) {
    return { skipped: true, reason: "smtp_not_configured" };
  }

  if (verifyPromise) {
    await verifyPromise.catch(() => {});
  }

  const mailOptions = {
    from: from || getDefaultFromEmail(),
    to,
    subject,
    text,
    html,
    attachments,
    replyTo,
    cc,
    bcc,
  };

  Object.keys(mailOptions).forEach((key) => {
    if (mailOptions[key] === undefined || mailOptions[key] === null) {
      delete mailOptions[key];
    }
  });

  try {
    return await transport.sendMail(mailOptions);
  } catch (error) {
    console.error(`${loggerPrefix} Failed to send email:`, error?.message);
    if (Sentry.getClient()) {
      Sentry.captureException(error, {
        tags: { source: "send_email" },
        extra: { to, subject },
      });
    }
    throw error;
  }
}

export default {
  getEmailTransport,
  getDefaultFromEmail,
  sendEmail,
  escapeHtml,
};
