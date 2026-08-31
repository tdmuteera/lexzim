/**
 * Configure T Pfigu Attorneys outbound SMTP (cPanel mail.tpfiguattorneys.com).
 *
 * Password optional via env (never commit):
 *   T_PFIGU_SMTP_PASSWORD=...
 *   SMTP_PASSWORD=...
 *
 * Usage: npx tsx scripts/set-tpfigu-email-smtp.ts
 */
import { createCipheriv, createHash, randomBytes } from "crypto";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { firmSettings } from "../lib/db/schema";

config({ path: ".env.local" });
config();

const FIRM_ID = "6e68cf32-2ba7-48d4-af08-ffbb1262cf78";

const KEYS = {
  host: "email_smtp_host",
  port: "email_smtp_port",
  secure: "email_smtp_secure",
  user: "email_smtp_user",
  password: "email_smtp_password",
  fromName: "email_from_name",
  fromEmail: "email_from_email",
  replyTo: "email_reply_to",
} as const;

const SMTP = {
  host: "mail.tpfiguattorneys.com",
  port: "465",
  secure: "true",
  user: "info@tpfiguattorneys.com",
  fromName: "T Pfigu Attorneys",
  fromEmail: "info@tpfiguattorneys.com",
  replyTo: "info@tpfiguattorneys.com",
} as const;

function vaultSecret(): Buffer {
  const raw =
    process.env.AI_VAULT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "lexzim-dev-ai-vault-insecure";
  return createHash("sha256").update(raw).digest();
}

function encryptByoKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", vaultSecret(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

async function upsert(
  db: ReturnType<typeof drizzle>,
  key: string,
  value: string,
) {
  await db
    .insert(firmSettings)
    .values({ firmId: FIRM_ID, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [firmSettings.firmId, firmSettings.key],
      set: { value, updatedAt: new Date() },
    });
}

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL / DIRECT_URL required");

  const password =
    process.env.T_PFIGU_SMTP_PASSWORD?.trim() ||
    process.env.SMTP_PASSWORD?.trim() ||
    "";

  const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
  const db = drizzle(sql);

  await upsert(db, KEYS.host, SMTP.host);
  await upsert(db, KEYS.port, SMTP.port);
  await upsert(db, KEYS.secure, SMTP.secure);
  await upsert(db, KEYS.user, SMTP.user);
  await upsert(db, KEYS.fromName, SMTP.fromName);
  await upsert(db, KEYS.fromEmail, SMTP.fromEmail);
  await upsert(db, KEYS.replyTo, SMTP.replyTo);

  if (password) {
    await upsert(db, KEYS.password, encryptByoKey(password));
  }

  console.log(
    JSON.stringify(
      {
        firmId: FIRM_ID,
        smtp: SMTP,
        passwordSaved: Boolean(password),
        nextSteps: password
          ? [
              "Open LexZim → Settings → Email → Send test email.",
              "Send a quotation or invoice PDF to confirm attachments.",
            ]
          : [
              "Open LexZim → Settings → Email.",
              "Enter the mailbox password for info@tpfiguattorneys.com → Save.",
              "Click Send test email.",
            ],
        note: "LexZim uses SMTP only (port 465 SSL). IMAP/CalDAV are for mail apps, not LexZim.",
      },
      null,
      2,
    ),
  );

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
