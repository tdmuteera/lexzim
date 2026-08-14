/** Client display helpers (P1-02, P7-04 KYC names). */

import { clientTypeLabel, normalizeClientType } from "@/lib/clients/kyc-types";

export function clientDisplayName(client: {
  clientType: string;
  fullName?: string | null;
  firstName?: string | null;
  surname?: string | null;
  otherNames?: string | null;
  legalName?: string | null;
  registeredName?: string | null;
  tradingName?: string | null;
}): string {
  const type = normalizeClientType(client.clientType);
  if (type === "individual") {
    const parts = [client.firstName, client.surname, client.otherNames].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return client.fullName || "Unnamed client";
  }
  return (
    client.tradingName ||
    client.registeredName ||
    client.legalName ||
    client.fullName ||
    `Unnamed ${clientTypeLabel(type).toLowerCase()}`
  );
}

/** CL number prefix for lists and finance screens */
export function clientDisplayLabel(client: {
  clientNumber?: string | null;
  clientType: string;
  fullName?: string | null;
  firstName?: string | null;
  surname?: string | null;
  otherNames?: string | null;
  legalName?: string | null;
  registeredName?: string | null;
  tradingName?: string | null;
}): string {
  const name = clientDisplayName(client);
  if (client.clientNumber) {
    return `${client.clientNumber} · ${name}`;
  }
  return name;
}
