"use client";

import { useEffect, useState } from "react";
import { notifyAuthSplashDone } from "@/lib/auth/did-you-know";
import { PLATFORM_PRODUCT_NAME } from "@/lib/firm/branding";

const SPLASH_MS = 3000;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Full-screen LexZim Legal Practice intro on every visit to login or setup.
 */
export function LoginSplash() {
  const [off, setOff] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOff(true);
      notifyAuthSplashDone();
      return;
    }
    const t = window.setTimeout(() => {
      setOff(true);
      notifyAuthSplashDone();
    }, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (off) return null;

  return (
    <div className="login-splash" role="status" aria-live="polite">
      <div className="login-splash-inner">
        <p className="login-splash-title">
          <span className="login-splash-brand">{PLATFORM_PRODUCT_NAME}</span>
          <span className="login-splash-practice">Legal Practice</span>
        </p>
      </div>
    </div>
  );
}
