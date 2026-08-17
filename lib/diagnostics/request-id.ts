/**
 * Correlation IDs for Phase 8 diagnostics (P8-03).
 * Safe tokens only: UUID or similar. Never log cookies or Authorization.
 * Overlay only (plain data) so middleware can import this file.
 */

import { moduleFromPath } from "@/lib/diagnostics/registry.overlay";

export const REQUEST_ID_HEADER = "x-request-id";

const MAX_LEN = 64;
const SANE_RE = /^[A-Za-z0-9_-]+$/;

export function isSaneRequestId(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_LEN && SANE_RE.test(trimmed);
}

export function mintRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Prefer a client/middleware-supplied id when it is a sane token; otherwise mint.
 */
export function resolveRequestId(incoming: string | null | undefined): string {
  const trimmed = incoming?.trim() ?? "";
  if (isSaneRequestId(trimmed)) return trimmed;
  return mintRequestId();
}

export function requestIdFromRequest(request: Request | null | undefined): string {
  if (!request) return mintRequestId();
  return resolveRequestId(
    request.headers.get(REQUEST_ID_HEADER) ?? request.headers.get("X-Request-Id"),
  );
}

export function applyRequestIdHeader(response: Response, requestId: string): Response {
  response.headers.set("X-Request-Id", requestId);
  return response;
}

/** Module code from API or page path (overlay prefixes, longest first). */
export function inferModuleFromRequest(request: Request | null | undefined): string | undefined {
  if (!request) return undefined;
  let pathname = "";
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return undefined;
  }
  return moduleFromPath(pathname);
}
