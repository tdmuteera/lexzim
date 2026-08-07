"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";

type SearchHit = {
  type: "client" | "matter";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export function GlobalSearch() {
  const router = useRouter();
  const { can } = useAuth();
  const { toast } = useToast();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<SearchHit[]>([]);
  const [matters, setMatters] = useState<SearchHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const canSearch = can("clients.view") || can("matters.view");
  const items = [...matters, ...clients];

  const runSearch = useCallback(
    async (query: string) => {
      if (!canSearch || query.trim().length < 2) {
        setClients([]);
        setMatters([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          credentials: "include",
        });
        const body = (await res.json()) as {
          ok: boolean;
          data?: { clients: SearchHit[]; matters: SearchHit[] };
        };
        if (!res.ok || !body.ok) {
          setClients([]);
          setMatters([]);
          return;
        }
        setClients(body.data?.clients ?? []);
        setMatters(body.data?.matters ?? []);
        setActiveIndex(0);
      } catch {
        setClients([]);
        setMatters([]);
      } finally {
        setLoading(false);
      }
    },
    [canSearch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => runSearch(q), 220);
    return () => window.clearTimeout(timer);
  }, [q, runSearch]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function goTo(hit: SearchHit) {
    setOpen(false);
    setQ("");
    toast(`Opened ${hit.type}: ${hit.title}`);
    router.push(hit.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = items[activeIndex];
      if (hit) goTo(hit);
    }
  }

  return (
    <div className="global-search" ref={wrapRef}>
      <Icon name="search" />
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder={canSearch ? "Search clients & matters… (Ctrl+K)" : "Search unavailable"}
        aria-label="Global search"
        aria-expanded={open}
        aria-controls="global-search-results"
        disabled={!canSearch}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && q.trim().length >= 2 ? (
        <div id="global-search-results" className="global-search-results" role="listbox">
          {loading ? (
            <div className="muted" style={{ padding: "0.85rem" }}>
              Searching…
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon="search"
              title="No matches"
              detail="Try another name, matter number, or phone."
            />
          ) : (
            <>
              {matters.length > 0 ? (
                <div className="global-search-group">
                  <div className="global-search-label">Matters</div>
                  {matters.map((hit, idx) => (
                    <button
                      key={hit.id}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === idx}
                      className={[
                        "global-search-item",
                        activeIndex === idx ? "active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => goTo(hit)}
                    >
                      <strong>{hit.title}</strong>
                      <span className="muted">{hit.subtitle}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {clients.length > 0 ? (
                <div className="global-search-group">
                  <div className="global-search-label">Clients</div>
                  {clients.map((hit, idx) => {
                    const index = matters.length + idx;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        className={[
                          "global-search-item",
                          activeIndex === index ? "active" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => goTo(hit)}
                      >
                        <strong>{hit.title}</strong>
                        <span className="muted">{hit.subtitle}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
