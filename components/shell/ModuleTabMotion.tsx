"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { pageTransitionClass } from "@/lib/motion/page-transitions";

/** PowerPoint-style enter when finance, HR, or other tabbed routes change. */
export function ModuleTabMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={`enter-motion ${pageTransitionClass(pathname)}`}>
      {children}
    </div>
  );
}
