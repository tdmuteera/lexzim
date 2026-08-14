"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

const VARIANTS = ["rise", "slide", "scale", "blur", "sweep"] as const;

function variantFor(path: string): (typeof VARIANTS)[number] {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) {
    hash = (hash * 33 + path.charCodeAt(i)) >>> 0;
  }
  return VARIANTS[hash % VARIANTS.length];
}

/**
 * Plays a distinct enter animation whenever the user changes module or tab.
 * The variant is stable per path so each area of the app has its own feel.
 */
export function PageMotion({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const variant = variantFor(pathname);

  return (
    <div
      key={pathname}
      className={`page-motion page-motion-${variant}`}
      data-motion={variant}
    >
      <span className="page-motion-accent" aria-hidden />
      {children}
    </div>
  );
}
