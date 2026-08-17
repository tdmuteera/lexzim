import { jsonError, jsonOk } from "@/lib/auth/http";
import { extractBearerToken, proxyEmbed } from "@/lib/ai/proxy/handlers";

/** LexZim AI proxy embeddings. Auth: Bearer firm proxy token. */
export async function POST(request: Request) {
  try {
    const bearerToken = extractBearerToken(request);
    const body = (await request.json()) as {
      provider?: string;
      text?: string;
      opts?: { model?: string };
    };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return Response.json(
        { ok: false, error: { code: "validation", message: "text required." } },
        { status: 400 },
      );
    }
    const data = await proxyEmbed({
      bearerToken,
      provider: body.provider,
      text,
      opts: body.opts,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err, request);
  }
}
