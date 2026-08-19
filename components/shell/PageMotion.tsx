"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { pageTransitionClass } from "@/lib/motion/page-transitions";

function moduleKey(path: string): string {
  const part = path.split("/").filter(Boolean)[0];
  return part ?? "home";
}

/**
 * PowerPoint-style enter when switching Practice / Finance / HR / System modules.
 * Finance and HR tab bodies use ModuleTabMotion so the tab bar stays put.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      key={moduleKey(pathname)}
      className={`page-motion ${pageTransitionClass(pathname)}`}
    >
      {children}
    </div>
  );
}
