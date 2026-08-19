"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ClientSearchOption = {
  id: string;
  title: string;
  subtitle: string;
};

export function ClientSearchPicker({
  value,
  onChange,
  disabled,
  label = "Client",
  placeholder = "Search by CL number, name, phone, or ID…",
  inputId = "client-search-picker",
}: {
  value: string;
  onChange: (id: string, option: ClientSearchOption | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  inputId?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ClientSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClientSearchOption | null>(null);
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
        const res = await fetch(`/api/clients/${value}`, { credentials: "include" });
        const body = (await res.json()) as {
          ok?: boolean;
          data?: {
            client?: {
              id: string;
              displayLabel: string;
              clientTypeLabel?: string;
              phone?: string | null;
            };
          };
        };
        const c = body.data?.client;
        if (c) {
          setSelected({
            id: c.id,
            title: c.displayLabel,
            subtitle: [c.clientTypeLabel, c.phone].filter(Boolean).join(" · "),
          });
        }
      } catch {
        /* keep previous */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  async function search(q: string) {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=20`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { clients?: ClientSearchOption[] };
      };
      const clients = (body.data?.clients ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
      }));
      setItems(clients.slice(0, 20));
      if (value) {
        const hit = clients.find((c) => c.id === value);
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
    return selected ? selected.title : query;
  }, [open, query, selected]);

  return (
    <div className="quote-search-picker" ref={boxRef}>
      <label className="muted" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
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
          {!loading && query.trim().length < 2 ? (
            <li className="muted">Type at least 2 characters…</li>
          ) : null}
          {!loading && query.trim().length >= 2 && items.length === 0 ? (
            <li className="muted">No matching clients.</li>
          ) : null}
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.id === value ? "active" : undefined}
                onClick={() => {
                  setSelected(c);
                  setQuery("");
                  setOpen(false);
                  onChange(c.id, c);
                }}
              >
                <span className="title">{c.title}</span>
                {c.subtitle ? <span className="meta">{c.subtitle}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
