/**
 * Reliable Zimbabwe legal research sources (P-AI-reset).
 *
 * This is a RANKING/BOOST list, not a hard allowlist: the assistant may cite any
 * verifiable page it actually finds via web search. Sources on this list are
 * simply checked/preferred first and ranked above unfamiliar domains when both
 * are relevant. `kind` marks whether a site typically hosts primary legal text
 * (legislation/judgments) or secondary/official commentary — used to decide
 * whether a matched hit belongs in "Primary sources" or "Other sources consulted".
 * `topics` are soft hints for when a source is worth boosting for a question
 * (e.g. never boost ZIMRA for a criminal-law question). Hosts are best-effort;
 * a stale/incorrect host only weakens ranking, it never blocks a real result.
 */

export type TrustedSite = {
  id: string;
  host: string;
  label: string;
  kind: "primary" | "secondary";
  /** Soft topic hints for ranking boosts only (not a restriction). */
  topics: string[];
  searchUrl: (query: string) => string;
};

export const TRUSTED_SITES: TrustedSite[] = [
  {
    id: "zimlii",
    host: "zimlii.org",
    label: "ZimLII",
    kind: "primary",
    topics: ["general"],
    searchUrl: (q) => `https://zimlii.org/search?q=${encodeURIComponent(q)}`,
  },
  {
    id: "veritas",
    host: "veritaszim.net",
    label: "Veritas Zimbabwe",
    kind: "primary",
    topics: ["general", "gazette"],
    searchUrl: (q) =>
      `https://www.veritaszim.net/search/node/${encodeURIComponent(q)}`,
  },
  {
    id: "parliament",
    host: "parlzim.gov.zw",
    label: "Parliament of Zimbabwe",
    kind: "primary",
    topics: ["bills", "hansard", "general"],
    searchUrl: (q) =>
      `https://www.parlzim.gov.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "justice",
    host: "justice.gov.zw",
    label: "Ministry of Justice, Legal and Parliamentary Affairs",
    kind: "secondary",
    topics: ["procedure", "constitutional", "general"],
    searchUrl: (q) =>
      `https://www.justice.gov.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "jsc",
    host: "jsc.org.zw",
    label: "Judicial Service Commission",
    kind: "secondary",
    topics: ["procedure", "general"],
    searchUrl: (q) => `https://www.jsc.org.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "zimra",
    host: "zimra.co.zw",
    label: "ZIMRA",
    kind: "secondary",
    topics: ["tax"],
    searchUrl: (q) => `https://www.zimra.co.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "rbz",
    host: "rbz.co.zw",
    label: "Reserve Bank of Zimbabwe",
    kind: "secondary",
    topics: ["tax", "finance", "exchange_control"],
    searchUrl: (q) => `https://www.rbz.co.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "lsz",
    host: "lsz.org.zw",
    label: "Law Society of Zimbabwe",
    kind: "secondary",
    topics: ["procedure", "general"],
    searchUrl: (q) => `https://www.lsz.org.zw/?s=${encodeURIComponent(q)}`,
  },
  {
    id: "zhrc",
    host: "zhrc.org.zw",
    label: "Zimbabwe Human Rights Commission",
    kind: "secondary",
    topics: ["constitutional", "general"],
    searchUrl: (q) => `https://www.zhrc.org.zw/?s=${encodeURIComponent(q)}`,
  },
];

/** Host → site lookup, ignoring a leading www. */
export function findTrustedSiteForHost(hostname: string): TrustedSite | null {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return (
    TRUSTED_SITES.find((s) => h === s.host || h.endsWith(`.${s.host}`)) ?? null
  );
}
