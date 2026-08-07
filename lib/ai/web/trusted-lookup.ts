import "server-only";

import type { AiCitation } from "@/lib/db/ai-types";

export type TrustedSite = {
  id: string;
  host: string;
  label: string;
  searchUrl: (query: string) => string;
};

/** Allowlisted Zimbabwe research sites only (P2-13). */
export const TRUSTED_SITES: TrustedSite[] = [
  {
    id: "zimlii",
    host: "zimlii.org",
    label: "ZimLII",
    searchUrl: (q) => `https://zimlii.org/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "veritas",
    host: "veritaszim.net",
    label: "Veritas Zimbabwe",
    searchUrl: (q) =>
      `https://www.veritaszim.net/search/node/${encodeURIComponent(q)}`,
  },
  {
    id: "parliament",
    host: "parlzim.gov.zw",
    label: "Parliament of Zimbabwe",
    searchUrl: (q) =>
      `https://www.parlzim.gov.zw/?s=${encodeURIComponent(q)}`,
  },
];

export type WebLookupHit = {
  siteId: string;
  siteLabel: string;
  title: string;
  url: string;
  excerpt: string;
  unverified: true;
};

export type WebLookupResult = {
  enabled: boolean;
  attempted: boolean;
  hits: WebLookupHit[];
  citations: AiCitation[];
  errorCode?: string;
  message?: string;
  latencyMs: number;
};

const FETCH_TIMEOUT_MS = 4500;
const MAX_HITS = 3;

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return TRUSTED_SITES.some(
    (s) => h === s.host || h.endsWith(`.${s.host}`),
  );
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinks(html: string, baseHost: string): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const title = stripTags(m[2]);
    if (!title || title.length < 4) continue;
    try {
      const url = new URL(href, `https://${baseHost}`);
      if (!hostAllowed(url.hostname)) continue;
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;
      out.push({ href: url.toString(), title: title.slice(0, 160) });
    } catch {
      /* skip */
    }
    if (out.length >= 6) break;
  }
  return out;
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "LexZimLegalResearchBot/1.0 (+practice aid; contact firm admin)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text") && !ctype.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optional allowlisted web lookup. Failures return empty hits (local RAG only).
 * All hits are UNVERIFIED and must never silently override local grounding.
 */
export async function lookupTrustedWeb(input: {
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
      latencyMs: Date.now() - started,
      message: "Web lookup is disabled for this firm (default).",
    };
  }

  if (!query) {
    return {
      enabled: true,
      attempted: false,
      hits: [],
      citations: [],
      latencyMs: Date.now() - started,
      errorCode: "empty_query",
    };
  }

  const hits: WebLookupHit[] = [];
  let networkFailures = 0;

  for (const site of TRUSTED_SITES) {
    if (hits.length >= MAX_HITS) break;
    const searchUrl = site.searchUrl(query.slice(0, 120));
    const html = await fetchText(searchUrl);
    if (!html) {
      networkFailures += 1;
      continue;
    }

    const links = extractLinks(html, site.host);
    for (const link of links) {
      if (hits.length >= MAX_HITS) break;
      if (hits.some((h) => h.url === link.href)) continue;

      let excerpt = "";
      const page = await fetchText(link.href);
      if (page) {
        excerpt = stripTags(page).slice(0, 280);
      }
      if (!excerpt) excerpt = `Search result from ${site.label} (open URL to verify).`;

      hits.push({
        siteId: site.id,
        siteLabel: site.label,
        title: link.title,
        url: link.href,
        excerpt,
        unverified: true,
      });
    }
  }

  const citations: AiCitation[] = hits.map((h) => ({
    citationLabel: `[UNVERIFIED] ${h.siteLabel}: ${h.title}`,
    title: h.title,
    excerpt: h.excerpt,
    sourceUrl: h.url,
    verified: false,
  }));

  return {
    enabled: true,
    attempted: true,
    hits,
    citations,
    latencyMs: Date.now() - started,
    errorCode:
      hits.length === 0 && networkFailures === TRUSTED_SITES.length
        ? "network_error"
        : hits.length === 0
          ? "no_web_hits"
          : undefined,
    message:
      hits.length === 0
        ? "No allowlisted web results (or sites unreachable). Using local knowledge only."
        : `Found ${hits.length} UNVERIFIED allowlisted web snippet(s).`,
  };
}

export function formatWebLookupBlock(hits: WebLookupHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .map(
      (h, i) =>
        `[UNVERIFIED web ${i + 1}] ${h.siteLabel}\nTitle: ${h.title}\nURL: ${h.url}\n${h.excerpt}`,
    )
    .join("\n\n---\n\n");
}
