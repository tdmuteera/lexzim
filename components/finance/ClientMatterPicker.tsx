"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MatterPickerOption = {
  id: string;
  title: string;
  matterNumber: string | null;
  status: string;
  areaOfLaw: string;
  clientDisplayName: string;
};

function labelOf(m: MatterPickerOption): string {
  const num = m.matterNumber ? `${m.matterNumber} · ` : "";
  return `${num}${m.title}`;
}

export function ClientMatterPicker({
  clientId,
  value,
  onChange,
  disabled,
  required = false,
}: {
  clientId: string;
  value: string;
  onChange: (id: string, option: MatterPickerOption | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MatterPickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MatterPickerOption | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setSelected(null);
    onChange("", null);
    setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void search(query);
    }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, clientId]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    void (async () => {
      try {
        const res = await fetch(`/api/matters/${value}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: {
            matter?: {
              id: string;
              title: string;
              matterNumber: string | null;
              status: string;
              areaOfLaw: string;
              clientDisplayName: string | null;
            };
          };
        };
        const m = body.data?.matter;
        if (m) {
          setSelected({
            id: m.id,
            title: m.title,
            matterNumber: m.matterNumber,
            status: m.status,
            areaOfLaw: m.areaOfLaw,
            clientDisplayName: m.clientDisplayName ?? "",
          });
        }
      } catch {
        /* keep previous */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function search(q: string) {
    if (!clientId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ bucket: "all", clientId });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/matters?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: MatterPickerOption[] };
      };
      const next = body.data?.items ?? [];
      setItems(next.slice(0, 40));
      if (value) {
        const hit = next.find((m) => m.id === value);
        if (hit) setSelected(hit);
      }
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }

  const display = useMemo(() => {
    if (open) return query;
    return selected ? labelOf(selected) : query;
  }, [open, query, selected]);

  const matterLabel = required ? "Matter" : "Matter (optional)";

  if (!clientId) {
    return (
      <div className="quote-search-picker">
        <label className="muted" htmlFor="quote-matter-search-disabled">
          {matterLabel}
        </label>
        <input
          id="quote-matter-search-disabled"
          type="text"
          disabled
          placeholder="Select a client first…"
          value=""
          readOnly
        />
      </div>
    );
  }

  return (
    <div className="quote-search-picker" ref={boxRef}>
      <label className="muted" htmlFor="quote-matter-search">
        {matterLabel}
      </label>
      <input
        id="quote-matter-search"
        type="search"
        autoComplete="off"
        disabled={disabled}
        placeholder="Search matter number or title…"
        value={open ? query : display}
        onFocus={() => {
          setOpen(true);
          setQuery(selected ? "" : query);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <ul className="quote-search-list" role="listbox">
          {loading ? <li className="muted">Searching…</li> : null}
          {!loading && items.length === 0 ? (
            <li className="muted">No matters for this client.</li>
          ) : null}
          <li>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setQuery("");
                setOpen(false);
                onChange("", null);
              }}
            >
              <span className="title">No matter</span>
            </button>
          </li>
          {items.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className={m.id === value ? "active" : undefined}
                onClick={() => {
                  setSelected(m);
                  setQuery("");
                  setOpen(false);
                  onChange(m.id, m);
                }}
              >
                <span className="title">{labelOf(m)}</span>
                <span className="meta">
                  {m.areaOfLaw} · {m.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
