/**
 * Turn shallow homepage / root URLs into searchable authority links.
 * Prefer document URLs when already deep; never invent fake Act paths.
 */

const STOP = new Set([
  "starter",
  "pack",
  "excerpts",
  "orientation",
  "caution",
  "related",
  "family",
  "statutes",
  "and",
  "the",
  "of",
  "for",
  "with",
  "from",
  "unverified",
  "chapter",
  "act",
  "code",
  "law",
]);

/** Strip UI noise from a citation label into a search query. */
export function authoritySearchQuery(label: string): string {
  // NFKC first: web-search titles sometimes carry ligatures (e.g. "Codiﬁcation")
  // that would otherwise break word tokenization downstream.
  const cleaned = label
    .normalize("NFKC")
    .replace(/\[UNVERIFIED\]/gi, " ")
    .replace(/—.*$/u, " ")
    .replace(/-\s*starter pack.*$/i, " ")
    .replace(/\bstarter pack\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const chapter = cleaned.match(/Chapter\s*[\d:]+/i);
  // Many Zimbabwe Act names carry a parenthetical qualifier as part of the
  // official title (e.g. "Criminal Law (Codification and Reform) Act") —
  // match it as one optional inline segment so it is NOT stripped away below.
  const act = cleaned.match(
    /([A-Z][A-Za-z0-9'’,-]+(?:\s+[A-Z][A-Za-z0-9'’,-]+)*(?:\s*\([^()]{1,60}\))?(?:\s+[A-Z][A-Za-z0-9'’,-]+)*\s+Act)\b/,
  );
  const q = act
    ? act[1] + (chapter ? ` ${chapter[0]}` : "")
    : cleaned.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return q.slice(0, 160).trim();
}

export function isShallowAuthorityUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr?.trim()) return true;
  try {
    const u = new URL(urlStr);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    if (path === "/" || path === "") return true;
    if (/\/search(\/|$)/i.test(path) && !u.searchParams.get("q") && !u.search.includes("node/")) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function siteSearchUrl(hostname: string, query: string): string | null {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  if (h.includes("zimlii")) return `https://zimlii.org/search?q=${encodeURIComponent(query)}`;
  if (h.includes("veritas")) {
    return `https://www.veritaszim.net/search/node/${encodeURIComponent(query)}`;
  }
  if (h.includes("parlzim")) {
    return `https://www.parlzim.gov.zw/?s=${encodeURIComponent(query)}`;
  }
  if (h.includes("justice.gov")) {
    return `https://www.justice.gov.zw/?s=${encodeURIComponent(query)}`;
  }
  return null;
}

/**
 * If URL is a bare homepage (or empty), replace with allowlisted search for the Act/label.
 * Deep document URLs are left unchanged.
 */
export function deepenAuthorityUrl(
  url: string | null | undefined,
  citationLabel: string,
): string | null {
  const query = authoritySearchQuery(citationLabel);
  if (!query) return url?.trim() || null;

  if (!url?.trim() || isShallowAuthorityUrl(url)) {
    return `https://zimlii.org/search?q=${encodeURIComponent(query)}`;
  }

  try {
    const host = new URL(url).hostname;
    if (isShallowAuthorityUrl(url)) {
      return siteSearchUrl(host, query) ?? url;
    }
    return url;
  } catch {
    return `https://zimlii.org/search?q=${encodeURIComponent(query)}`;
  }
}

/** Significant words from a citation label for answer-overlap checks. */
export function citationKeywordSet(label: string): string[] {
  const q = authoritySearchQuery(label).toLowerCase();
  return q
    .replace(/[^a-z0-9:\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}
