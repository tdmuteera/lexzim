import "server-only";

import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { AuthError } from "@/lib/auth/types";
import { getDb } from "@/lib/db";
import { firmAiProxy } from "@/lib/db/schema";
import { assertCanUse } from "@/lib/licensing/policy";
import { setProxyClientToken } from "@/lib/ai/secrets";

const DEFAULT_PROXY_QUOTA = 500;

function pepper(): string {
  return (
    process.env.AI_PROXY_TOKEN_PEPPER?.trim() ||
    process.env.AI_VAULT_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "lexzim-dev-proxy-pepper"
  );
}

export function currentPeriodYm(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function hashProxyToken(rawToken: string): string {
  return createHash("sha256").update(`${pepper()}:${rawToken}`).digest("hex");
}

export function generateProxyToken(): { raw: string; prefix: string; hash: string } {
  const raw = `lzp_${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    prefix: raw.slice(0, 12),
    hash: hashProxyToken(raw),
  };
}

export type FirmAiProxyRow = typeof firmAiProxy.$inferSelect;

export async function getFirmAiProxy(firmId: string): Promise<FirmAiProxyRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(firmAiProxy)
    .where(eq(firmAiProxy.firmId, firmId))
    .limit(1);
  return rows[0] ?? null;
}

async function rollPeriodIfNeeded(row: FirmAiProxyRow): Promise<FirmAiProxyRow> {
  const ym = currentPeriodYm();
  if (row.periodYm === ym) return row;
  const db = getDb();
  const updated = await db
    .update(firmAiProxy)
    .set({
      periodYm: ym,
      callsThisMonth: 0,
      updatedAt: new Date(),
    })
    .where(eq(firmAiProxy.firmId, row.firmId))
    .returning();
  return updated[0] ?? row;
}

/**
 * Issue or rotate proxy token. Returns raw token once (never stored plaintext).
 * Requires firm edition with ai_proxy.
 */
export async function issueFirmProxyToken(
  firmId: string,
  opts?: { monthlyQuota?: number },
): Promise<{ rawToken: string; prefix: string; monthlyQuota: number }> {
  await assertCanUse(firmId, "ai_proxy");
  const { raw, prefix, hash } = generateProxyToken();
  const now = new Date();
  const ym = currentPeriodYm(now);
  const monthlyQuota = opts?.monthlyQuota ?? DEFAULT_PROXY_QUOTA;
  const db = getDb();
  const existing = await getFirmAiProxy(firmId);

  if (!existing) {
    await db.insert(firmAiProxy).values({
      firmId,
      tokenHash: hash,
      tokenPrefix: prefix,
      monthlyQuota,
      callsThisMonth: 0,
      periodYm: ym,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(firmAiProxy)
      .set({
        tokenHash: hash,
        tokenPrefix: prefix,
        monthlyQuota: opts?.monthlyQuota ?? existing.monthlyQuota,
        status: "active",
        updatedAt: now,
      })
      .where(eq(firmAiProxy.firmId, firmId));
  }

  return {
    rawToken: raw,
    prefix,
    monthlyQuota: opts?.monthlyQuota ?? existing?.monthlyQuota ?? monthlyQuota,
  };
}

// After issueFirmProxyToken returns, callers should persist client token via setProxyClientToken.
// Wrapped helper:
export async function issueAndStoreFirmProxyToken(
  firmId: string,
  opts?: { monthlyQuota?: number },
): Promise<{ rawToken: string; prefix: string; monthlyQuota: number }> {
  const issued = await issueFirmProxyToken(firmId, opts);
  await setProxyClientToken(firmId, issued.rawToken);
  return issued;
}

export async function revokeFirmProxyToken(firmId: string): Promise<void> {
  const db = getDb();
  await db
    .update(firmAiProxy)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(eq(firmAiProxy.firmId, firmId));
  await setProxyClientToken(firmId, null);
}

export async function authenticateProxyToken(rawToken: string): Promise<FirmAiProxyRow> {
  const token = rawToken.trim();
  if (!token.startsWith("lzp_")) {
    throw new AuthError("unauthorized", "Invalid proxy token.");
  }
  const hash = hashProxyToken(token);
  const db = getDb();
  const rows = await db
    .select()
    .from(firmAiProxy)
    .where(eq(firmAiProxy.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== "active") {
    throw new AuthError("unauthorized", "Proxy token is invalid or revoked.");
  }
  return rollPeriodIfNeeded(row);
}

export async function assertProxyQuota(row: FirmAiProxyRow): Promise<FirmAiProxyRow> {
  const fresh = await rollPeriodIfNeeded(row);
  if (fresh.callsThisMonth >= fresh.monthlyQuota) {
    throw new AuthError(
      "proxy_quota",
      `LexZim AI proxy monthly quota reached (${fresh.callsThisMonth}/${fresh.monthlyQuota}).`,
    );
  }
  return fresh;
}

export async function incrementProxyCalls(firmId: string): Promise<void> {
  const db = getDb();
  const row = await getFirmAiProxy(firmId);
  if (!row) return;
  const fresh = await rollPeriodIfNeeded(row);
  await db
    .update(firmAiProxy)
    .set({
      callsThisMonth: fresh.callsThisMonth + 1,
      updatedAt: new Date(),
    })
    .where(eq(firmAiProxy.firmId, firmId));
}

export function serializeProxyStatus(row: FirmAiProxyRow | null) {
  if (!row) {
    return {
      configured: false,
      status: null as string | null,
      tokenPrefix: null as string | null,
      monthlyQuota: DEFAULT_PROXY_QUOTA,
      callsThisMonth: 0,
      periodYm: currentPeriodYm(),
      remaining: DEFAULT_PROXY_QUOTA,
    };
  }
  const ym = currentPeriodYm();
  const calls = row.periodYm === ym ? row.callsThisMonth : 0;
  return {
    configured: true,
    status: row.status,
    tokenPrefix: row.tokenPrefix,
    monthlyQuota: row.monthlyQuota,
    callsThisMonth: calls,
    periodYm: ym,
    remaining: Math.max(0, row.monthlyQuota - calls),
  };
}

export { DEFAULT_PROXY_QUOTA };
