/**
 * Local developer unlock for privileged agent/scripts.
 * Password lives only in .env.local (gitignored). Never commit it.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const DEVELOPER_UNLOCK_ENV = "DEVELOPER_UNLOCK_PASSWORD";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** True when candidate matches DEVELOPER_UNLOCK_PASSWORD from the environment. */
export function verifyDeveloperUnlock(candidate: string | null | undefined): boolean {
  const expected = process.env[DEVELOPER_UNLOCK_ENV];
  if (!expected || !candidate) return false;
  return safeEqualString(sha256Hex(expected), sha256Hex(candidate));
}

export function assertDeveloperUnlock(candidate?: string | null): void {
  const fromArg = candidate?.trim() || null;
  const fromEnvOnly = !fromArg;
  const value = fromArg ?? process.env[DEVELOPER_UNLOCK_ENV] ?? null;
  if (!process.env[DEVELOPER_UNLOCK_ENV]) {
    throw new Error(
      `${DEVELOPER_UNLOCK_ENV} is not set in the environment (.env.local). See developer-authority/AGREEMENT.md.`,
    );
  }
  if (fromEnvOnly) {
    // Env is set; scripts may rely on it after the developer confirmed this action in chat.
    return;
  }
  if (!verifyDeveloperUnlock(value)) {
    throw new Error("Developer unlock password does not match.");
  }
}
