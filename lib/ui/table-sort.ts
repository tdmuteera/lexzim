import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export type SortAccessors<T> = Record<string, (row: T) => unknown>;

function toComparable(value: unknown): {
  kind: "empty" | "number" | "date" | "string";
  n?: number;
  s?: string;
} {
  if (value == null || value === "") return { kind: "empty" };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { kind: "number", n: value };
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { kind: "date", n: value.getTime() };
  }
  if (typeof value === "boolean") return { kind: "number", n: value ? 1 : 0 };
  const raw = String(value).trim();
  if (!raw) return { kind: "empty" };
  // ISO / parseable dates
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) || raw.endsWith("Z")) {
    const t = Date.parse(raw);
    if (!Number.isNaN(t)) return { kind: "date", n: t };
  }
  const asNum = Number(raw.replace(/,/g, ""));
  if (raw !== "" && Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(raw.replace(/,/g, ""))) {
    return { kind: "number", n: asNum };
  }
  return { kind: "string", s: raw.toLocaleLowerCase() };
}

/** Null/empty values sort after real values in both directions. */
export function compareSortValues(a: unknown, b: unknown): number {
  const left = toComparable(a);
  const right = toComparable(b);
  if (left.kind === "empty" && right.kind === "empty") return 0;
  if (left.kind === "empty") return 1;
  if (right.kind === "empty") return -1;
  if (left.kind === "number" && right.kind === "number") {
    return (left.n ?? 0) - (right.n ?? 0);
  }
  if (left.kind === "date" && right.kind === "date") {
    return (left.n ?? 0) - (right.n ?? 0);
  }
  return String(left.s ?? a).localeCompare(String(right.s ?? b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortRows<T>(
  rows: T[],
  sortKey: string | null,
  sortDir: SortDir,
  accessors: SortAccessors<T>,
): T[] {
  if (!sortKey || !accessors[sortKey]) return rows;
  const get = accessors[sortKey]!;
  const mul = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((x, y) => mul * compareSortValues(get(x), get(y)));
}

export function useTableSort<T>(
  rows: T[],
  accessors: SortAccessors<T>,
  initial?: { key: string; dir?: SortDir },
) {
  const [sortKey, setSortKey] = useState<string | null>(initial?.key ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(initial?.dir ?? "asc");

  const sortedRows = useMemo(
    () => sortRows(rows, sortKey, sortDir, accessors),
    [rows, sortKey, sortDir, accessors],
  );

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  return { sortedRows, sortKey, sortDir, toggleSort, setSortKey, setSortDir };
}
