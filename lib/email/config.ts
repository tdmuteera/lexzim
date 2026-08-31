import "server-only";

import { decryptByoKey, encryptByoKey } from "@/lib/ai/secrets";
import {
  deleteFirmSetting,
  getFirmSetting,
  upsertFirmSetting,
} from "@/lib/repos/firm-settings";

/**
 * Firm SMTP configuration (P7-11). Stored per firm in firm_settings.
 * The password is encrypted like BYO AI keys and is NEVER returned to the browser.
 * Keys containing "password"/"_key" are stripped from firm exports by isSensitiveSettingKey.
 */
export const EMAIL_HOST_KEY = "email_smtp_host";
export const EMAIL_PORT_KEY = "email_smtp_port";
export const EMAIL_SECURE_KEY = "email_smtp_secure";
export const EMAIL_USER_KEY = "email_smtp_user";
export const EMAIL_PASSWORD_KEY = "email_smtp_password";
export const EMAIL_FROM_NAME_KEY = "email_from_name";
export const EMAIL_FROM_EMAIL_KEY = "email_from_email";
export const EMAIL_REPLY_TO_KEY = "email_reply_to";

export type FirmEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  passwordStored: boolean;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

/** Browser-safe view: no secrets, just whether a password is set. */
export type FirmEmailConfigPublic = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  passwordSet: boolean;
  passwordReadable: boolean;
  configured: boolean;
};

function parsePort(raw: string | null): number {
  const n = raw ? Number(raw) : 587;
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 587;
  return n;
}

/** Full config including decrypted password. Server only — never send to browser. */
export async function getFirmEmailConfig(firmId: string): Promise<FirmEmailConfig | null> {
  const [host, portRaw, secureRaw, user, passwordEnc, fromName, fromEmail, replyTo] =
    await Promise.all([
      getFirmSetting(firmId, EMAIL_HOST_KEY),
      getFirmSetting(firmId, EMAIL_PORT_KEY),
      getFirmSetting(firmId, EMAIL_SECURE_KEY),
      getFirmSetting(firmId, EMAIL_USER_KEY),
      getFirmSetting(firmId, EMAIL_PASSWORD_KEY),
      getFirmSetting(firmId, EMAIL_FROM_NAME_KEY),
      getFirmSetting(firmId, EMAIL_FROM_EMAIL_KEY),
      getFirmSetting(firmId, EMAIL_REPLY_TO_KEY),
    ]);

  if (!host?.trim() || !fromEmail?.trim()) return null;

  const passwordStored = Boolean(passwordEnc?.trim());
  const password = passwordStored ? decryptByoKey(passwordEnc!) ?? "" : "";

  return {
    host: host.trim(),
    port: parsePort(portRaw),
    secure: secureRaw === "true",
    user: user?.trim() ?? "",
    password,
    passwordStored,
    fromName: fromName?.trim() || "LexZim",
    fromEmail: fromEmail.trim(),
    replyTo: replyTo?.trim() ?? "",
  };
}

export async function getFirmEmailConfigPublic(
  firmId: string,
): Promise<FirmEmailConfigPublic> {
  const [host, portRaw, secureRaw, user, passwordEnc, fromName, fromEmail, replyTo] =
    await Promise.all([
      getFirmSetting(firmId, EMAIL_HOST_KEY),
      getFirmSetting(firmId, EMAIL_PORT_KEY),
      getFirmSetting(firmId, EMAIL_SECURE_KEY),
      getFirmSetting(firmId, EMAIL_USER_KEY),
      getFirmSetting(firmId, EMAIL_PASSWORD_KEY),
      getFirmSetting(firmId, EMAIL_FROM_NAME_KEY),
      getFirmSetting(firmId, EMAIL_FROM_EMAIL_KEY),
      getFirmSetting(firmId, EMAIL_REPLY_TO_KEY),
    ]);

  const passwordSet = Boolean(passwordEnc?.trim());
  const passwordReadable =
    !passwordSet || Boolean(passwordEnc?.trim() && decryptByoKey(passwordEnc));
  return {
    host: host?.trim() ?? "",
    port: parsePort(portRaw),
    secure: secureRaw === "true",
    user: user?.trim() ?? "",
    fromName: fromName?.trim() ?? "",
    fromEmail: fromEmail?.trim() ?? "",
    replyTo: replyTo?.trim() ?? "",
    passwordSet,
    passwordReadable,
    configured: Boolean(host?.trim() && fromEmail?.trim() && passwordSet && passwordReadable),
  };
}

export type SaveFirmEmailInput = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** undefined = keep existing; "" = clear; string = set new (encrypted). */
  password?: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
};

export async function saveFirmEmailConfig(
  firmId: string,
  input: SaveFirmEmailInput,
): Promise<void> {
  await Promise.all([
    upsertFirmSetting(firmId, EMAIL_HOST_KEY, input.host.trim()),
    upsertFirmSetting(firmId, EMAIL_PORT_KEY, String(input.port)),
    upsertFirmSetting(firmId, EMAIL_SECURE_KEY, input.secure ? "true" : "false"),
    upsertFirmSetting(firmId, EMAIL_USER_KEY, input.user.trim()),
    upsertFirmSetting(firmId, EMAIL_FROM_NAME_KEY, input.fromName.trim()),
    upsertFirmSetting(firmId, EMAIL_FROM_EMAIL_KEY, input.fromEmail.trim()),
    upsertFirmSetting(firmId, EMAIL_REPLY_TO_KEY, input.replyTo.trim()),
  ]);

  if (input.password === undefined) return;
  if (input.password.trim() === "") {
    await deleteFirmSetting(firmId, EMAIL_PASSWORD_KEY);
    return;
  }
  await upsertFirmSetting(firmId, EMAIL_PASSWORD_KEY, encryptByoKey(input.password.trim()));
}
