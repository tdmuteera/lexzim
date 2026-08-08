/**
 * Portal auth (P5-03). Separate from staff Supabase sessions.
 */
import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { writeAuditLog } from "@/lib/auth/audit";
import { AuthError } from "@/lib/auth/types";
import { validateEmail, validatePassword } from "@/lib/auth/password";
import { getDb } from "@/lib/db";
import { clients, firms, portalMagicLinks, portalUsers } from "@/lib/db/schema";
import { getAppPublicUrl } from "@/lib/env";
import { isPortalEnabled } from "@/lib/portal/config";
import {
  hashOpaqueToken,
  hashPortalPassword,
  newOpaqueToken,
  verifyPortalPassword,
} from "@/lib/portal/password";
import {
  PORTAL_SESSION_TTL_SEC,
  clearPortalSessionCookie,
  readPortalSessionCookie,
  setPortalSessionCookie,
  signPortalSession,
  verifyPortalSessionToken,
  type PortalSessionPayload,
} from "@/lib/portal/session-cookie";

export type PortalSessionUser = {
  id: string;
  email: string;
  fullName: string;
  firmId: string;
  firmName: string;
  firmSlug: string;
  clientId: string;
  clientDisplayName: string;
};

const MAGIC_TTL_MS = 30 * 60 * 1000;

function assertPortalFeature() {
  if (!isPortalEnabled()) {
    throw new AuthError("portal_disabled", "Client portal is disabled on this deployment.");
  }
}

function clientDisplayName(row: {
  clientType: string;
  fullName: string | null;
  legalName: string | null;
  tradingName: string | null;
}): string {
  if (row.clientType === "company") {
    return row.legalName || row.tradingName || "Company client";
  }
  return row.fullName || "Client";
}

export async function loadPortalSessionUser(
  portalUserId: string,
): Promise<PortalSessionUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: portalUsers.id,
      email: portalUsers.email,
      fullName: portalUsers.fullName,
      isActive: portalUsers.isActive,
      firmId: firms.id,
      firmName: firms.name,
      firmSlug: firms.slug,
      clientId: clients.id,
      clientType: clients.clientType,
      clientFullName: clients.fullName,
      clientLegalName: clients.legalName,
      clientTradingName: clients.tradingName,
    })
    .from(portalUsers)
    .innerJoin(firms, eq(portalUsers.firmId, firms.id))
    .innerJoin(clients, eq(portalUsers.clientId, clients.id))
    .where(eq(portalUsers.id, portalUserId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.isActive) return null;

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    firmId: row.firmId,
    firmName: row.firmName,
    firmSlug: row.firmSlug,
    clientId: row.clientId,
    clientDisplayName: clientDisplayName({
      clientType: row.clientType,
      fullName: row.clientFullName,
      legalName: row.clientLegalName,
      tradingName: row.clientTradingName,
    }),
  };
}

export async function portalCurrentUser(): Promise<PortalSessionUser | null> {
  assertPortalFeature();
  const raw = await readPortalSessionCookie();
  if (!raw) return null;
  const payload = verifyPortalSessionToken(raw);
  if (!payload) return null;
  const user = await loadPortalSessionUser(payload.sub);
  if (!user) return null;
  if (user.firmId !== payload.firmId || user.clientId !== payload.clientId) return null;
  return user;
}

export async function requirePortalSession(): Promise<PortalSessionUser> {
  const user = await portalCurrentUser();
  if (!user) throw new AuthError("unauthorized", "Portal sign-in required.");
  return user;
}

async function issueSession(
  user: typeof portalUsers.$inferSelect,
  opts?: { ipOrUserAgent?: string | null },
): Promise<PortalSessionUser> {
  const exp = Math.floor(Date.now() / 1000) + PORTAL_SESSION_TTL_SEC;
  const payload: PortalSessionPayload = {
    v: 1,
    sub: user.id,
    firmId: user.firmId,
    clientId: user.clientId,
    email: user.email,
    exp,
  };
  await setPortalSessionCookie(signPortalSession(payload));

  const db = getDb();
  await db
    .update(portalUsers)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(portalUsers.id, user.id));

  await writeAuditLog({
    action: "portal.login",
    firmId: user.firmId,
    userId: null,
    entityType: "portal_user",
    entityId: user.id,
    metadata: { email: user.email, clientId: user.clientId },
    ipOrUserAgent: opts?.ipOrUserAgent ?? null,
  });

  const session = await loadPortalSessionUser(user.id);
  if (!session) throw new AuthError("unauthorized", "Portal account inactive.");
  return session;
}

export async function portalLoginWithPassword(
  emailRaw: string,
  password: string,
  opts?: { ipOrUserAgent?: string | null; firmSlug?: string | null },
): Promise<PortalSessionUser> {
  assertPortalFeature();
  const email = validateEmail(emailRaw);
  if (!password) throw new AuthError("invalid_credentials", "Invalid email or password.");

  const db = getDb();
  const rows = await db
    .select({ user: portalUsers, slug: firms.slug })
    .from(portalUsers)
    .innerJoin(firms, eq(portalUsers.firmId, firms.id))
    .where(eq(portalUsers.email, email));

  let match = rows.find((r) => r.user.isActive && r.user.passwordHash);
  if (opts?.firmSlug) {
    const slug = opts.firmSlug.trim().toLowerCase();
    match = rows.find(
      (r) => r.user.isActive && r.user.passwordHash && r.slug === slug,
    );
  }

  if (!match?.user.passwordHash) {
    await writeAuditLog({
      action: "portal.login_failed",
      firmId: null,
      userId: null,
      entityType: "portal_user",
      entityId: null,
      metadata: { email, reason: "not_found" },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });
    throw new AuthError("invalid_credentials", "Invalid email or password.");
  }

  if (!verifyPortalPassword(password, match.user.passwordHash)) {
    await writeAuditLog({
      action: "portal.login_failed",
      firmId: match.user.firmId,
      userId: null,
      entityType: "portal_user",
      entityId: match.user.id,
      metadata: { email, reason: "bad_password" },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });
    throw new AuthError("invalid_credentials", "Invalid email or password.");
  }

  return issueSession(match.user, opts);
}

export async function portalLogout(opts?: {
  ipOrUserAgent?: string | null;
}): Promise<void> {
  const current = await portalCurrentUser().catch(() => null);
  await clearPortalSessionCookie();
  if (current) {
    await writeAuditLog({
      action: "portal.logout",
      firmId: current.firmId,
      userId: null,
      entityType: "portal_user",
      entityId: current.id,
      metadata: { email: current.email },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });
  }
}

export type InvitePortalUserInput = {
  firmId: string;
  clientId: string;
  email: string;
  fullName: string;
  password?: string | null;
  invitedByUserId: string;
  createMagicLink?: boolean;
};

export async function invitePortalUser(input: InvitePortalUserInput): Promise<{
  portalUserId: string;
  email: string;
  magicLinkUrl: string | null;
  magicLinkReturned: boolean;
}> {
  assertPortalFeature();
  const email = validateEmail(input.email);
  const fullName = input.fullName.trim();
  if (!fullName) throw new AuthError("validation", "fullName is required.");

  let passwordHash: string | null = null;
  if (input.password) {
    validatePassword(input.password);
    passwordHash = hashPortalPassword(input.password);
  }

  const db = getDb();
  const clientRows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.firmId, input.firmId)))
    .limit(1);
  if (!clientRows[0] || clientRows[0].archivedAt) {
    throw new AuthError("validation", "Client not found in this firm.");
  }

  const existing = await db
    .select()
    .from(portalUsers)
    .where(and(eq(portalUsers.firmId, input.firmId), eq(portalUsers.email, email)))
    .limit(1);

  let portalUser = existing[0];
  if (portalUser) {
    await db
      .update(portalUsers)
      .set({
        fullName,
        clientId: input.clientId,
        passwordHash: passwordHash ?? portalUser.passwordHash,
        isActive: true,
        invitedByUserId: input.invitedByUserId,
        invitedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(portalUsers.id, portalUser.id));
    portalUser = {
      ...portalUser,
      fullName,
      clientId: input.clientId,
      passwordHash: passwordHash ?? portalUser.passwordHash,
    };
  } else {
    const inserted = await db
      .insert(portalUsers)
      .values({
        firmId: input.firmId,
        clientId: input.clientId,
        email,
        fullName,
        passwordHash,
        invitedByUserId: input.invitedByUserId,
      })
      .returning();
    portalUser = inserted[0];
  }

  await writeAuditLog({
    action: "portal.user_invited",
    firmId: input.firmId,
    userId: input.invitedByUserId,
    entityType: "portal_user",
    entityId: portalUser.id,
    metadata: {
      email,
      clientId: input.clientId,
      hasPassword: Boolean(passwordHash || portalUser.passwordHash),
    },
    ipOrUserAgent: null,
  });

  let magicLinkUrl: string | null = null;
  if (input.createMagicLink !== false) {
    magicLinkUrl = await createMagicLinkForUser(portalUser.id, portalUser.firmId);
  }

  const returnLink =
    process.env.NODE_ENV !== "production" ||
    process.env.PORTAL_RETURN_MAGIC_LINK === "1";

  return {
    portalUserId: portalUser.id,
    email,
    magicLinkUrl: returnLink ? magicLinkUrl : null,
    magicLinkReturned: Boolean(returnLink && magicLinkUrl),
  };
}

async function createMagicLinkForUser(
  portalUserId: string,
  firmId: string,
): Promise<string> {
  const token = newOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const db = getDb();
  await db.insert(portalMagicLinks).values({
    portalUserId,
    firmId,
    tokenHash,
    expiresAt: new Date(Date.now() + MAGIC_TTL_MS),
  });

  const base = getAppPublicUrl() || "http://localhost:3000";
  return `${base}/portal/login?token=${encodeURIComponent(token)}`;
}

export async function requestPortalMagicLink(
  emailRaw: string,
  opts?: { ipOrUserAgent?: string | null; firmSlug?: string | null },
): Promise<{ sent: boolean; magicLinkUrl: string | null }> {
  assertPortalFeature();
  const email = validateEmail(emailRaw);
  const db = getDb();
  const rows = await db
    .select({ user: portalUsers, slug: firms.slug })
    .from(portalUsers)
    .innerJoin(firms, eq(portalUsers.firmId, firms.id))
    .where(and(eq(portalUsers.email, email), eq(portalUsers.isActive, true)));

  let match = rows[0] as (typeof rows)[number] | undefined;
  if (opts?.firmSlug) {
    match = rows.find((r) => r.slug === opts.firmSlug!.trim().toLowerCase());
  }

  // Always return generic success to avoid email enumeration in production responses.
  if (!match) {
    await writeAuditLog({
      action: "portal.magic_link_requested",
      firmId: null,
      userId: null,
      entityType: "portal_user",
      entityId: null,
      metadata: { email, found: false },
      ipOrUserAgent: opts?.ipOrUserAgent ?? null,
    });
    return { sent: true, magicLinkUrl: null };
  }

  const url = await createMagicLinkForUser(match.user.id, match.user.firmId);
  await writeAuditLog({
    action: "portal.magic_link_requested",
    firmId: match.user.firmId,
    userId: null,
    entityType: "portal_user",
    entityId: match.user.id,
    metadata: { email, found: true },
    ipOrUserAgent: opts?.ipOrUserAgent ?? null,
  });

  const returnLink =
    process.env.NODE_ENV !== "production" ||
    process.env.PORTAL_RETURN_MAGIC_LINK === "1";

  return { sent: true, magicLinkUrl: returnLink ? url : null };
}

export async function portalLoginWithMagicToken(
  token: string,
  opts?: { ipOrUserAgent?: string | null },
): Promise<PortalSessionUser> {
  assertPortalFeature();
  const tokenHash = hashOpaqueToken(token.trim());
  const db = getDb();
  const rows = await db
    .select({ link: portalMagicLinks, user: portalUsers })
    .from(portalMagicLinks)
    .innerJoin(portalUsers, eq(portalMagicLinks.portalUserId, portalUsers.id))
    .where(
      and(
        eq(portalMagicLinks.tokenHash, tokenHash),
        isNull(portalMagicLinks.usedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.user.isActive) {
    throw new AuthError("invalid_token", "This sign-in link is invalid or expired.");
  }
  if (row.link.expiresAt.getTime() < Date.now()) {
    throw new AuthError("invalid_token", "This sign-in link is invalid or expired.");
  }

  await db
    .update(portalMagicLinks)
    .set({ usedAt: new Date() })
    .where(eq(portalMagicLinks.id, row.link.id));

  return issueSession(row.user, opts);
}

export function serializePortalSession(user: PortalSessionUser) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    firm: {
      id: user.firmId,
      name: user.firmName,
      slug: user.firmSlug,
    },
    client: {
      id: user.clientId,
      displayName: user.clientDisplayName,
    },
    sessionTtlSeconds: PORTAL_SESSION_TTL_SEC,
  };
}
