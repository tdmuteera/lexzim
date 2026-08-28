import { authLogout } from "@/lib/auth/service";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    let reason: string | null = null;
    try {
      const body = (await request.json()) as { reason?: string };
      if (typeof body.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim().slice(0, 40);
      }
    } catch {
      /* empty body is fine (manual Sign out) */
    }
    await authLogout({
      ipOrUserAgent: clientInfo(request),
      reason,
    });
    return jsonOk({ signedOut: true, reason });
  } catch (err) {
    return jsonError(err, request);
  }
}