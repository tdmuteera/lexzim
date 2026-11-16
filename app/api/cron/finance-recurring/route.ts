import { jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { runDueRecurringForAllFirms } from "@/lib/repos/finance-recurring";

/**
 * Cron: run due recurring finance templates (scheduled create / reminder acknowledge).
 * Authorization: Bearer CRON_SECRET
 */
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new AuthError("forbidden", "CRON_SECRET is not configured on the server.");
    }
    const auth = request.headers.get("authorization")?.trim() ?? "";
    if (auth !== `Bearer ${secret}`) {
      throw new AuthError("forbidden", "Invalid cron authorization.");
    }

    const firms = await runDueRecurringForAllFirms();
    const created = firms.reduce(
      (n, f) => n + f.results.filter((r) => r.ok && r.created).length,
      0,
    );
    const reminded = firms.reduce(
      (n, f) => n + f.results.filter((r) => r.ok && !r.created).length,
      0,
    );
    const failed = firms.reduce((n, f) => n + f.results.filter((r) => !r.ok).length, 0);

    return jsonOk({
      ok: true,
      created,
      reminded,
      failed,
      firms,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function POST(request: Request) {
  return GET(request);
}
