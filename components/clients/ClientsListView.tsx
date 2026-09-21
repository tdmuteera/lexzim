"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortableTh } from "@/components/ui/SortableTh";
import { clientTypeLabel, normalizeClientType } from "@/lib/clients/kyc-types";
import { useTableSort } from "@/lib/ui/table-sort";

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
  const [visibility, setVisibility] = useState<"all" | "assigned" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [clientType, setClientType] = useState("");
  const [archived, setArchived] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (clientType) params.set("clientType", clientType);
      if (archived) params.set("archived", archived);
      params.set("sort", "name");
      params.set("sortDir", "asc");

      const res = await fetch(`/api/clients?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok?: boolean;
        data?: { items?: SerializedClient[]; visibility?: "all" | "assigned" };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load clients.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
      setVisibility(body.data?.visibility ?? null);
    } catch {
      setError("Could not load clients. Check your connection.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, clientType, archived]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  const accessors = useMemo(
    () => ({
      number: (c: SerializedClient) => c.clientNumber,
      name: (c: SerializedClient) => c.displayName,
      type: (c: SerializedClient) => clientTypeLabel(c.clientType),
      phone: (c: SerializedClient) => c.phone,
      whatsapp: (c: SerializedClient) => c.whatsapp,
      kyc: (c: SerializedClient) => c.kycStatus,
      status: (c: SerializedClient) => (c.archivedAt ? "Archived" : "Active"),
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, accessors, {
    key: "name",
    dir: "asc",
  });

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
          {visibility === "assigned" ? (
            <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
              Showing assigned clients only: you are the client responsible lawyer, or you are
              linked through a matter (responsible lawyer or matter team). Managing Partner and
              users with &quot;View all clients&quot; see the full list.
            </p>
          ) : null}
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
                  <SortableTh
                    label="CL #"
                    columnKey="number"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Name"
                    columnKey="name"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Type"
                    columnKey="type"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Phone"
                    columnKey="phone"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="WhatsApp"
                    columnKey="whatsapp"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="KYC"
                    columnKey="kyc"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Status"
                    columnKey="status"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      Loading clients…
                    </td>
                  </tr>
                ) : sortedRows.length === 0 ? (
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
                  sortedRows.map((client) => (
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
