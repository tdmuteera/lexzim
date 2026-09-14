import { AuthError } from "@/lib/auth/types";
import { userCanAccessClient } from "@/lib/repos/clients";
import { getDocumentById } from "@/lib/repos/documents";
import { userCanAccessMatter } from "@/lib/repos/matters";

export async function loadAccessibleDocument(
  firmId: string,
  documentId: string,
  userId: string,
  opts: { viewAllMatters: boolean; viewAllClients: boolean },
) {
  const row = await getDocumentById(firmId, documentId);
  if (!row) {
    throw new AuthError("not_found", "Document not found.");
  }

  if (row.matterId) {
    const allowed = await userCanAccessMatter(
      firmId,
      row.matterId,
      userId,
      opts.viewAllMatters,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this matter.");
    }
    return row;
  }

  if (row.clientId) {
    const allowed = await userCanAccessClient(
      firmId,
      row.clientId,
      userId,
      opts.viewAllClients,
    );
    if (!allowed) {
      throw new AuthError("forbidden", "You do not have access to this client.");
    }
    return row;
  }

  if (!opts.viewAllClients && !opts.viewAllMatters) {
    throw new AuthError("forbidden", "You do not have access to this document.");
  }
  return row;
}
