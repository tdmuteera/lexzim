import { NextRequest, NextResponse } from "next/server";
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
} from "@/lib/diagnostics/request-id";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 proxy (replaces middleware.ts).
 * Refresh Supabase session cookies, and stamp X-Request-Id on /api/* (P8-03).
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApi = pathname.startsWith("/api/");
  const requestId = isApi
    ? resolveRequestId(
        request.headers.get(REQUEST_ID_HEADER) ??
          request.headers.get("X-Request-Id"),
      )
    : null;

  let requestForSession = request;
  if (requestId) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    requestForSession = new NextRequest(request.url, {
      headers: requestHeaders,
      method: request.method,
    });
  }

  const response = await updateSession(requestForSession);
  if (requestId) {
    response.headers.set("X-Request-Id", requestId);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and image optimizer.
     * Keep /api included so auth cookies refresh on API calls too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
