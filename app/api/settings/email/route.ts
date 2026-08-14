import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  getFirmEmailConfigPublic,
  saveFirmEmailConfig,
} from "@/lib/email/config";
import { normalizeEmailAddress } from "@/lib/email/mailer";
import { requirePermission } from "@/lib/rbac/guards";
import { tenantFirmId } from "@/lib/tenant/scope";

/** GET firm SMTP config (browser-safe: no password, just passwordSet). */
export async function GET() {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const config = await getFirmEmailConfigPublic(firmId);
    return jsonOk({ config });
  } catch (err) {
    return jsonError(err);
  }
}

/** PUT firm SMTP config. Never echoes the password back. */
export async function PUT(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const firmId = tenantFirmId(session);
    const body = (await request.json()) as {
      host?: string;
      port?: number | string;
      secure?: boolean;
      user?: string;
      password?: string;
      fromName?: string;
      fromEmail?: string;
      replyTo?: string;
    };

    const host = typeof body.host === "string" ? body.host.trim() : "";
    if (!host) throw new AuthError("validation", "SMTP host is required.");

    const portNum = Number(body.port ?? 587);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new AuthError("validation", "Port must be between 1 and 65535.");
    }

    const fromEmailRaw = typeof body.fromEmail === "string" ? body.fromEmail : "";
    if (!fromEmailRaw.trim()) throw new AuthError("validation", "From email is required.");
    const fromEmail = normalizeEmailAddress(fromEmailRaw);

    const replyToRaw = typeof body.replyTo === "string" ? body.replyTo.trim() : "";
    const replyTo = replyToRaw ? normalizeEmailAddress(replyToRaw) : "";

    await saveFirmEmailConfig(firmId, {
      host,
      port: portNum,
      secure: Boolean(body.secure),
      user: typeof body.user === "string" ? body.user : "",
      // undefined = keep existing; "" = clear
      password: typeof body.password === "string" ? body.password : undefined,
      fromName: typeof body.fromName === "string" ? body.fromName : "",
      fromEmail,
      replyTo,
    });

    await writeAuditLog({
      action: "email.settings_updated",
      firmId,
      userId: session.id,
      entityType: "firm_settings",
      entityId: "email",
      metadata: { host, port: portNum, fromEmail, passwordChanged: body.password !== undefined },
      ipOrUserAgent: clientInfo(request),
    });

    const config = await getFirmEmailConfigPublic(firmId);
    return jsonOk({ config });
  } catch (err) {
    return jsonError(err);
  }
}
