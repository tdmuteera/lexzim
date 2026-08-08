import { writeAuditLog } from "@/lib/auth/audit";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import {
  getFirmAiProxy,
  issueAndStoreFirmProxyToken,
  revokeFirmProxyToken,
  serializeProxyStatus,
} from "@/lib/ai/proxy/credentials";
import { assertCanUse } from "@/lib/licensing/policy";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** Proxy credential status (never returns raw token). */
export async function GET() {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const row = await getFirmAiProxy(firmId);
    let eligible = false;
    try {
      await assertCanUse(firmId, "ai_proxy");
      eligible = true;
    } catch {
      eligible = false;
    }
    return jsonOk({
      eligible,
      proxy: serializeProxyStatus(row),
      hint: eligible
        ? "Issue a token, set key mode to LexZim Proxy, and keep the token secret (server-side only)."
        : "Upgrade to Firm edition (ai_proxy) to use LexZim Proxy.",
    });
  } catch (err) {
    return jsonError(err);
  }
}

/** Issue/rotate or revoke firm proxy token. */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("ai.manage_settings");
    const firmId = tenantFirmId(session);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      monthlyQuota?: number;
    };
    const action = (body.action ?? "issue").trim().toLowerCase();

    if (action === "revoke") {
      await revokeFirmProxyToken(firmId);
      await writeAuditLog({
        action: "ai.proxy_token_revoke",
        firmId,
        userId: session.id,
        entityType: "firm_ai_proxy",
        entityId: firmId,
        metadata: {},
        ipOrUserAgent: clientInfo(request),
      });
      return jsonOk({
        revoked: true,
        proxy: serializeProxyStatus(await getFirmAiProxy(firmId)),
      });
    }

    if (action !== "issue" && action !== "rotate") {
      throw new AuthError("validation", "action must be issue, rotate, or revoke.");
    }

    const issued = await issueAndStoreFirmProxyToken(firmId, {
      monthlyQuota:
        typeof body.monthlyQuota === "number" && body.monthlyQuota > 0
          ? Math.floor(body.monthlyQuota)
          : undefined,
    });

    await writeAuditLog({
      action: "ai.proxy_token_issue",
      firmId,
      userId: session.id,
      entityType: "firm_ai_proxy",
      entityId: firmId,
      metadata: {
        tokenPrefix: issued.prefix,
        monthlyQuota: issued.monthlyQuota,
      },
      ipOrUserAgent: clientInfo(request),
    });

    return jsonOk({
      /** Shown once — store in server env / secrets manager for this firm. */
      token: issued.rawToken,
      tokenPrefix: issued.prefix,
      monthlyQuota: issued.monthlyQuota,
      warning:
        "Copy this token now. It is not shown again. Never put it in NEXT_PUBLIC_* or client code.",
      proxy: serializeProxyStatus(await getFirmAiProxy(firmId)),
    });
  } catch (err) {
    return jsonError(err);
  }
}
