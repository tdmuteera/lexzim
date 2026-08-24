/**
 * Browser diagnostics helpers (P8-09).
 * Correlate client failures onto the same requestId timeline.
 * No marketing analytics. Never send cookies, tokens, or form bodies.
 */

import {
  isSaneRequestId,
  mintRequestId,
  REQUEST_ID_HEADER,
} from "@/lib/diagnostics/request-id";

const STORAGE_KEY = "lexzim.requestId";
const CLIENT_EVENT_PATH = "/api/diagnostics/client-event";

export type ApiErrorBody = {
  ok?: boolean;
  requestId?: string;
  module?: string;
  error?: { code?: string; message?: string; requestId?: string; module?: string };
  data?: unknown;
};

export type DiagnosticJsonResult<T = unknown> = {
  ok: boolean;
  status: number;
  requestId: string | null;
  module?: string;
  data?: T;
  error?: { code?: string; message: string; requestId?: string };
  response: Response;
  body: ApiErrorBody | null;
};

function canUseSessionStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

/** Mint or reuse a correlation id stored in sessionStorage. */
export function ensureRequestId(): string {
  if (canUseSessionStorage()) {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (isSaneRequestId(existing)) return existing;
  }
  const id = mintRequestId();
  rememberRequestId(id);
  return id;
}

export function readStoredRequestId(): string | null {
  if (!canUseSessionStorage()) return null;
  const existing = sessionStorage.getItem(STORAGE_KEY);
  return isSaneRequestId(existing) ? existing : null;
}

export function rememberRequestId(value: string | null | undefined): void {
  if (!isSaneRequestId(value) || !canUseSessionStorage()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode / quota */
  }
}

export function requestIdFromResponse(
  response: Response,
  body?: ApiErrorBody | null,
): string | null {
  const fromBody =
    body?.error?.requestId ?? body?.requestId ?? null;
  if (isSaneRequestId(fromBody)) return fromBody;
  const header =
    response.headers.get("X-Request-Id") ?? response.headers.get(REQUEST_ID_HEADER);
  if (isSaneRequestId(header)) return header;
  return null;
}

/** Safe banner / toast copy. Never includes stacks or secrets. */
export function errorMessageWithRef(
  message: string,
  requestId?: string | null,
): string {
  const base = (message || "Something went wrong.").trim();
  if (!isSaneRequestId(requestId)) return base;
  if (base.includes(requestId)) return base;
  return `${base} (Reference: ${requestId})`;
}

/**
 * Fetch helper: sends X-Request-Id, reads it back, updates sessionStorage.
 * Drop-in for authenticated staff fetches.
 */
export async function diagnosticFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const requestId = ensureRequestId();
  const headers = new Headers(init?.headers);
  if (!headers.has(REQUEST_ID_HEADER) && !headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", requestId);
  }
  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init?.credentials ?? "include",
  });
  const echoed =
    response.headers.get("X-Request-Id") ?? response.headers.get(REQUEST_ID_HEADER);
  if (isSaneRequestId(echoed)) rememberRequestId(echoed);
  return response;
}

/** Parse JSON envelope and surface requestId for banners. */
export async function diagnosticJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<DiagnosticJsonResult<T>> {
  const response = await diagnosticFetch(input, init);
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const requestId = requestIdFromResponse(response, body);
  if (requestId) rememberRequestId(requestId);

  const ok = Boolean(response.ok && body?.ok !== false && !body?.error);
  if (!ok) {
    return {
      ok: false,
      status: response.status,
      requestId,
      module: body?.error?.module ?? body?.module,
      error: {
        code: body?.error?.code,
        message: body?.error?.message ?? `Request failed (${response.status}).`,
        requestId: requestId ?? undefined,
      },
      response,
      body,
    };
  }

  return {
    ok: true,
    status: response.status,
    requestId,
    module: body?.module,
    data: body?.data as T,
    response,
    body,
  };
}

export type ClientDiagnosticPayload = {
  message: string;
  level?: "error" | "warn" | "info";
  errorCode?: string;
  module?: string;
  pagePath?: string;
  requestId?: string;
  /** React error digest from error boundary (safe, non-sensitive). */
  digest?: string | null;
};

let lastReportKey = "";
let lastReportAt = 0;

function pagePathNow(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

/** Fire-and-forget browser signal. Never throws to the caller. */
export function reportClientDiagnostic(input: ClientDiagnosticPayload): void {
  if (typeof window === "undefined") return;
  try {
    const message = String(input.message || "Browser error").slice(0, 400);
    const requestId = isSaneRequestId(input.requestId)
      ? input.requestId
      : ensureRequestId();
    rememberRequestId(requestId);

    const key = `${input.errorCode ?? ""}:${message.slice(0, 80)}`;
    const now = Date.now();
    if (key === lastReportKey && now - lastReportAt < 4000) return;
    lastReportKey = key;
    lastReportAt = now;

    const body = JSON.stringify({
      requestId,
      message,
      level: input.level ?? "error",
      errorCode: input.errorCode ?? "frontend.error",
      module: input.module,
      pagePath: input.pagePath ?? pagePathNow(),
      digest:
        typeof input.digest === "string" && input.digest.trim()
          ? input.digest.trim().slice(0, 128)
          : undefined,
    });

    void fetch(CLIENT_EVENT_PATH, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* never break the page */
  }
}

let listenersInstalled = false;

/**
 * window error + unhandledrejection → client-event API.
 * Call once from AuthProvider / AppShell. Returns dispose.
 */
export function installFrontendDiagnostics(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (listenersInstalled) return () => undefined;
  listenersInstalled = true;

  const onError = (event: ErrorEvent) => {
    const msg = event.message || event.error?.message || "window.error";
    reportClientDiagnostic({
      message: String(msg).slice(0, 400),
      level: "error",
      errorCode: "frontend.window_error",
    });
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "unhandledrejection";
    reportClientDiagnostic({
      message: String(msg).slice(0, 400),
      level: "error",
      errorCode: "frontend.unhandledrejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    listenersInstalled = false;
  };
}
