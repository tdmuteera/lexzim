"use client";

import type { ReactNode } from "react";
import type { SortDir } from "@/lib/ui/table-sort";

/**
 * Table header cell with A–Z / ascending–descending toggle.
 * Click cycles: inactive → asc → desc → asc …
 */
export function SortableTh({
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
  className,
  align = "left",
}: {
  label: ReactNode;
  columnKey: string;
  activeKey: string | null;
  direction: SortDir;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "right" | "center";
}) {
  const active = activeKey === columnKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  const hint = active
    ? direction === "asc"
      ? "Sorted A to Z / ascending. Click for Z to A."
      : "Sorted Z to A / descending. Click for A to Z."
    : "Click to sort A to Z / ascending";

  return (
    <th
      className={["th-sortable", className].filter(Boolean).join(" ")}
      aria-sort={ariaSort}
      style={{ textAlign: align }}
    >
      <button
        type="button"
        className={["th-sort-btn", active ? "is-active" : ""].filter(Boolean).join(" ")}
        onClick={() => onSort(columnKey)}
        title={hint}
        aria-label={`${typeof label === "string" ? label : columnKey}: ${hint}`}
      >
        <span className="th-sort-label">{label}</span>
        <span className="th-sort-icons" aria-hidden="true">
          <span className={active && direction === "asc" ? "is-on" : ""}>↑</span>
          <span className={active && direction === "desc" ? "is-on" : ""}>↓</span>
        </span>
      </button>
    </th>
  );
}
