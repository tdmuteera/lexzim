"use client";

import { useEffect, useState } from "react";
import {
  AUTH_SPLASH_STORAGE_KEY,
  notifyAuthSplashDone,
} from "@/lib/auth/did-you-know";
import { PLATFORM_PRODUCT_NAME } from "@/lib/firm/branding";

const SPLASH_MS = 1100;
const REVISIT_FADE_MS = 280;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Full-screen LexZim flash on first login/setup visit in this tab (P9-01).
 * Later visits in the same tab get a short fade or are skipped.
 */
export function LoginSplash() {
  const [phase, setPhase] = useState<"pending" | "full" | "short" | "off">("pending");

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase("off");
      notifyAuthSplashDone();
      return;
    }

    let played = false;
    try {
      played = sessionStorage.getItem(AUTH_SPLASH_STORAGE_KEY) === "1";
    } catch {
      played = false;
    }

    if (played) {
      setPhase("short");
      const t = window.setTimeout(() => {
        setPhase("off");
        notifyAuthSplashDone();
      }, REVISIT_FADE_MS);
      return () => window.clearTimeout(t);
    }

    try {
      sessionStorage.setItem(AUTH_SPLASH_STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setPhase("full");
    const t = window.setTimeout(() => {
      setPhase("off");
      notifyAuthSplashDone();
    }, SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (phase === "pending" || phase === "off") return null;

  return (
    <div
      className={["login-splash", phase === "short" ? "login-splash-short" : ""].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
      aria-label={`${PLATFORM_PRODUCT_NAME} Legal Practice`}
    >
      <div className="login-splash-inner">
        <span className="login-splash-mark">LZ</span>
        <p className="login-splash-title">
          {PLATFORM_PRODUCT_NAME} <span>Legal Practice</span>
        </p>
      </div>
    </div>
  );
}
