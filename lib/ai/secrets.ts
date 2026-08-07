import "server-only";

/**
 * AI secrets (P2-02). Never return these to the browser.
 * Phase 2 testing: LexZim-managed GEMINI_API_KEY on Railway / .env.local.
 * Firm BYO keys: deferred (Phase 4 / encrypted vault).
 */

export type GeminiKeyStatus = "missing" | "present";

export function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

export function getGeminiKeyStatus(): GeminiKeyStatus {
  return getGeminiApiKey() ? "present" : "missing";
}

export function requireGeminiApiKey(): string {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return key;
}

/** Safe for API responses — never includes the key. */
export function publicKeyInfo() {
  return {
    source: "server_env" as const,
    status: getGeminiKeyStatus(),
    byoAvailable: false,
    byoNote: "Firm bring-your-own keys are coming in a later phase (encrypted / vault).",
  };
}
