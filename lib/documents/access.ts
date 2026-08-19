import { AuthError } from "@/lib/auth/types";
import { getDocumentById } from "@/lib/repos/documents";
import { userCanAccessMatter } from "@/lib/repos/matters";

export async function loadAccessibleDocument(
  firmId: string,
  documentId: string,
  userId: string,
  viewAll: boolean,
) {
  const row = await getDocumentById(firmId, documentId);
  if (!row) {
    throw new AuthError("not_found", "Document not found.");
  }
  if (!row.matterId) {
    return row;
  }
  const allowed = await userCanAccessMatter(firmId, row.matterId, userId, viewAll);
  if (!allowed) {
    throw new AuthError("forbidden", "You do not have access to this matter.");
  }
  return row;
}
