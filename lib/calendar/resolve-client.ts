import "server-only";

import { AuthError } from "@/lib/auth/types";
import type { CalendarEventInput } from "@/lib/calendar/validation";
import { getClientById } from "@/lib/repos/clients";
import { getMatterById } from "@/lib/repos/matters";

/** Resolve client from matter and validate links before save. */
export async function resolveCalendarClientId(
  firmId: string,
  input: CalendarEventInput,
): Promise<CalendarEventInput> {
  let clientId = input.clientId;

  if (input.matterId) {
    const matter = await getMatterById(firmId, input.matterId);
    if (!matter) {
      throw new AuthError("validation", "Matter not found for this firm.");
    }
    if (clientId && matter.clientId && clientId !== matter.clientId) {
      throw new AuthError("validation", "Client does not match the selected matter.");
    }
    if (!clientId && matter.clientId) {
      clientId = matter.clientId;
    }
  }

  if (clientId) {
    const client = await getClientById(firmId, clientId);
    if (!client) {
      throw new AuthError("validation", "Client not found for this firm.");
    }
  }

  return { ...input, clientId };
}
