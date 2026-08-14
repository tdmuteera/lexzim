"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type MatterSearchOption = {
  id: string;
  title: string;
  matterNumber: string | null;
  status: string;
  areaOfLaw: string;
  clientDisplayName: string;
};

function labelOf(m: MatterSearchOption): string {
  const num = m.matterNumber ? `${m.matterNumber} · ` : "";
  return `${num}${m.title}${m.clientDisplayName ? ` (${m.clientDisplayName})` : ""}`;
}

export function MatterSearchPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string, option: MatterSearchOption | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MatterSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MatterSearchOption | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void search(query);
    }, 220);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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
    setLoading(true);
    try {
      const params = new URLSearchParams({ bucket: "all" });
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/matters?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: MatterSearchOption[] };
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

  return (
    <div className="ai-matter-search" ref={boxRef}>
      <label className="muted" htmlFor="ai-matter-search-input">
        Search matters
      </label>
      <input
        id="ai-matter-search-input"
        type="search"
        autoComplete="off"
        disabled={disabled}
        placeholder="Type a title, file number, client, or case number…"
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
        <ul className="ai-matter-search-list" role="listbox">
          {loading ? <li className="muted">Searching…</li> : null}
          {!loading && items.length === 0 ? (
            <li className="muted">No matching matters.</li>
          ) : null}
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
