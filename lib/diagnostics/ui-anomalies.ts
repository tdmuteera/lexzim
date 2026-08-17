/**
 * Known layout anomaly detectors only (P8-10).
 * Not a general visual QA bot. Diagnostics only: no automatic CSS edits.
 */

import { reportClientDiagnostic } from "@/lib/diagnostics/client";
import { moduleFromPath } from "@/lib/diagnostics/registry.overlay";

export type UiAnomalyCode =
  | "ui.overflow_clip"
  | "ui.chart_label_hidden"
  | "ui.controlled_input";

export type UiAnomalyScope = "dashboard" | "finance" | "reports";

export type UiAnomalyFinding = {
  code: UiAnomalyCode;
  module: string;
  message: string;
  selector?: string;
};

const SESSION_PREFIX = "lexzim.uiAnomaly:";
const CONTRAST_DELTA = 40;
const OVERFLOW_SLACK_PX = 12;

/** React uncontrolled→controlled warning (ClientMatterPicker class of bug). */
export const CONTROLLED_INPUT_RE =
  /A component is changing (an uncontrolled|a controlled) input|uncontrolled input to be controlled|controlled input to be uncontrolled/i;

export function isOverflowClipMetric(input: {
  clientHeight: number;
  scrollHeight: number;
  overflowY: string;
  overflow: string;
}): boolean {
  const oy = input.overflowY || input.overflow;
  if (oy !== "hidden" && oy !== "clip") return false;
  return input.scrollHeight > input.clientHeight + OVERFLOW_SLACK_PX;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function parseCssRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const c = color.trim().toLowerCase();
  if (!c || c === "transparent" || c === "inherit" || c === "currentcolor") return null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    const n = parseInt(h.slice(0, 6), 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(c);
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] == null ? 1 : Number(m[4]),
  };
}

/** True when fg/bg are too close (low delta-L* proxy) or fg is nearly transparent. */
export function colorsTooClose(
  fg: string,
  bg: string,
  minDelta = CONTRAST_DELTA,
): boolean {
  const f = parseCssRgb(fg);
  const b = parseCssRgb(bg);
  if (!f || !b) return false;
  if (f.a < 0.2) return true;
  const lf = relativeLuminance(f.r, f.g, f.b) * 100;
  const lb = relativeLuminance(b.r, b.g, b.b) * 100;
  return Math.abs(lf - lb) < minDelta / 4;
}

export function isRectOffCanvas(
  rect: { top: number; left: number; bottom: number; right: number; width: number; height: number },
  viewport: { width: number; height: number },
): boolean {
  if (rect.width < 1 || rect.height < 1) return true;
  return (
    rect.bottom < 0 ||
    rect.right < 0 ||
    rect.top > viewport.height ||
    rect.left > viewport.width
  );
}

function sessionKey(pagePath: string, code: UiAnomalyCode): string {
  return `${SESSION_PREFIX}${pagePath}:${code}`;
}

function alreadyEmitted(pagePath: string, code: UiAnomalyCode): boolean {
  try {
    return sessionStorage.getItem(sessionKey(pagePath, code)) === "1";
  } catch {
    return false;
  }
}

function markEmitted(pagePath: string, code: UiAnomalyCode): void {
  try {
    sessionStorage.setItem(sessionKey(pagePath, code), "1");
  } catch {
    /* ignore */
  }
}

function emitFinding(finding: UiAnomalyFinding, pagePath: string): void {
  if (alreadyEmitted(pagePath, finding.code)) return;
  markEmitted(pagePath, finding.code);
  reportClientDiagnostic({
    level: "warn",
    errorCode: finding.code,
    module: finding.module,
    pagePath,
    message: finding.message.slice(0, 400),
  });
}

function moduleForScope(scope: UiAnomalyScope, pagePath: string): string {
  const fromPath = moduleFromPath(pagePath);
  if (fromPath) return fromPath;
  if (scope === "dashboard") return "dashboard";
  if (scope === "reports") return "reports";
  return "finance.invoicing";
}

function opaqueBackground(el: Element): string {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    const parsed = parseCssRgb(bg);
    if (parsed && parsed.a >= 0.85) return bg;
    node = node.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || "rgb(255, 255, 255)";
}

function scanOverflowClip(scope: UiAnomalyScope, pagePath: string): UiAnomalyFinding[] {
  const moduleCode = moduleForScope(scope, pagePath);
  const selectors =
    scope === "dashboard"
      ? [".dash-kpi-row", ".dash-body", ".dash-charts", ".stats-grid.dash-kpi-row"]
      : scope === "finance"
        ? [
            ".finance-desk-view",
            ".finance-desk-view > .panel",
            ".finance-desk-view .panel-body",
            ".module-with-tabs",
            ".module-with-tabs .panel-body",
          ]
        : [".view.scrollable", ".panel-body", ".reports-view", ".content .panel"];

  const out: UiAnomalyFinding[] = [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const style = getComputedStyle(node);
      if (
        !isOverflowClipMetric({
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
          overflowY: style.overflowY,
          overflow: style.overflow,
        })
      ) {
        return;
      }
      out.push({
        code: "ui.overflow_clip",
        module: moduleCode,
        selector: sel,
        message: `Overflow clip: ${sel} scrollHeight ${node.scrollHeight}px > clientHeight ${node.clientHeight}px with overflow hidden.`,
      });
    });
    if (out.length) break;
  }
  return out;
}

function scanChartLabels(scope: UiAnomalyScope, pagePath: string): UiAnomalyFinding[] {
  if (scope !== "dashboard" && scope !== "reports") return [];
  const moduleCode = moduleForScope(scope, pagePath);
  const labels = document.querySelectorAll(".dash-bar-value, .dash-bar-label");
  if (labels.length === 0) return [];

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  for (const node of labels) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.15) {
      return [
        {
          code: "ui.chart_label_hidden",
          module: moduleCode,
          selector: node.className,
          message: `Chart label hidden via CSS (${node.className || node.tagName}).`,
        },
      ];
    }
    const rect = node.getBoundingClientRect();
    if (isRectOffCanvas(rect, viewport)) {
      return [
        {
          code: "ui.chart_label_hidden",
          module: moduleCode,
          selector: node.className,
          message: `Chart label off-canvas (${node.className || "label"}).`,
        },
      ];
    }
    const bg = opaqueBackground(node);
    if (colorsTooClose(style.color, bg)) {
      return [
        {
          code: "ui.chart_label_hidden",
          module: moduleCode,
          selector: node.className,
          message: `Chart label color too close to background (${node.className || "label"}).`,
        },
      ];
    }
  }
  return [];
}

/** Run one scan pass. Returns findings (may already have been emitted). */
export function detectUiAnomalies(scope: UiAnomalyScope): UiAnomalyFinding[] {
  if (typeof document === "undefined") return [];
  const pagePath = window.location.pathname || "/";
  const findings = [
    ...scanOverflowClip(scope, pagePath),
    ...scanChartLabels(scope, pagePath),
  ];
  for (const f of findings) emitFinding(f, pagePath);
  return findings;
}

/**
 * Schedule scans after mount (rAF + delayed pass for chart animation) and on resize.
 * At most one emit per pattern per page path per session.
 */
export function startUiAnomalyWatch(scope: UiAnomalyScope): () => void {
  if (typeof window === "undefined") return () => undefined;

  let disposed = false;
  let resizeTimer = 0;
  const run = () => {
    if (disposed) return;
    detectUiAnomalies(scope);
  };

  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
  const delayed = window.setTimeout(run, 1200);

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(run, 400);
  };
  window.addEventListener("resize", onResize);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(delayed);
    window.clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
  };
}

let consoleHookInstalled = false;

/** Optional: flag React uncontrolled/controlled input console warnings as cosmetic. */
export function installUiAnomalyConsoleHook(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (consoleHookInstalled) return () => undefined;
  consoleHookInstalled = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const msg = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
      if (CONTROLLED_INPUT_RE.test(msg)) {
        const pagePath = window.location.pathname || "/";
        emitFinding(
          {
            code: "ui.controlled_input",
            module: moduleFromPath(pagePath) ?? "dashboard",
            message: "React uncontrolled/controlled input warning detected.",
          },
          pagePath,
        );
      }
    } catch {
      /* ignore */
    }
    original(...args);
  };

  return () => {
    console.error = original;
    consoleHookInstalled = false;
  };
}
