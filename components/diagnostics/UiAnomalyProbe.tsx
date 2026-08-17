"use client";

import { useEffect } from "react";
import {
  startUiAnomalyWatch,
  type UiAnomalyScope,
} from "@/lib/diagnostics/ui-anomalies";

/** Mount-only probe: known layout anomaly detectors (P8-10). Renders nothing. */
export function UiAnomalyProbe({ scope }: { scope: UiAnomalyScope }) {
  useEffect(() => startUiAnomalyWatch(scope), [scope]);
  return null;
}
