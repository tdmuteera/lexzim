"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  STAFF_IDLE_ACTIVITY_THROTTLE_MS,
  STAFF_IDLE_CHECK_INTERVAL_MS,
  STAFF_IDLE_LOGOUT_REASON,
  STAFF_IDLE_TIMEOUT_MS,
} from "@/lib/auth/idle-timeout";
import { useAuthStore } from "@/lib/store";

/**
 * Signs the staff user out after 30 minutes of inactivity (not wall-clock since login).
 * Mount only inside the authenticated app shell.
 */
export function IdleSessionGuard() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const lastThrottleRef = useRef(0);
  const loggingOutRef = useRef(false);

  const markActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current < STAFF_IDLE_ACTIVITY_THROTTLE_MS) return;
    lastThrottleRef.current = now;
    lastActivityRef.current = now;
  }, []);

  const performIdleLogout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: STAFF_IDLE_LOGOUT_REASON }),
        signal: ctrl.signal,
      });
    } catch {
      /* still clear client session */
    } finally {
      window.clearTimeout(timer);
    }
    useAuthStore.getState().setSession(null);
    try {
      await refresh();
    } catch {
      /* ignore */
    }
    router.replace(`/login?reason=${STAFF_IDLE_LOGOUT_REASON}`);
    router.refresh();
  }, [refresh, router]);

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    loggingOutRef.current = false;

    const onActivity = () => markActivity();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= STAFF_IDLE_TIMEOUT_MS) {
        void performIdleLogout();
      }
    };
    const events: Array<keyof WindowEventMap> = [
      "mousedown",
      "mousemove",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
      "pointerdown",
    ];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);

    const tick = window.setInterval(() => {
      if (loggingOutRef.current) return;
      if (Date.now() - lastActivityRef.current >= STAFF_IDLE_TIMEOUT_MS) {
        void performIdleLogout();
      }
    }, STAFF_IDLE_CHECK_INTERVAL_MS);

    return () => {
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(tick);
    };
  }, [user, markActivity, performIdleLogout]);

  return null;
}
