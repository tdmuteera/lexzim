/** Client display helpers (P1-02). */

export function clientDisplayName(client: {
  clientType: string;
  fullName: string | null;
  legalName: string | null;
  tradingName: string | null;
}): string {
  if (client.clientType === "company") {
    return client.tradingName || client.legalName || "Unnamed company";
  }
  return client.fullName || "Unnamed client";
}
