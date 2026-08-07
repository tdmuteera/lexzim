import { authLogout } from "@/lib/auth/service";
import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";

export async function POST(request: Request) {
  try {
    await authLogout({ ipOrUserAgent: clientInfo(request) });
    return jsonOk({ signedOut: true });
  } catch (err) {
    return jsonError(err);
  }
}
