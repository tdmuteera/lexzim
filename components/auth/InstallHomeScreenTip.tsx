"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "lexzim.homeScreenTip.dismissed";

function detectPlatform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return Boolean(mq || iosStandalone);
}

/**
 * Short tip on how to pin LexZim to the phone home screen (opens the live site).
 */
export function InstallHomeScreenTip() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");

  useEffect(() => {
    try {
      if (isStandaloneDisplay()) return;
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setPlatform(detectPlatform());
      setVisible(true);
    } catch {
      /* ignore storage */
    }
  }, []);

  if (!visible) return null;

  const howTo =
    platform === "ios"
      ? "In Safari: tap Share, then Add to Home Screen. Open the LexZim icon anytime."
      : platform === "android"
        ? "In Chrome: tap the menu (⋮), then Install app or Add to Home screen. Open the LexZim icon anytime."
        : "On your phone browser: use Add to Home Screen / Install app, then open the LexZim icon anytime.";

  return (
    <div
      role="note"
      style={{
        marginTop: "1rem",
        padding: "0.85rem 1rem",
        borderRadius: "8px",
        border: "1px solid rgba(160, 124, 56, 0.35)",
        background: "rgba(160, 124, 56, 0.06)",
        color: "var(--text)",
        fontSize: "0.92rem",
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "var(--gold, #A07C38)" }}>
        Add LexZim to your phone
      </div>
      <p className="muted" style={{ margin: "0 0 0.65rem" }}>
        {howTo} It opens this system in your browser (app-style window).
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* ignore */
          }
          setVisible(false);
        }}
      >
        Got it
      </button>
    </div>
  );
}
