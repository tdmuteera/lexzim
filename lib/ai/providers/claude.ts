import "server-only";

import { NotImplementedProviderError } from "@/lib/ai/errors";
import type { LlmProvider } from "@/lib/ai/types";

/** Phase 4 stub. */
export function createClaudeProvider(): LlmProvider {
  return {
    id: "claude",
    defaultChatModel: "claude-sonnet-4-5",
    defaultEmbeddingsModel: "n/a",
    async chat() {
      throw new NotImplementedProviderError("Claude");
    },
    async embed() {
      throw new NotImplementedProviderError("Claude");
    },
  };
}
