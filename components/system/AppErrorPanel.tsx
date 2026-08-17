"use client";

import { useEffect, useState } from "react";
import {
  ensureRequestId,
  reportClientDiagnostic,
} from "@/lib/diagnostics/client";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Optional heading override for ops vs staff shells. */
  title?: string;
};

/**
 * Shared React error boundary UI (P8-09).
 * Safe message only. Shows requestId when present. No component stack in production.
 */
export function AppErrorPanel({
  error,
  reset,
  title = "Something went wrong",
}: Props) {
  const [requestId, setRequestId] = useState<string | null>(null);
  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    const id = ensureRequestId();
    setRequestId(id);
    reportClientDiagnostic({
      message: error.message || title,
      level: "error",
      errorCode: "frontend.error_boundary",
      requestId: id,
    });
    console.error(error);
  }, [error, title]);

  return (
    <section className="view active scrollable" aria-label="Error">
      <div className="panel">
        <div className="panel-head">
          <h3>{title}</h3>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginBottom: "0.75rem" }}>
            This page could not load. Try again. If it keeps failing, give your administrator the
            reference below.
          </p>
          {requestId ? (
            <p
              className="muted"
              style={{
                marginBottom: "1rem",
                fontFamily: "ui-monospace, Cascadia Code, Consolas, monospace",
                fontSize: "0.82rem",
                wordBreak: "break-all",
              }}
            >
              Reference: {requestId}
            </p>
          ) : null}
          {isDev && error.message ? (
            <p
              style={{
                marginBottom: "1rem",
                fontSize: "0.82rem",
                color: "var(--danger)",
              }}
            >
              {error.message}
            </p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={reset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
