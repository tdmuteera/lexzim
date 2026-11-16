"use client";

import type { ReactNode } from "react";

/** Pass-through shell wrapper. Page enter motion is disabled for a calm UI. */
export function PageMotion({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
