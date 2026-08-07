import { requireSession } from "@/lib/auth/service";
import { jsonError, jsonOk, serializeSession } from "@/lib/auth/http";

/** Sample protected endpoint: requires a valid session (P0-07). */
export async function GET() {
  try {
    const user = await requireSession();
    return jsonOk({ user: serializeSession(user) });
  } catch (err) {
    return jsonError(err);
  }
}
