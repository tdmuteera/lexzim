"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type ExportKind =
  | "debtors"
  | "gl_coa"
  | "gl_trial_balance"
  | "gl_profit_and_loss"
  | "gl_balance_sheet"
  | "quotation"
  | "invoice"
  | "receipt"
  | "trust_statement"
  | "petty_cash_summary"
  | "creditor_ageing"
  | "birthday_list"
  | "lawyer_performance"
  | "practice_report"
  | "finance_weekly"
  | "finance_monthly";

type ExportFormat = "pdf" | "docx" | "xlsx" | "csv";

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  csv: "CSV",
};

/**
 * Download menu for server-generated exports (Phase 7).
 */
export function ExportMenu({
  kind,
  queryParams,
  disabled,
  formats = ["pdf", "docx", "xlsx", "csv"],
  label = "Download",
}: {
  kind: ExportKind;
  queryParams?: Record<string, string | undefined>;
  disabled?: boolean;
  formats?: ExportFormat[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const links = useMemo(() => {
    const base = new URLSearchParams();
    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value) base.set(key, value);
      }
    }
    return formats.map((format) => {
      const params = new URLSearchParams(base);
      params.set("format", format);
      return {
        format,
        label: FORMAT_LABELS[format],
        href: `/api/export/${kind}?${params.toString()}`,
      };
    });
  }, [kind, queryParams, formats]);

  return (
    <div className={`export-menu${open ? " open" : ""}`} ref={boxRef}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} ▾
      </Button>
      {open ? (
        <ul className="export-menu-list" role="menu">
          {links.map((link) => (
            <li key={link.format} role="none">
              <a
                role="menuitem"
                href={link.href}
                download
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
