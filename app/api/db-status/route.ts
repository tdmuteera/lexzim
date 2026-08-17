import { NextResponse } from "next/server";
import { applyRequestIdHeader, requestIdFromRequest } from "@/lib/diagnostics/request-id";
import { getDbStatus } from "@/lib/diagnostics/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/db-status — connection + migration readiness smoke check.
 * Does not expose connection strings or passwords.
 */
export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  const result = await getDbStatus();
  return applyRequestIdHeader(
    NextResponse.json(
      { ...result.body, requestId },
      {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      },
    ),
    requestId,
  );
}
