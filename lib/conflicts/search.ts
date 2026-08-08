/**
 * Firm-scoped conflict-of-interest search (P3-10).
 * Operational helper only: not a substitute for professional judgment.
 */
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, intakes, matters, relatedParties } from "@/lib/db/schema";

export type ConflictHit = {
  source: "client" | "related_party" | "matter" | "intake";
  id: string;
  label: string;
  field: string;
  matchedValue: string;
  strength: "exact" | "partial";
  href: string;
};

export type ConflictSearchResult = {
  query: string;
  terms: string[];
  result: "clear" | "conflict" | "possible";
  hits: ConflictHit[];
  disclaimer: string;
};

const DISCLAIMER =
  "Conflict search is an operational helper within this firm only. It is not legal advice and does not replace counsel judgment or a full conflicts review.";

function normalizeTerms(query: string): string[] {
  return query
    .split(/[,;/|\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

function strengthFor(needle: string, haystack: string): "exact" | "partial" {
  const n = needle.trim().toLowerCase();
  const h = haystack.trim().toLowerCase();
  if (!n || !h) return "partial";
  if (h === n) return "exact";
  // Whole-word-ish: same after stripping punctuation
  const strip = (s: string) => s.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  if (strip(h) === strip(n)) return "exact";
  return "partial";
}

function pushHit(
  hits: ConflictHit[],
  hit: ConflictHit,
  seen: Set<string>,
) {
  const key = `${hit.source}:${hit.id}:${hit.field}:${hit.matchedValue}`;
  if (seen.has(key)) return;
  seen.add(key);
  hits.push(hit);
}

export type ConflictCheckNotesV1 = {
  v: 1;
  hitCount: number;
  hits: ConflictHit[];
  disclaimer: string;
  partnerOverride?: {
    reason: string;
    byUserId: string;
    byEmail: string;
    at: string;
  };
};

export function encodeConflictNotes(data: ConflictCheckNotesV1): string {
  return JSON.stringify(data);
}

export function parseConflictNotes(notes: string | null): ConflictCheckNotesV1 | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes) as ConflictCheckNotesV1;
    if (parsed && parsed.v === 1) return parsed;
  } catch {
    /* legacy plain-text notes */
  }
  return null;
}

export async function runConflictSearch(
  firmId: string,
  query: string,
  opts?: { excludeIntakeId?: string },
): Promise<ConflictSearchResult> {
  const terms = normalizeTerms(query);
  if (!terms.length) {
    return {
      query,
      terms: [],
      result: "clear",
      hits: [],
      disclaimer: DISCLAIMER,
    };
  }

  const db = getDb();
  const hits: ConflictHit[] = [];
  const seen = new Set<string>();
  const excludeIntakeId = opts?.excludeIntakeId;

  for (const term of terms) {
    const pattern = `%${term}%`;

    const clientRows = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.firmId, firmId),
          or(
            ilike(clients.fullName, pattern),
            ilike(clients.legalName, pattern),
            ilike(clients.tradingName, pattern),
            ilike(clients.nationalIdOrRegNumber, pattern),
            ilike(clients.email, pattern),
          ),
        ),
      )
      .limit(40);

    for (const c of clientRows) {
      const fields: Array<[string, string | null]> = [
        ["fullName", c.fullName],
        ["legalName", c.legalName],
        ["tradingName", c.tradingName],
        ["nationalIdOrRegNumber", c.nationalIdOrRegNumber],
        ["email", c.email],
      ];
      for (const [field, value] of fields) {
        if (value && value.toLowerCase().includes(term.toLowerCase())) {
          pushHit(
            hits,
            {
              source: "client",
              id: c.id,
              label: c.fullName || c.legalName || c.tradingName || "Client",
              field,
              matchedValue: value,
              strength: strengthFor(term, value),
              href: `/clients/${c.id}`,
            },
            seen,
          );
        }
      }
    }

    const partyRows = await db
      .select()
      .from(relatedParties)
      .where(
        and(
          eq(relatedParties.firmId, firmId),
          or(
            ilike(relatedParties.name, pattern),
            ilike(relatedParties.contact, pattern),
            ilike(relatedParties.notes, pattern),
          ),
        ),
      )
      .limit(40);

    for (const p of partyRows) {
      const fields: Array<[string, string | null]> = [
        ["name", p.name],
        ["contact", p.contact],
        ["notes", p.notes],
      ];
      for (const [field, value] of fields) {
        if (value && value.toLowerCase().includes(term.toLowerCase())) {
          pushHit(
            hits,
            {
              source: "related_party",
              id: p.id,
              label: `${p.name} (${p.partyRole})`,
              field,
              matchedValue: value,
              strength: strengthFor(term, value),
              href: p.matterId ? `/matters/${p.matterId}` : "/matters",
            },
            seen,
          );
        }
      }
    }

    const matterRows = await db
      .select()
      .from(matters)
      .where(
        and(
          eq(matters.firmId, firmId),
          or(
            ilike(matters.title, pattern),
            ilike(matters.description, pattern),
            ilike(matters.caseNumber, pattern),
            ilike(matters.courtName, pattern),
            ilike(matters.fileRef, pattern),
            ilike(matters.matterNumber, pattern),
          ),
        ),
      )
      .limit(40);

    for (const m of matterRows) {
      const fields: Array<[string, string | null]> = [
        ["title", m.title],
        ["description", m.description],
        ["caseNumber", m.caseNumber],
        ["courtName", m.courtName],
        ["fileRef", m.fileRef],
        ["matterNumber", m.matterNumber],
      ];
      for (const [field, value] of fields) {
        if (value && value.toLowerCase().includes(term.toLowerCase())) {
          pushHit(
            hits,
            {
              source: "matter",
              id: m.id,
              label: m.title,
              field,
              matchedValue: value,
              strength: strengthFor(term, value),
              href: `/matters/${m.id}`,
            },
            seen,
          );
        }
      }
    }

    const intakeRows = await db
      .select()
      .from(intakes)
      .where(
        and(
          eq(intakes.firmId, firmId),
          or(
            ilike(intakes.prospectName, pattern),
            ilike(intakes.opposingParty, pattern),
            ilike(intakes.matterSummary, pattern),
          ),
        ),
      )
      .limit(40);

    for (const i of intakeRows) {
      if (excludeIntakeId && i.id === excludeIntakeId) continue;
      const fields: Array<[string, string | null]> = [
        ["prospectName", i.prospectName],
        ["opposingParty", i.opposingParty],
        ["matterSummary", i.matterSummary],
      ];
      for (const [field, value] of fields) {
        if (value && value.toLowerCase().includes(term.toLowerCase())) {
          pushHit(
            hits,
            {
              source: "intake",
              id: i.id,
              label: i.prospectName,
              field,
              matchedValue: value,
              strength: strengthFor(term, value),
              href: `/intake/${i.id}`,
            },
            seen,
          );
        }
      }
    }
  }

  const hasExact = hits.some((h) => h.strength === "exact");
  const result: ConflictSearchResult["result"] = !hits.length
    ? "clear"
    : hasExact
      ? "conflict"
      : "possible";

  // Stable sort: exact first
  hits.sort((a, b) => {
    if (a.strength === b.strength) return a.label.localeCompare(b.label);
    return a.strength === "exact" ? -1 : 1;
  });

  return {
    query,
    terms,
    result,
    hits,
    disclaimer: DISCLAIMER,
  };
}

export function buildIntakeConflictQuery(intake: {
  prospectName: string;
  opposingParty: string | null;
}): string {
  return [intake.prospectName, intake.opposingParty].filter(Boolean).join("; ");
}

export function conflictCheckAllowsConversion(check: {
  result: string;
  notes: string | null;
} | null): { allowed: boolean; reason: string } {
  if (!check || check.result === "not_done") {
    return {
      allowed: false,
      reason: "Run a conflict check before converting this intake.",
    };
  }
  if (check.result === "clear") {
    return { allowed: true, reason: "Conflict check clear." };
  }
  const parsed = parseConflictNotes(check.notes);
  if (
    (check.result === "conflict" || check.result === "possible") &&
    (parsed?.partnerOverride || check.notes?.includes("PARTNER_OVERRIDE:"))
  ) {
    return {
      allowed: true,
      reason: "Managing Partner override recorded on conflict check.",
    };
  }
  return {
    allowed: false,
    reason:
      "Conflict or possible conflict found. A Managing Partner must record an audited override before conversion.",
  };
}
