import "server-only";

import { clientDisplayName } from "@/lib/clients/display";
import { getClientById } from "@/lib/repos/clients";
import { getMatterById } from "@/lib/repos/matters";
import { listPartiesForMatter } from "@/lib/repos/parties";
import {
  applyFieldOverrides,
  emptyMergeFieldMap,
  type MergeFieldMap,
} from "@/lib/templates/merge";
import { AuthError } from "@/lib/auth/types";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Build default merge values from matter + client + firm + opposing party.
 */
export async function buildMatterMergeFields(input: {
  firmId: string;
  matterId: string;
  firmName: string;
  overrides?: Record<string, string> | null;
}): Promise<MergeFieldMap> {
  const matter = await getMatterById(input.firmId, input.matterId);
  if (!matter) {
    throw new AuthError("not_found", "Matter not found.");
  }

  const client = await getClientById(input.firmId, matter.clientId);
  const parties = await listPartiesForMatter(input.firmId, input.matterId);
  const opposing =
    parties.find((p) => p.partyRole === "opposing_party") ??
    parties.find((p) => p.partyRole === "counsel") ??
    null;

  const today = new Date();
  const values = emptyMergeFieldMap();

  values.CLIENT_NAME = client
    ? clientDisplayName(client)
    : matter.clientDisplayName ?? "";
  values.CLIENT_ADDRESS = client?.physicalAddress || client?.postalAddress || "";
  values.OPPOSING_PARTY = opposing?.name ?? "";
  values.COURT_NAME = matter.courtName ?? "";
  values.CASE_NUMBER = matter.caseNumber ?? "";
  values.MATTER_TITLE = matter.title ?? "";
  values.FILE_REF = matter.fileRef || matter.matterNumber || "";
  values.LAWYER_NAME = matter.responsibleLawyerName ?? "";
  values.FIRM_NAME = input.firmName ?? "";
  values.DATE = formatDate(today);
  values.TODAY = formatDate(today);

  return applyFieldOverrides(values, input.overrides);
}
