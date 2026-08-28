import { clientInfo, jsonError, jsonOk } from "@/lib/auth/http";
import { AuthError } from "@/lib/auth/types";
import { requireOpsAccess } from "@/lib/platform/ops-guard";
import {
  CLIENT_PURGE_CONFIRM_PHRASE,
  platformPurgeClient,
  previewClientPurge,
} from "@/lib/privacy/purge-client";

/**
 * Platform-only client purge (test/dummy cleanup).
 * GET ?firmId=&clientId= → dependency preview
 * DELETE body { firmId, clientId, confirmClientNumber, confirmPhrase: "DELETE CLIENT" }
 */
export async function GET(request: Request) {
  try {
    await requireOpsAccess(request);
    const url = new URL(request.url);
    const firmId = url.searchParams.get("firmId")?.trim();
    const clientId = url.searchParams.get("clientId")?.trim();
    if (!firmId || !clientId) {
      throw new AuthError("validation", "firmId and clientId are required.");
    }
    const preview = await previewClientPurge(firmId, clientId);
    return jsonOk({
      preview,
      confirmPhrase: CLIENT_PURGE_CONFIRM_PHRASE,
      note: "Firm Managing Partner product UI cannot call this. Soft-archive retains finance; this wipe removes finance so KPIs drop.",
    });
  } catch (err) {
    return jsonError(err, request);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireOpsAccess(request);
    const body = (await request.json()) as {
      firmId?: string;
      clientId?: string;
      confirmClientNumber?: string;
      confirmPhrase?: string;
    };
    if (
      !body.firmId?.trim() ||
      !body.clientId?.trim() ||
      !body.confirmClientNumber?.trim() ||
      !body.confirmPhrase?.trim()
    ) {
      throw new AuthError(
        "validation",
        `firmId, clientId, confirmClientNumber, and confirmPhrase ("${CLIENT_PURGE_CONFIRM_PHRASE}") are required.`,
      );
    }
    const result = await platformPurgeClient({
      firmId: body.firmId.trim(),
      clientId: body.clientId.trim(),
      confirmClientNumber: body.confirmClientNumber.trim(),
      confirmPhrase: body.confirmPhrase.trim(),
      ipOrUserAgent: clientInfo(request),
    });
    return jsonOk({ purged: true, ...result });
  } catch (err) {
    return jsonError(err, request);
  }
}
