"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type SerializedClient = {
  id: string;
  clientType: string;
  fullName: string | null;
  legalName: string | null;
  tradingName: string | null;
  nationalIdOrRegNumber: string | null;
  phone: string | null;
  email: string | null;
  displayName: string;
  archivedAt: string | null;
  updatedAt: string;
};

type ListResponse = {
  ok: boolean;
  data?: { items: SerializedClient[] };
  error?: { message: string };
};

export function ClientsListView() {
  const [items, setItems] = useState<SerializedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [clientType, setClientType] = useState("");
  const [archived, setArchived] = useState("active");
  const [sort, setSort] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (clientType) params.set("clientType", clientType);
      if (archived) params.set("archived", archived);
      params.set("sort", sort);
      params.set("sortDir", sortDir);

      const res = await fetch(`/api/clients?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as ListResponse;
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load clients.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load clients. Check your connection.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, clientType, archived, sort, sortDir]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <section className="view active scrollable" aria-label="Client Management">
      <div className="panel">
        <div className="panel-head">
          <h3>Client Management</h3>
          <Can permission="clients.create">
            <Link href="/clients/new" className="btn btn-primary btn-sm">
              New client
            </Link>
          </Can>
        </div>
        <div className="panel-body">
          <div className="toolbar">
            <input
              className="search-input"
              placeholder="Search name, ID, phone, email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search clients"
            />
            <select
              className="filter-select"
              value={clientType}
              onChange={(e) => setClientType(e.target.value)}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              <option value="individual">Individual</option>
              <option value="company">Company</option>
            </select>
            <select
              className="filter-select"
              value={archived}
              onChange={(e) => setArchived(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <select
              className="filter-select"
              value={`${sort}:${sortDir}`}
              onChange={(e) => {
                const [s, d] = e.target.value.split(":");
                setSort(s);
                setSortDir(d);
              }}
              aria-label="Sort clients"
            >
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="updated:desc">Recently updated</option>
              <option value="created:desc">Recently created</option>
            </select>
            <div className="toolbar-spacer" />
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
          ) : null}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>ID / Reg</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="muted">Loading clients…</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        icon="users"
                        title="No clients match your filters"
                        detail="Try clearing search or add a new client."
                      />
                    </td>
                  </tr>
                ) : (
                  items.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/clients/${client.id}`} style={{ fontWeight: 600 }}>
                          {client.displayName}
                        </Link>
                        {client.clientType === "company" && client.legalName && client.tradingName ? (
                          <div className="muted" style={{ fontSize: "0.8rem" }}>
                            {client.legalName}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <Badge tone={client.clientType === "company" ? "company" : "individual"}>
                          {client.clientType === "company" ? "Company" : "Individual"}
                        </Badge>
                      </td>
                      <td>{client.nationalIdOrRegNumber ?? "—"}</td>
                      <td>{client.phone ?? "—"}</td>
                      <td>{client.email ?? "—"}</td>
                      <td>
                        {client.archivedAt ? (
                          <Badge tone="closed">Archived</Badge>
                        ) : (
                          <Badge tone="open">Active</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
