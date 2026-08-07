import { AuthError } from "@/lib/auth/types";
import type { ClientType } from "@/lib/db/mvp-types";

export type ClientInput = {
  clientType: ClientType;
  fullName?: string | null;
  legalName?: string | null;
  tradingName?: string | null;
  nationalIdOrRegNumber?: string | null;
  taxNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  altPhone?: string | null;
  physicalAddress?: string | null;
  postalAddress?: string | null;
  kycNotes?: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseClientInput(body: unknown): ClientInput {
  if (!body || typeof body !== "object") {
    throw new AuthError("validation", "Invalid client payload.");
  }
  const raw = body as Record<string, unknown>;
  const clientType = raw.clientType;
  if (clientType !== "individual" && clientType !== "company") {
    throw new AuthError("validation", "Client type must be individual or company.");
  }

  const input: ClientInput = {
    clientType,
    fullName: trimOrNull(raw.fullName),
    legalName: trimOrNull(raw.legalName),
    tradingName: trimOrNull(raw.tradingName),
    nationalIdOrRegNumber: trimOrNull(raw.nationalIdOrRegNumber),
    taxNumber: trimOrNull(raw.taxNumber),
    email: trimOrNull(raw.email),
    phone: trimOrNull(raw.phone),
    altPhone: trimOrNull(raw.altPhone),
    physicalAddress: trimOrNull(raw.physicalAddress),
    postalAddress: trimOrNull(raw.postalAddress),
    kycNotes: trimOrNull(raw.kycNotes),
  };

  validateClientInput(input);
  return input;
}

export function validateClientInput(input: ClientInput): void {
  if (input.clientType === "individual" && !input.fullName) {
    throw new AuthError("validation", "Full name is required for individual clients.");
  }
  if (input.clientType === "company" && !input.legalName) {
    throw new AuthError("validation", "Legal name is required for company clients.");
  }
  if (input.email && !isValidEmail(input.email)) {
    throw new AuthError("validation", "Email address is invalid.");
  }
}
