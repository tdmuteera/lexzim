import "server-only";

import { isOpenAiModelUnavailableError } from "@/lib/ai/providers/model-fallback";

/**
 * Live web search via the OpenAI Responses API `web_search` tool (P-AI-reset).
 *
 * This is the "full web access" mechanism for LexZim AI: a small, independent
 * research call that runs whenever the firm has an OpenAI key configured,
 * regardless of which provider (OpenAI/Claude/Gemini) ultimately writes the
 * chat answer. It never invents URLs — every hit comes from the model's own
 * `url_citation` annotations, which the Responses API only attaches to links
 * it actually found on the live web.
 *
 * Response parsing is defensive (recursive scan) because OpenAI's exact
 * Responses API JSON shape has shifted across releases. If the shape changes
 * again, this degrades to "no web hits" rather than throwing — the rest of
 * the pipeline (local knowledge base + model's own knowledge) still answers.
 */

/**
 * Cheap-first candidates for the web-search call itself (not the answer-writing
 * model). Verified P-AI-reset: some OpenAI projects block the rolling alias for
 * a family (e.g. `gpt-4o-mini`) but allow a specific dated snapshot of the same
 * family. Try the alias first, then its known-good dated snapshot, then widen.
 */
const WEB_SEARCH_MODEL_CANDIDATES = [
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4o",
] as const;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HITS = 6;

export type OpenAiWebSearchHit = {
  title: string;
  url: string;
  /** Best-effort excerpt around the citation; may be empty. */
  snippet: string;
};

export type OpenAiWebSearchResult = {
  /** True once we actually attempted the HTTP call (vs skipped, e.g. no key). */
  attempted: boolean;
  ok: boolean;
  hits: OpenAiWebSearchHit[];
  /** The model's own synthesized answer text, useful as extra grounding context. */
  answerText: string;
  errorCode?: string;
  latencyMs: number;
};

type RawHit = OpenAiWebSearchHit;

function extractFromOutputTextNode(
  node: Record<string, unknown>,
  out: Map<string, RawHit>,
  textParts: string[],
): void {
  const textField = node.text;
  const value =
    typeof textField === "string"
      ? textField
      : textField &&
          typeof textField === "object" &&
          typeof (textField as Record<string, unknown>).value === "string"
        ? ((textField as Record<string, unknown>).value as string)
        : "";
  if (value) textParts.push(value);

  const annotationsRaw =
    Array.isArray(node.annotations)
      ? node.annotations
      : textField &&
          typeof textField === "object" &&
          Array.isArray((textField as Record<string, unknown>).annotations)
        ? ((textField as Record<string, unknown>).annotations as unknown[])
        : [];

  for (const ann of annotationsRaw) {
    if (!ann || typeof ann !== "object") continue;
    const a = ann as Record<string, unknown>;
    if (a.type !== "url_citation") continue;
    // Live-verified shape: fields sit directly on the annotation object
    // (`{ type: "url_citation", url, title, start_index, end_index }`).
    // Some OpenAI docs/SDKs show a nested `{ url_citation: { url, title } }`
    // wrapper instead — support both defensively.
    const nested =
      a.url_citation && typeof a.url_citation === "object"
        ? (a.url_citation as Record<string, unknown>)
        : null;
    const u = nested ?? a;
    const url = typeof u.url === "string" ? u.url.trim() : "";
    if (!url || out.has(url)) continue;
    // NFKC: search-result titles sometimes carry ligatures (e.g. "Codiﬁcation")
    // that would otherwise break downstream word matching / relevance checks.
    const rawTitle =
      typeof u.title === "string" ? u.title.normalize("NFKC").trim() : "";
    const title = rawTitle || url;

    let snippet = "";
    const start = typeof a.start_index === "number" ? a.start_index : null;
    const end = typeof a.end_index === "number" ? a.end_index : null;
    if (value && start !== null && end !== null) {
      const from = Math.max(0, start - 140);
      const to = Math.min(value.length, end + 140);
      snippet = value.slice(from, to).replace(/\s+/g, " ").trim();
    }

    out.set(url, { title, url, snippet });
  }
}

function walk(node: unknown, out: Map<string, RawHit>, textParts: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, textParts);
    return;
  }
  const obj = node as Record<string, unknown>;
  if (obj.type === "output_text") {
    extractFromOutputTextNode(obj, out, textParts);
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walk(value, out, textParts);
  }
}

/** One attempt against a single model. Throws a tagged error object on failure. */
async function attemptWebSearch(input: {
  apiKey: string;
  model: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<{ hits: RawHit[]; answerText: string }> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: input.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        tools: [{ type: "web_search" }],
        input: input.prompt,
      }),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw { code: aborted ? "timeout" : "network_error" };
  }

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    // Preserve OpenAI's own error code (e.g. "model_not_found") so
    // isOpenAiModelUnavailableError can detect a blocked model and move on.
    throw {
      code: errBody.error?.code || (res.status === 429 ? "rate_limited" : `http_${res.status}`),
      message: errBody.error?.message ?? "",
      httpStatus: res.status,
    };
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const hitsMap = new Map<string, RawHit>();
  const textParts: string[] = [];
  walk(body, hitsMap, textParts);

  const answerText =
    typeof body.output_text === "string" && body.output_text.trim()
      ? body.output_text.trim()
      : textParts.join("\n").trim();

  return { hits: [...hitsMap.values()], answerText };
}

/**
 * Run a single live web-search turn. Always non-throwing: failures return
 * `ok: false` with an errorCode so callers can proceed without web grounding.
 * Walks a short cheap-first model candidate list so a project-level model
 * allowlist that blocks one alias does not silently disable web search.
 */
export async function runOpenAiWebSearch(input: {
  apiKey: string;
  query: string;
  model?: string;
  /** Advisory only — the model may still cite anything else it verifiably finds. */
  preferredDomainHint?: string;
}): Promise<OpenAiWebSearchResult> {
  const started = Date.now();
  const query = input.query.trim();
  if (!query) {
    return {
      attempted: false,
      ok: false,
      hits: [],
      answerText: "",
      latencyMs: 0,
      errorCode: "empty_query",
    };
  }

  const instructions =
    "Search the live web for facts that answer the question below. Zimbabwe law context. " +
    (input.preferredDomainHint
      ? `Check these sources first when relevant: ${input.preferredDomainHint}. `
      : "") +
    "You may also use any other verifiable page you find if nothing better exists there. " +
    "Never invent a URL or cite a page you did not actually retrieve. Keep the answer brief.";
  const prompt = `${instructions}\n\nQuestion: ${query}`;

  const candidates = input.model?.trim()
    ? [input.model.trim(), ...WEB_SEARCH_MODEL_CANDIDATES]
    : [...WEB_SEARCH_MODEL_CANDIDATES];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let lastError: { code?: string } = {};
  try {
    for (const model of candidates) {
      try {
        const result = await attemptWebSearch({
          apiKey: input.apiKey,
          model,
          prompt,
          signal: controller.signal,
        });
        return {
          attempted: true,
          ok: true,
          hits: result.hits.slice(0, MAX_HITS),
          answerText: result.answerText,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        lastError = (err ?? {}) as { code?: string };
        if (isOpenAiModelUnavailableError(err)) continue;
        break;
      }
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      attempted: true,
      ok: false,
      hits: [],
      answerText: "",
      latencyMs: Date.now() - started,
      errorCode: aborted ? "timeout" : "network_error",
    };
  } finally {
    clearTimeout(timer);
  }

  return {
    attempted: true,
    ok: false,
    hits: [],
    answerText: "",
    latencyMs: Date.now() - started,
    errorCode: lastError.code ?? "network_error",
  };
}
