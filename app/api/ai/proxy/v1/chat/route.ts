import { jsonError, jsonOk } from "@/lib/auth/http";
import { extractBearerToken, proxyChat } from "@/lib/ai/proxy/handlers";
import type { ChatMessage } from "@/lib/ai/types";

/**
 * LexZim AI proxy chat. Auth: Bearer firm proxy token.
 * Master provider keys stay on the server; never returned.
 */
export async function POST(request: Request) {
  try {
    const bearerToken = extractBearerToken(request);
    const body = (await request.json()) as {
      provider?: string;
      messages?: ChatMessage[];
      opts?: {
        model?: string;
        temperature?: number;
        maxOutputTokens?: number;
      };
    };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json(
        { ok: false, error: { code: "validation", message: "messages required." } },
        { status: 400 },
      );
    }
    const data = await proxyChat({
      bearerToken,
      provider: body.provider,
      messages: body.messages,
      opts: body.opts,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err, request);
  }
}
