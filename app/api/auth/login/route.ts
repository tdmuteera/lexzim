import { authLogin } from "@/lib/auth/service";
import { clientInfo, jsonError, jsonOk, serializeSession } from "@/lib/auth/http";
import { prepareDbRetry } from "@/lib/db";

export async function POST(request: Request) {
  try {
    prepareDbRetry();
    const body = (await request.json()) as { email?: string; password?: string };
    const user = await authLogin(body.email ?? "", body.password ?? "", {
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ user: serializeSession(user) });
  } catch (err) {
    return jsonError(err);
  }
}
