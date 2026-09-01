import "server-only";

import {
  CLAUDE_CHAT_MODEL_ID,
  GEMINI_CHAT_MODEL_ID,
  OPENAI_CHAT_MODEL_ID,
  type LlmProviderId,
} from "@/lib/ai/types";

export type ChatModelOption = {
  id: string;
  label: string;
};

/** Curated chat models for Settings → AI (firm-wide). Custom IDs still work via manual entry. */
export const CHAT_MODEL_CATALOG: Record<LlmProviderId, ChatModelOption[]> = {
  claude: [
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (balanced, recommended)" },
    { id: "claude-opus-4-5", label: "Claude Opus 4.5 (most capable)" },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest)" },
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
  ],
  openai: [
    { id: "gpt-4.1", label: "GPT-4.1" },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini (cheapest)" },
  ],
  gemini: [
    { id: GEMINI_CHAT_MODEL_ID, label: "Gemini 3.6 Flash" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  ],
};

export function defaultChatModelForProvider(provider: LlmProviderId): string {
  if (provider === "claude") return CLAUDE_CHAT_MODEL_ID;
  if (provider === "openai") return OPENAI_CHAT_MODEL_ID;
  return GEMINI_CHAT_MODEL_ID;
}

export function isKnownChatModel(provider: LlmProviderId, modelId: string): boolean {
  const id = modelId.trim();
  return CHAT_MODEL_CATALOG[provider].some((m) => m.id === id);
}
