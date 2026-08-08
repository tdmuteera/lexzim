import "server-only";

import {
  InvalidKeyError,
  MissingKeyError,
  NetworkError,
  ProviderError,
  RateLimitedError,
} from "@/lib/ai/errors";
import { proxyChat, proxyEmbed } from "@/lib/ai/proxy/handlers";
import {
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedOptions,
  type EmbedResult,
  type LlmProvider,
  type LlmProviderId,
} from "@/lib/ai/types";

function mapProxyHttp(status: number, message: string): never {
  if (status === 401 || status === 403) throw new InvalidKeyError(message);
  if (status === 429) throw new RateLimitedError(message);
  if (status >= 500) throw new NetworkError(message);
  throw new ProviderError(message, status);
}

/**
 * Client provider for LexZim AI proxy.
 * Uses in-process handlers when AI_PROXY_URL is unset (same Next.js deploy).
 * Uses HTTP when AI_PROXY_URL points at a standalone proxy service.
 */
export function createProxyProvider(opts: {
  proxyBaseUrl: string | null;
  firmProxyToken: string;
  providerId: LlmProviderId;
  chatModel: string;
  embeddingsModel: string;
}): LlmProvider {
  const remoteBase = opts.proxyBaseUrl?.replace(/\/$/, "") || null;

  async function postRemote<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${remoteBase}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.firmProxyToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new NetworkError("Could not reach LexZim AI proxy.");
    }

    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: T;
      error?: { message?: string; code?: string };
    } | null;

    if (!res.ok || !json?.ok || !json.data) {
      const msg = json?.error?.message ?? `AI proxy error (${res.status})`;
      mapProxyHttp(res.status, msg);
    }
    return json.data;
  }

  return {
    id: opts.providerId,
    defaultChatModel: opts.chatModel,
    defaultEmbeddingsModel: opts.embeddingsModel,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<ChatResult> {
      if (!opts.firmProxyToken) {
        throw new MissingKeyError("LexZim AI proxy token is not configured for this firm.");
      }
      if (!remoteBase) {
        const data = await proxyChat({
          bearerToken: opts.firmProxyToken,
          provider: opts.providerId,
          messages,
          opts: chatOpts,
        });
        return {
          text: data.text,
          model: data.model,
          provider: data.provider,
          latencyMs: data.latencyMs,
        };
      }
      const data = await postRemote<{
        text: string;
        model: string;
        provider: LlmProviderId;
        latencyMs: number;
      }>("/v1/chat", {
        provider: opts.providerId,
        messages,
        opts: chatOpts,
      });
      return {
        text: data.text,
        model: data.model,
        provider: data.provider,
        latencyMs: data.latencyMs,
      };
    },

    async embed(text: string, embedOpts?: EmbedOptions): Promise<EmbedResult> {
      if (!opts.firmProxyToken) {
        throw new MissingKeyError("LexZim AI proxy token is not configured for this firm.");
      }
      if (!remoteBase) {
        const data = await proxyEmbed({
          bearerToken: opts.firmProxyToken,
          provider: opts.providerId,
          text,
          opts: embedOpts,
        });
        return {
          embedding: data.embedding,
          model: data.model,
          provider: data.provider,
          dimensions: data.dimensions,
          latencyMs: data.latencyMs,
          fallbackProvider: data.fallbackProvider,
        };
      }
      const data = await postRemote<{
        embedding: number[];
        model: string;
        provider: LlmProviderId;
        dimensions: number;
        latencyMs: number;
        fallbackProvider?: LlmProviderId;
      }>("/v1/embed", {
        provider: opts.providerId,
        text,
        opts: embedOpts,
      });
      return {
        embedding: data.embedding,
        model: data.model,
        provider: data.provider,
        dimensions: data.dimensions,
        latencyMs: data.latencyMs,
        fallbackProvider: data.fallbackProvider,
      };
    },
  };
}

/** Dedicated proxy URL, or null for in-process handlers on the main app. */
export function resolveProxyBaseUrl(): string | null {
  const explicit = process.env.AI_PROXY_URL?.trim();
  if (!explicit) return null;
  return explicit.replace(/\/$/, "");
}
