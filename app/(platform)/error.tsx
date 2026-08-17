"use client";

import { useEffect } from "react";
import { AppErrorPanel } from "@/components/system/AppErrorPanel";
import { DbUnavailableView } from "@/components/system/DbUnavailableView";

const DB_HINTS = [
  "database_unavailable",
  "Cannot reach Supabase Postgres",
  "Database marked unreachable",
  "CONNECT_TIMEOUT",
  "CONNECTION_DESTROYED",
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

  return <AppErrorPanel error={error} reset={reset} />;
}
