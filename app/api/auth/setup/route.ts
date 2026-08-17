import { authSetupFirm } from "@/lib/auth/service";
import { clientInfo, jsonError, jsonOk, serializeSession } from "@/lib/auth/http";

/** First-run firm + Managing Partner bootstrap. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      firmName?: string;
      fullName?: string;
      email?: string;
      password?: string;
      defaultCurrency?: string;
    };

    const user = await authSetupFirm(
      {
        firmName: body.firmName ?? "",
        fullName: body.fullName ?? "",
        email: body.email ?? "",
        password: body.password ?? "",
        defaultCurrency: body.defaultCurrency,
      },
      { ipOrUserAgent: clientInfo(request) },
    );

    return jsonOk({ user: serializeSession(user) });
  } catch (err) {
    return jsonError(err, request);
  }
}
