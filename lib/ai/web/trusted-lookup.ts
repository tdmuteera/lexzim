import "server-only";

import type { AiCitation } from "@/lib/db/ai-types";
import { resolveProviderApiKey } from "@/lib/ai/secrets";
import {
  runOpenAiWebSearch,
  type OpenAiWebSearchHit,
} from "@/lib/ai/web/openai-web-search";
import {
  findTrustedSiteForHost,
  TRUSTED_SITES,
  type TrustedSite,
} from "@/lib/ai/web/trusted-sites";

export type { TrustedSite };
export { TRUSTED_SITES };

export type WebLookupHit = OpenAiWebSearchHit & {
  siteId: string | null;
  siteLabel: string | null;
  sourceKind: "primary" | "secondary";
  unverified: true;
};

export type WebLookupResult = {
  enabled: boolean;
  attempted: boolean;
  hits: WebLookupHit[];
  citations: AiCitation[];
  /** The web-search model's own synthesized answer — extra grounding context only. */
  answerText: string;
  errorCode?: string;
  message?: string;
  latencyMs: number;
};

const PREFERRED_DOMAIN_HINT = TRUSTED_SITES.map((s) => s.host).join(", ");

function classifyHit(url: string): {
  siteId: string | null;
  siteLabel: string | null;
  sourceKind: "primary" | "secondary";
} {
  try {
    const site = findTrustedSiteForHost(new URL(url).hostname);
    if (site) return { siteId: site.id, siteLabel: site.label, sourceKind: site.kind };
  } catch {
    /* not a parseable URL — treat as unranked */
  }
  return { siteId: null, siteLabel: null, sourceKind: "secondary" };
}

/**
 * Independent live-web research step (P-AI-reset).
 *
 * Runs whenever the firm has an OpenAI key configured, regardless of which
 * provider (OpenAI/Claude/Gemini) ultimately writes the chat answer — this is
 * the "full web access" mechanism so brand-new gazetted law can still be
 * found. Reliable Zimbabwe sources (`trusted-sites.ts`) are only a ranking
 * hint, never a hard restriction: any verifiable page the model actually
 * retrieves may be cited. Every hit carries a real URL; nothing is invented.
 */
export async function lookupTrustedWeb(input: {
  firmId: string;
  query: string;
  enabled: boolean;
}): Promise<WebLookupResult> {
  const started = Date.now();
  const query = input.query.trim();

  if (!input.enabled) {
    return {
      enabled: false,
      attempted: false,
      hits: [],
      citations: [],
      answerText: "",
      latencyMs: Date.now() - started,
      message: "Web lookup is disabled for this firm.",
    };
  }

  if (!query) {
    return {
      enabled: true,
      attempted: false,
      hits: [],
      citations: [],
      answerText: "",
      latencyMs: Date.now() - started,
      errorCode: "empty_query",
    };
  }

  const resolved = await resolveProviderApiKey(input.firmId, "openai");
  if (!resolved.key) {
    return {
      enabled: true,
      attempted: false,
      hits: [],
      citations: [],
      answerText: "",
      latencyMs: Date.now() - started,
      errorCode: "missing_key",
      message:
        "No OpenAI key configured for this firm — live web search is unavailable this turn.",
    };
  }

  const result = await runOpenAiWebSearch({
    apiKey: resolved.key,
    query,
    preferredDomainHint: PREFERRED_DOMAIN_HINT,
  });

  if (!result.ok) {
    return {
      enabled: true,
      attempted: result.attempted,
      hits: [],
      citations: [],
      answerText: "",
      latencyMs: Date.now() - started,
      errorCode: result.errorCode,
      message:
        "Live web search did not return results this turn (network or provider issue). Using local knowledge only.",
    };
  }

  const hits: WebLookupHit[] = result.hits.map((h) => ({
    ...h,
    ...classifyHit(h.url),
    unverified: true,
  }));

  const citations: AiCitation[] = hits.map((h) => ({
    citationLabel: h.siteLabel ? `${h.siteLabel}: ${h.title}` : h.title,
    title: h.title,
    excerpt: h.snippet,
    sourceUrl: h.url,
    verified: false,
    sourceKind: h.sourceKind,
    verificationStatus: "web_consulted",
  }));

  return {
    enabled: true,
    attempted: true,
    hits,
    citations,
    answerText: result.answerText,
    latencyMs: Date.now() - started,
    message:
      hits.length === 0
        ? "Live web search ran but found no verifiable results for this question."
        : `Found ${hits.length} live web result(s).`,
  };
}

/** Context block fed to the chat model — never shown to the user verbatim. */
export function formatWebLookupBlock(hits: WebLookupHit[]): string {
  if (hits.length === 0) return "";
  const header =
    "Live web search results (UNVERIFIED — real URLs from this turn's search; cite them exactly, never invent or alter a link).";
  const body = hits
    .map(
      (h, i) =>
        `[web ${i + 1}] ${h.siteLabel ?? "web"}\nTitle: ${h.title}\nURL: ${h.url}\n${h.snippet}`,
    )
    .join("\n\n---\n\n");
  return `${header}\n\n${body}`;
}
