import type { ChatMessage } from "@/lib/ai/types";
import { listMessages } from "@/lib/repos/ai-conversations";

/** Last N user/assistant turns for ChatGPT-style continuity. */
export async function loadChatHistory(opts: {
  firmId: string;
  conversationId: string;
  limit?: number;
}): Promise<ChatMessage[]> {
  const rows = await listMessages(opts.firmId, opts.conversationId);
  const limit = opts.limit ?? 12;
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.slice(0, 6000),
    }));
}
