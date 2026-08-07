import { AuthError } from "@/lib/auth/types";

export const PARTY_ROLES = [
  "opposing_party",
  "spouse",
  "witness",
  "counsel",
  "expert",
  "guardian",
  "beneficiary",
  "co_accused",
  "other",
] as const;

export type PartyRole = (typeof PARTY_ROLES)[number];

export type PartyInput = {
  partyRole: PartyRole;
  name: string;
  contact?: string | null;
  notes?: string | null;
  clientId?: string | null;
  matterId?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function requireString(value: unknown, label: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) throw new AuthError("validation", `${label} is required.`);
  return trimmed;
}

export function parsePartyInput(
  body: unknown,
  opts?: { requireMatterOrClient?: boolean },
): PartyInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid related party payload.");
  }
  const raw = body as Record<string, unknown>;
  const partyRole = raw.partyRole;
  if (!PARTY_ROLES.includes(partyRole as PartyRole)) {
    throw new AuthError("validation", "Invalid party role.");
  }

  const clientId = trimOrNull(raw.clientId);
  const matterId = trimOrNull(raw.matterId);

  if (opts?.requireMatterOrClient && !clientId && !matterId) {
    throw new AuthError("validation", "Client or matter is required.");
  }

  return {
    partyRole: partyRole as PartyRole,
    name: requireString(raw.name, "Name"),
    contact: trimOrNull(raw.contact),
    notes: trimOrNull(raw.notes),
    clientId,
    matterId,
  };
}

export function partyRoleLabel(role: string): string {
  switch (role) {
    case "opposing_party":
      return "Opposing party";
    case "spouse":
      return "Spouse";
    case "witness":
      return "Witness";
    case "counsel":
      return "Counsel";
    case "expert":
      return "Expert";
    case "guardian":
      return "Guardian";
    case "beneficiary":
      return "Beneficiary";
    case "co_accused":
      return "Co-accused";
    case "other":
      return "Other";
    default:
      return role;
  }
}
