"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

function moduleKey(path: string): string {
  const part = path.split("/").filter(Boolean)[0];
  return part ?? "home";
}

/**
 * Short fade and rise when switching Practice / Finance / HR / System modules.
 * In-module tabs (finance, HR) animate via ModuleTabMotion so the tab bar stays put.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={moduleKey(pathname)} className="page-motion page-motion-rise">
      {children}
    </div>
  );
}
