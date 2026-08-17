import {
  authCurrentUser,
  authNeedsSetup,
} from "@/lib/auth/service";
import { jsonError, jsonOk, serializeSession } from "@/lib/auth/http";

/** Public status: first-run flag + current session (if any). */
export async function GET(request: Request) {
  try {
    const [needsSetup, user] = await Promise.all([authNeedsSetup(), authCurrentUser()]);
    return jsonOk({
      needsSetup,
      user: user ? serializeSession(user) : null,
    });
  } catch (err) {
    return jsonError(err, request);
  }
}
