"use client";

import { AppErrorPanel } from "@/components/system/AppErrorPanel";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AppErrorPanel error={error} reset={reset} />;
}
