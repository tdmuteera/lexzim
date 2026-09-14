/**
 * Browser session drafts for long forms (client KYC create/edit).
 * Survives refresh and module switches for the signed-in user.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function storageKey(userId: string, draftId: string) {
  return `lexzim:draft:${userId}:${draftId}`;
}

export function useSessionDraft<T>(opts: {
  userId: string | null | undefined;
  draftId: string;
  values: T;
  enabled?: boolean;
  /** Debounce ms before writing. */
  debounceMs?: number;
}) {
  const { userId, draftId, values, enabled = true, debounceMs = 600 } = opts;
  const [restored, setRestored] = useState(false);
  const [draftHint, setDraftHint] = useState<string | null>(null);
  const skipNextWrite = useRef(false);

  const clearDraft = useCallback(() => {
    if (!userId || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey(userId, draftId));
    } catch {
      /* ignore */
    }
    setDraftHint(null);
  }, [userId, draftId]);

  const loadDraft = useCallback((): T | null => {
    if (!userId || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey(userId, draftId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { savedAt?: string; values?: T };
      if (!parsed?.values) return null;
      return parsed.values;
    } catch {
      return null;
    }
  }, [userId, draftId]);

  useEffect(() => {
    if (!enabled || !userId || restored) return;
    const draft = loadDraft();
    setRestored(true);
    if (draft) {
      skipNextWrite.current = true;
      setDraftHint("Restored unsaved work from this browser session.");
    }
  }, [enabled, userId, restored, loadDraft]);

  useEffect(() => {
    if (!enabled || !userId || !restored) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          storageKey(userId, draftId),
          JSON.stringify({ savedAt: new Date().toISOString(), values }),
        );
        setDraftHint("Draft saved on this device.");
      } catch {
        /* quota / private mode */
      }
    }, debounceMs);
    return () => window.clearTimeout(t);
  }, [enabled, userId, draftId, values, restored, debounceMs]);

  return {
    restored,
    draftHint,
    loadDraft,
    clearDraft,
    applyRestored: (apply: (draft: T) => void) => {
      const draft = loadDraft();
      if (draft) {
        skipNextWrite.current = true;
        apply(draft);
        setDraftHint("Restored unsaved work from this browser session.");
      }
      setRestored(true);
    },
  };
}
