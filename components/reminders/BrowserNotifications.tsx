"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ReminderItem, RemindersPayload } from "@/components/reminders/RemindersCenter";

const SEEN_KEY = "lexzim_reminder_seen_ids";
const POLL_MS = 90_000;

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  const trimmed = [...ids].slice(-200);
  localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
}

/**
 * While LexZim is open: poll reminders and fire browser Notification for new overdue items
 * when the firm setting is on and the user granted permission. No push / SMTP.
 */
export function BrowserNotifications() {
  const { can, isLoading } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);

  const tick = useCallback(async () => {
    if (!can("calendar.view")) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    try {
      const res = await fetch("/api/reminders", { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: RemindersPayload;
      };
      if (!res.ok || !body.ok || !body.data) return;

      if (!body.data.settings?.browserNotificationsEnabled) return;
      if (Notification.permission !== "granted") return;

      if (!readyRef.current) {
        seenRef.current = loadSeen();
        for (const item of body.data.overdue) seenRef.current.add(item.id);
        saveSeen(seenRef.current);
        readyRef.current = true;
        return;
      }

      const fresh: ReminderItem[] = [];
      for (const item of body.data.overdue) {
        if (!seenRef.current.has(item.id)) {
          fresh.push(item);
          seenRef.current.add(item.id);
        }
      }
      if (fresh.length) {
        saveSeen(seenRef.current);
        const first = fresh[0]!;
        const n = new Notification(
          fresh.length === 1 ? first.title : `${fresh.length} overdue items`,
          {
            body:
              fresh.length === 1
                ? first.matterTitle
                  ? `${first.matterTitle} · LexZim`
                  : "LexZim reminder"
                : fresh
                    .slice(0, 3)
                    .map((f) => f.title)
                    .join(", "),
            tag: "lexzim-overdue",
          },
        );
        n.onclick = () => {
          window.focus();
          window.location.href = "/reminders";
        };
      }
    } catch {
      /* ignore poll errors */
    }
  }, [can]);

  useEffect(() => {
    if (isLoading) return;
    if (!can("calendar.view")) return;
    seenRef.current = loadSeen();
    void tick();
    const id = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(id);
  }, [can, isLoading, tick]);

  return null;
}
