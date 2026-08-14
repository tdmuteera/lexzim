"use client";

import { useEffect } from "react";
import { DbUnavailableView } from "@/components/system/DbUnavailableView";

const DB_HINTS = [
  "database_unavailable",
  "Cannot reach Supabase Postgres",
  "Database marked unreachable",
  "CONNECT_TIMEOUT",
  "CONNECTION_DESTROYED",
  "Failed query",
];

export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const looksLikeDbOutage = DB_HINTS.some((hint) => error.message?.includes(hint));

  if (looksLikeDbOutage) {
    return <DbUnavailableView detail={error.message} retryHref="/dashboard?db_retry=1" />;
  }

  return (
    <section className="view active scrollable" aria-label="Error">
      <div className="panel">
        <div className="panel-head">
          <h3>Something went wrong</h3>
        </div>
        <div className="panel-body">
          <p className="muted" style={{ marginBottom: "1rem" }}>
            This page could not load. Try again, and if it keeps failing check the database
            status at <code>/api/db-status</code>.
          </p>
          <button type="button" className="btn btn-outline btn-sm" onClick={reset}>
            Try again
          </button>
        </div>
      </div>
    </section>
  );
}
