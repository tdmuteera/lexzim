/**
 * Optional standalone LexZim AI proxy (P4-06).
 *
 * Default MVP: use the main Next.js app routes:
 *   POST /api/ai/proxy/v1/chat
 *   POST /api/ai/proxy/v1/embed
 *
 * This process is for a separate Railway service that shares DATABASE_URL
 * and holds the same master provider keys. It does not embed keys in any client.
 *
 * Run from repo root:
 *   npx tsx --tsconfig tsconfig.json services/ai-proxy/src/server.ts
 *
 * Env: PORT, DATABASE_URL, GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY,
 *      AUTH_SECRET or AI_PROXY_TOKEN_PEPPER
 */
import { createServer } from "http";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function readJson(req: import("http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw) as unknown;
}

function send(res: import("http").ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function main() {
  // Lazy-load app modules after env is loaded.
  const { extractBearerToken, proxyChat, proxyEmbed } = await import(
    "../../../lib/ai/proxy/handlers"
  );
  const { jsonError } = await import("../../../lib/auth/http");

  const port = Number(process.env.PORT || process.env.AI_PROXY_PORT || 8787);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
        send(res, 200, { ok: true, service: "lexzim-ai-proxy", version: "0.1.0" });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/chat") {
        const bearerToken = extractBearerToken(
          new Request(`http://local${url.pathname}`, {
            method: "POST",
            headers: req.headers as HeadersInit,
          }),
        );
        const body = (await readJson(req)) as {
          provider?: string;
          messages?: Parameters<typeof proxyChat>[0]["messages"];
          opts?: Parameters<typeof proxyChat>[0]["opts"];
        };
        const data = await proxyChat({
          bearerToken,
          provider: body.provider,
          messages: body.messages ?? [],
          opts: body.opts,
        });
        send(res, 200, { ok: true, data });
        return;
      }

      if (req.method === "POST" && url.pathname === "/v1/embed") {
        const bearerToken = extractBearerToken(
          new Request(`http://local${url.pathname}`, {
            method: "POST",
            headers: req.headers as HeadersInit,
          }),
        );
        const body = (await readJson(req)) as {
          provider?: string;
          text?: string;
          opts?: Parameters<typeof proxyEmbed>[0]["opts"];
        };
        const data = await proxyEmbed({
          bearerToken,
          provider: body.provider,
          text: body.text ?? "",
          opts: body.opts,
        });
        send(res, 200, { ok: true, data });
        return;
      }

      send(res, 404, { ok: false, error: { code: "not_found", message: "Not found." } });
    } catch (err) {
      const response = jsonError(err);
      const text = await response.text();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(text);
    }
  });

  server.listen(port, () => {
    console.log(`LexZim AI proxy listening on :${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
