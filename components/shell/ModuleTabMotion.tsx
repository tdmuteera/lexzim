"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Fade and slight rise when finance, HR, or other tabbed routes change. */
export function ModuleTabMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="enter-motion">
      {children}
    </div>
  );
}
