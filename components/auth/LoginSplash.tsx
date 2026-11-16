"use client";

import { useEffect } from "react";
import { notifyAuthSplashDone } from "@/lib/auth/did-you-know";

/**
 * Splash intro disabled for a calm UI. Notifies auth flow immediately.
 */
export function LoginSplash() {
  useEffect(() => {
    notifyAuthSplashDone();
  }, []);

  return null;
}
