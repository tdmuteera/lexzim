"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { clientTypeLabel, normalizeClientType } from "@/lib/clients/kyc-types";

type SerializedClient = {
  id: string;
  clientNumber: string;
  clientType: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  idNumber: string | null;
  nationalIdOrRegNumber: string | null;
  displayName: string;
  displayLabel: string;
  kycStatus: string;
  archivedAt: string | null;
  updatedAt: string;
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
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: SerializedClient[] };
        error?: { message: string };
      };
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
      void load();
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
              placeholder="Search CL number, name, phone, ID…"
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
              <option value="corporate">Corporate</option>
              <option value="partnership">Partnership</option>
              <option value="trust">Trust</option>
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
              <option value="number:asc">Client number</option>
              <option value="updated:desc">Recently updated</option>
              <option value="created:desc">Recently created</option>
            </select>
            <div className="toolbar-spacer" />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>CL #</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>WhatsApp</th>
                  <th>KYC</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Loading clients…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
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
                      <td>{client.clientNumber}</td>
                      <td>
                        <Link href={`/clients/${client.id}`}>{client.displayName}</Link>
                      </td>
                      <td>
                        <Badge
                          tone={
                            normalizeClientType(client.clientType) === "individual"
                              ? "individual"
                              : "company"
                          }
                        >
                          {clientTypeLabel(client.clientType)}
                        </Badge>
                      </td>
                      <td>{client.phone ?? "—"}</td>
                      <td>{client.whatsapp ?? "—"}</td>
                      <td>{client.kycStatus}</td>
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
