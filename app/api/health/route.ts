import { NextResponse } from "next/server";
import { applyRequestIdHeader, requestIdFromRequest } from "@/lib/diagnostics/request-id";
import { getFastHealth } from "@/lib/diagnostics/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — Railway healthcheck + local readiness.
 * Cheap: env flags + in-process circuit. No DB ping.
 */
export async function GET(request: Request) {
  const requestId = requestIdFromRequest(request);
  const body = { ...getFastHealth(), requestId };

  return applyRequestIdHeader(
    NextResponse.json(body, {
      status: body.ok ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }),
    requestId,
  );
}
