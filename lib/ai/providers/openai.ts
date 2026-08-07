import "server-only";

import { NotImplementedProviderError } from "@/lib/ai/errors";
import type { LlmProvider } from "@/lib/ai/types";

/** Phase 4 stub. */
export function createOpenAiProvider(): LlmProvider {
  return {
    id: "openai",
    defaultChatModel: "gpt-4.1",
    defaultEmbeddingsModel: "text-embedding-3-small",
    async chat() {
      throw new NotImplementedProviderError("OpenAI");
    },
    async embed() {
      throw new NotImplementedProviderError("OpenAI");
    },
  };
}
