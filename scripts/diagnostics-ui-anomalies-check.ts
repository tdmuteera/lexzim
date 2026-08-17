/**
 * Pure checks for P8-10 layout anomaly helpers + CSS regression notes.
 * No browser required. Run: npm run diagnostics:ui-anomalies
 */
import fs from "node:fs";
import path from "node:path";
import {
  CONTROLLED_INPUT_RE,
  colorsTooClose,
  isOverflowClipMetric,
  isRectOffCanvas,
  parseCssRgb,
  relativeLuminance,
} from "../lib/diagnostics/ui-anomalies";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "styles", "tpfigu.css"), "utf8");
const invoiceForm = fs.readFileSync(
  path.join(root, "components", "billing", "InvoiceFormView.tsx"),
  "utf8",
);

// --- Pure detector helpers ---
assert(
  isOverflowClipMetric({
    clientHeight: 40,
    scrollHeight: 120,
    overflowY: "hidden",
    overflow: "hidden",
  }),
  "overflow clip should detect hidden + tall content",
);
assert(
  !isOverflowClipMetric({
    clientHeight: 40,
    scrollHeight: 120,
    overflowY: "auto",
    overflow: "auto",
  }),
  "overflow auto should not be flagged as clip",
);
assert(
  !isOverflowClipMetric({
    clientHeight: 100,
    scrollHeight: 105,
    overflowY: "hidden",
    overflow: "hidden",
  }),
  "small scroll slack should not flag",
);

assert(parseCssRgb("#112233")?.r === 0x11, "hex parse");
assert(parseCssRgb("rgb(10, 20, 30)")?.b === 30, "rgb parse");
assert(relativeLuminance(255, 255, 255) > relativeLuminance(0, 0, 0), "luminance order");
assert(colorsTooClose("rgb(20,20,20)", "rgb(25,25,25)"), "near colors too close");
assert(!colorsTooClose("rgb(0,0,0)", "rgb(255,255,255)"), "black on white ok");

assert(
  isRectOffCanvas(
    { top: -40, left: 0, bottom: -10, right: 20, width: 20, height: 30 },
    { width: 800, height: 600 },
  ),
  "above viewport is off-canvas",
);
assert(
  !isRectOffCanvas(
    { top: 10, left: 10, bottom: 40, right: 40, width: 30, height: 30 },
    { width: 800, height: 600 },
  ),
  "on-canvas label",
);

assert(
  CONTROLLED_INPUT_RE.test(
    "Warning: A component is changing an uncontrolled input to be controlled.",
  ),
  "controlled input regex",
);

// --- CSS / markup regression notes (known prior bugs) ---
function cssBlock(selector: string): string {
  const needle = `${selector} {`;
  let from = 0;
  while (from < css.length) {
    const idx = css.indexOf(needle, from);
    assert(idx >= 0, `missing CSS selector ${selector}`);
    const prev = idx === 0 ? "\n" : css[idx - 1]!;
    // Prefer a bare selector (not ".dash-body .panel-body")
    if (prev === "\n" || prev === "}" || /\s/.test(prev)) {
      const lineStart = css.lastIndexOf("\n", idx - 1) + 1;
      const linePrefix = css.slice(lineStart, idx).trim();
      if (linePrefix === "" || linePrefix.endsWith("}")) {
        const open = css.indexOf("{", idx);
        const close = css.indexOf("}", open);
        assert(open >= 0 && close > open, `unclosed CSS block for ${selector}`);
        return css.slice(open, close + 1);
      }
    }
    from = idx + needle.length;
  }
  throw new Error(`missing bare CSS selector ${selector}`);
}

const barValue = cssBlock(".dash-bar-value");
const barLabel = cssBlock(".dash-bar-label");
const financeDesk = cssBlock(".finance-desk-view");
const panelBody = cssBlock(".panel-body");

assert(
  barValue.includes("color: var(--text)"),
  "dash-bar-value must use visible text color (not bar-only absolute label)",
);
assert(
  barLabel.includes("flex: 0 0 auto"),
  "dash-bar-label must sit under the bar (flex 0 0 auto), not absolute on the fill only",
);
assert(
  !barValue.includes("position: absolute"),
  "dash-bar-value must not be position:absolute (regression of clipped values)",
);
assert(
  financeDesk.includes("overflow: visible"),
  "finance-desk-view should allow overflow visible so forms are not clipped",
);
assert(
  panelBody.includes("overflow: auto"),
  "panel-body should be scrollable (overflow auto)",
);
assert(
  invoiceForm.includes('className="panel-body"') || invoiceForm.includes("panel-body"),
  "InvoiceFormView must render inside a panel-body",
);
assert(
  invoiceForm.includes("finance-desk-view"),
  "InvoiceFormView must use finance-desk-view shell",
);

console.log("diagnostics:ui-anomalies OK (helpers + CSS/markup regression checks)");
