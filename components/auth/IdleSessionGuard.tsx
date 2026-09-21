"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  STAFF_ACTIVITY_PING_MIN_MS,
  STAFF_EXPIRED_LOGOUT_REASON,
  STAFF_IDLE_ACTIVITY_THROTTLE_MS,
  STAFF_IDLE_CHECK_INTERVAL_MS,
  STAFF_IDLE_LOGOUT_REASON,
  STAFF_IDLE_TIMEOUT_MS,
} from "@/lib/auth/idle-timeout";
import { useAuthStore } from "@/lib/store";

/**
 * Signs the staff user out after 30 minutes of inactivity (not wall-clock since login).
 * Also heartbeats the server so closed-tab / bookmark return can enforce the same idle.
 * Mount only inside the authenticated app shell.
 */
export function IdleSessionGuard() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const lastActivityRef = useRef(Date.now());
  const lastThrottleRef = useRef(0);
  const lastPingRef = useRef(0);
  const loggingOutRef = useRef(false);

  const markActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastThrottleRef.current < STAFF_IDLE_ACTIVITY_THROTTLE_MS) return;
    lastThrottleRef.current = now;
    lastActivityRef.current = now;

    if (now - lastPingRef.current < STAFF_ACTIVITY_PING_MIN_MS) return;
    lastPingRef.current = now;
    void fetch("/api/auth/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then(async (res) => {
        if (res.status === 401 && !loggingOutRef.current) {
          loggingOutRef.current = true;
          useAuthStore.getState().setSession(null);
          try {
            await refresh();
          } catch {
            /* ignore */
          }
          router.replace(`/login?reason=${STAFF_IDLE_LOGOUT_REASON}`);
          router.refresh();
        }
      })
      .catch(() => undefined);
  }, [refresh, router]);

  const performIdleLogout = useCallback(
    async (reason: typeof STAFF_IDLE_LOGOUT_REASON | typeof STAFF_EXPIRED_LOGOUT_REASON = STAFF_IDLE_LOGOUT_REASON) => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 5000);
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
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
      router.replace(`/login?reason=${reason}`);
      router.refresh();
    },
    [refresh, router],
  );

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    lastPingRef.current = 0;
    loggingOutRef.current = false;
    // Seed server last-seen as soon as the shell mounts with a live user.
    void fetch("/api/auth/activity", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).catch(() => undefined);

    const onActivity = () => markActivity();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current >= STAFF_IDLE_TIMEOUT_MS) {
        void performIdleLogout(STAFF_IDLE_LOGOUT_REASON);
      } else {
        markActivity();
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
        void performIdleLogout(STAFF_IDLE_LOGOUT_REASON);
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
