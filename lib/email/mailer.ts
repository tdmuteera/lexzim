import "server-only";

import nodemailer from "nodemailer";
import { AuthError } from "@/lib/auth/types";
import { getFirmEmailConfig } from "@/lib/email/config";
import { mapSmtpError } from "@/lib/email/smtp-errors";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendFirmEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
};

export type SendFirmEmailResult = {
  messageId: string | null;
  from: string;
  transport: "smtp" | "env";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: string): string {
  const v = value.trim().toLowerCase();
  if (!EMAIL_RE.test(v)) {
    throw new AuthError("validation", `Not a valid email address: ${value}`);
  }
  return v;
}

function isEmailMock(): boolean {
  return process.env.EMAIL_MOCK === "1" || process.env.SMTP_MOCK === "1";
}

function smtpTransportOptions(input: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}) {
  return {
    host: input.host,
    port: input.port,
    secure: input.secure,
    auth: input.user ? { user: input.user, pass: input.password } : undefined,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    ...(input.secure
      ? { tls: { minVersion: "TLSv1.2" as const } }
      : { requireTLS: true }),
  };
}

function assertSmtpPassword(user: string, password: string, passwordStored: boolean) {
  if (!user.trim()) return;
  if (password.trim()) return;
  if (passwordStored) {
    throw new AuthError(
      "validation",
      "Stored SMTP password could not be read. Re-enter the mailbox password in Settings → Email and save.",
    );
  }
  throw new AuthError(
    "validation",
    "SMTP password is required. Enter the mailbox password and save before sending.",
  );
}

/**
 * Resolve SMTP transport for a firm. BYO firm SMTP wins; otherwise fall back to
 * server env (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM),
 * which lets a managed deployment provide a shared relay. Secrets never leave
 * the server. Throws when nothing is configured.
 *
 * EMAIL_MOCK=1 (or SMTP_MOCK=1) uses nodemailer jsonTransport so CI / smoke
 * can exercise send paths without a real SMTP server.
 */
async function resolveTransport(firmId: string): Promise<{
  transporter: nodemailer.Transporter;
  from: string;
  replyTo: string | undefined;
  transport: "smtp" | "env";
}> {
  if (isEmailMock()) {
    const from =
      process.env.SMTP_FROM?.trim() || "LexZim Test <noreply@lexzim.local>";
    return {
      transporter: nodemailer.createTransport({ jsonTransport: true }),
      from,
      replyTo: process.env.SMTP_REPLY_TO?.trim() || undefined,
      transport: "env",
    };
  }

  const firmCfg = await getFirmEmailConfig(firmId);
  if (firmCfg) {
    assertSmtpPassword(firmCfg.user, firmCfg.password, firmCfg.passwordStored);
    const transporter = nodemailer.createTransport(
      smtpTransportOptions({
        host: firmCfg.host,
        port: firmCfg.port,
        secure: firmCfg.secure,
        user: firmCfg.user,
        password: firmCfg.password,
      }),
    );
    const from = firmCfg.fromName
      ? `${firmCfg.fromName} <${firmCfg.fromEmail}>`
      : firmCfg.fromEmail;
    return {
      transporter,
      from,
      replyTo: firmCfg.replyTo || undefined,
      transport: "smtp",
    };
  }

  const envHost = process.env.SMTP_HOST?.trim();
  const envFrom = process.env.SMTP_FROM?.trim();
  if (envHost && envFrom) {
    const transporter = nodemailer.createTransport({
      host: envHost,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD ?? "" }
        : undefined,
    });
    return {
      transporter,
      from: envFrom,
      replyTo: process.env.SMTP_REPLY_TO?.trim() || undefined,
      transport: "env",
    };
  }

  throw new AuthError(
    "validation",
    "Email is not configured. Add SMTP settings in Settings → Email first.",
  );
}

export async function verifyFirmEmail(firmId: string): Promise<void> {
  const { transporter } = await resolveTransport(firmId);
  try {
    await transporter.verify();
  } catch (err) {
    throw mapSmtpError(err);
  }
}

export async function sendFirmEmail(
  firmId: string,
  input: SendFirmEmailInput,
): Promise<SendFirmEmailResult> {
  const to = normalizeEmailAddress(input.to);
  const subject = input.subject.trim() || "(no subject)";
  if (!input.text && !input.html) {
    throw new AuthError("validation", "Email body is required.");
  }

  const { transporter, from, replyTo, transport } = await resolveTransport(firmId);

  try {
    const info = await transporter.sendMail({
      from,
      to,
      replyTo,
      subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return {
      messageId: info.messageId ?? null,
      from,
      transport,
    };
  } catch (err) {
    throw mapSmtpError(err);
  }
}
