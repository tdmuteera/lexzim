/** Client-safe AI UX copy and helpers (P2-12). Not server-only. */

export type AiConnectivityState =
  | "ready"
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "unreachable"
  | "provider_error"
  | "unknown";

export const CORE_PRACTICE_NOTE =
  "Matters, clients, documents, templates, procedures, search, and export keep working even if AI is down.";

export function humanAiError(message: string | undefined, status?: number): string {
  const m = (message ?? "").toLowerCase();
  if (
    m.includes("missing") && (m.includes("key") || m.includes("gemini_api_key"))
  ) {
    return "The Gemini API key is not configured on the server. Ask a Managing Partner to set GEMINI_API_KEY under Settings → AI.";
  }
  if (
    m.includes("anthropic-workspace-id") ||
    m.includes("workspace_id") ||
    m.includes("identity-linked")
  ) {
    return "Anthropic key needs ANTHROPIC_WORKSPACE_ID in Railway (wrkspc_… from Claude Console → Workspaces), or create a single-workspace API key.";
  }
  if (m.includes("rate") || m.includes("429") || status === 429) {
    return "The AI provider is rate-limiting requests. Wait a moment and try again.";
  }
  if (
    m.includes("network") ||
    m.includes("unreachable") ||
    m.includes("fetch failed") ||
    status === 503
  ) {
    return "Could not reach the AI provider. Check connectivity and try again. Core LexZim practice features still work.";
  }
  if (m.includes("do not have access") || m.includes("forbidden") || status === 403) {
    return "You do not have permission for this AI action.";
  }
  if (status === 401) return "Your session expired. Sign in again.";
  return message?.trim() || "Could not complete that AI request. Please try again.";
}

export function connectivityBanner(
  state: AiConnectivityState | undefined,
): { tone: "danger" | "warn" | "ok"; text: string } | null {
  switch (state) {
    case "missing_key":
      return {
        tone: "danger",
        text: "AI key missing. Legal Research is blocked. Matter Assist can still use live matter facts. Core practice modules are unaffected.",
      };
    case "invalid_key":
      return {
        tone: "danger",
        text: "AI key invalid. Legal Research is blocked until GEMINI_API_KEY is fixed.",
      };
    case "rate_limited":
      return {
        tone: "warn",
        text: "AI provider rate-limited. Send is temporarily disabled for Legal Research. Retry shortly.",
      };
    case "unreachable":
      return {
        tone: "warn",
        text: "AI provider unreachable. Legal Research send is disabled. Core LexZim features still work.",
      };
    case "provider_error":
      return {
        tone: "warn",
        text: "AI provider reported an error. You can retry; practice features remain available.",
      };
    default:
      return null;
  }
}

export function isTransientHttpStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 502;
}

/** Browser fetch with exponential backoff for transient AI failures. */
export async function fetchAiJsonWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { retries?: number; baseDelayMs?: number },
): Promise<Response> {
  const retries = opts?.retries ?? 2;
  const baseDelayMs = opts?.baseDelayMs ?? 500;
  let attempt = 0;
  for (;;) {
    try {
      const res = await fetch(input, init);
      if (!isTransientHttpStatus(res.status) || attempt >= retries) return res;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      attempt += 1;
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      attempt += 1;
    }
  }
}
