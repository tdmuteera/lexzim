"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { SortableTh } from "@/components/ui/SortableTh";
import { ClientDocumentsPanel } from "@/components/clients/ClientDocumentsPanel";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { TemplatesLibraryView } from "@/components/templates/TemplatesLibraryView";
import { formatBytes } from "@/lib/documents/serialize";
import { useTableSort } from "@/lib/ui/table-sort";

type HubTab = "client-docs" | "templates";

type ClientDocItem = {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number | null;
  createdAt: string;
  createdByName: string | null;
  clientId: string | null;
  clientDisplayName: string | null;
  clientNumber: string | null;
  matterNumber?: string | null;
  matterTitle?: string | null;
};

export function DocumentsHubView() {
  const [tab, setTab] = useState<HubTab>("client-docs");
  const [browseClientId, setBrowseClientId] = useState("");
  const [browseClientLabel, setBrowseClientLabel] = useState("");
  const [items, setItems] = useState<ClientDocItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const loadFirmDocs = useCallback(async (search: string) => {
    const trimmed = search.trim();
    if (!trimmed) {
      setItems([]);
      setHasSearched(false);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const params = new URLSearchParams({ scope: "client", q: trimmed });
      const res = await fetch(`/api/documents?${params.toString()}`, {
        credentials: "include",
      });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { items: ClientDocItem[] };
        error?: { message: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not load client documents.");
        setItems([]);
        return;
      }
      setItems(body.data?.items ?? []);
    } catch {
      setError("Could not load client documents.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== "client-docs") return;
    const timer = window.setTimeout(() => void loadFirmDocs(q), 250);
    return () => window.clearTimeout(timer);
  }, [tab, q, loadFirmDocs]);

  async function onView(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${id}/download`, { credentials: "include" });
      const body = (await res.json()) as {
        ok: boolean;
        data?: { signedUrl: string };
        error?: { message: string };
      };
      if (!res.ok || !body.ok || !body.data?.signedUrl) {
        setError(body.error?.message ?? "Could not open document.");
        return;
      }
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setError("Could not open document.");
    }
  }

  const showMatterColumn = items.some((item) => Boolean(item.matterNumber));

  const sortAccessors = useMemo(
    () => ({
      client: (r: ClientDocItem) => r.clientDisplayName ?? r.clientNumber ?? "",
      matter: (r: ClientDocItem) =>
        r.matterNumber
          ? r.matterTitle
            ? `${r.matterNumber} · ${r.matterTitle}`
            : r.matterNumber
          : "",
      title: (r: ClientDocItem) => r.title,
      file: (r: ClientDocItem) => r.fileName,
      size: (r: ClientDocItem) => r.sizeBytes ?? 0,
      added: (r: ClientDocItem) => r.createdAt,
    }),
    [],
  );
  const { sortedRows, sortKey, sortDir, toggleSort } = useTableSort(items, sortAccessors, {
    key: "added",
    dir: "desc",
  });

  return (
    <section className="view active scrollable" aria-label="Documents">
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <h3>Documents</h3>
        </div>
        <div className="panel-body">
          <div className="tabs" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className={["tab", tab === "client-docs" ? "active" : ""].filter(Boolean).join(" ")}
              onClick={() => setTab("client-docs")}
            >
              Client documents
            </button>
            <button
              type="button"
              className={["tab", tab === "templates" ? "active" : ""].filter(Boolean).join(" ")}
              onClick={() => setTab("templates")}
            >
              Templates
            </button>
          </div>

          {tab === "templates" ? (
            <TemplatesLibraryView embedded />
          ) : (
            <div>
              <p className="muted" style={{ marginTop: 0 }}>
                Select a client to work with that client&apos;s files, or search below by client
                name, number, or matter. You only see clients you are assigned to (or all clients if
                the Managing Partner granted that right).
              </p>

              <div
                className="panel"
                style={{ padding: "1rem", marginBottom: "1rem", background: "var(--bg-3)" }}
              >
                <h4 style={{ marginTop: 0 }}>Browse by client</h4>
                <p className="muted" style={{ marginTop: 0 }}>
                  Select a client to view or upload that client&apos;s documents.
                </p>
                <ClientSearchPicker
                  inputId="hub-client-doc-search"
                  value={browseClientId}
                  onChange={(id, option) => {
                    setBrowseClientId(id);
                    setBrowseClientLabel(option?.title ?? "");
                  }}
                  placeholder="Type a name or CL number…"
                />
                {browseClientId ? (
                  <div style={{ marginTop: "1rem" }}>
                    <p style={{ marginTop: 0, fontWeight: 600 }}>
                      {browseClientLabel || "Selected client"}
                      {" · "}
                      <Link href={`/clients/${browseClientId}`}>Open client</Link>
                    </p>
                    <ClientDocumentsPanel clientId={browseClientId} />
                  </div>
                ) : null}
              </div>

              <div className="toolbar" style={{ marginBottom: "0.75rem" }}>
                <input
                  className="search-input"
                  placeholder="Search documents by client, matter, or file name…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search client documents"
                />
                <div className="toolbar-spacer" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadFirmDocs(q)}
                  disabled={loading || !q.trim()}
                >
                  Search
                </Button>
              </div>

              {error ? (
                <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
              ) : null}

              {!hasSearched ? (
                <p className="muted">
                  Type a search to find documents. Results are not listed until you search.
                </p>
              ) : loading ? (
                <p className="muted">Searching…</p>
              ) : items.length === 0 ? (
                <p className="muted">No documents matched your search (within your access).</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <SortableTh
                          label="Client"
                          columnKey="client"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                        />
                        {showMatterColumn ? (
                          <SortableTh
                            label="Matter"
                            columnKey="matter"
                            activeKey={sortKey}
                            direction={sortDir}
                            onSort={toggleSort}
                          />
                        ) : null}
                        <SortableTh
                          label="Title"
                          columnKey="title"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="File"
                          columnKey="file"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Size"
                          columnKey="size"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableTh
                          label="Added"
                          columnKey="added"
                          activeKey={sortKey}
                          direction={sortDir}
                          onSort={toggleSort}
                        />
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {item.clientId ? (
                              <Link href={`/clients/${item.clientId}`}>
                                {item.clientDisplayName ?? item.clientNumber ?? "Client"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          {showMatterColumn ? (
                            <td className="muted" style={{ fontSize: "0.85rem" }}>
                              {item.matterNumber
                                ? item.matterTitle
                                  ? `${item.matterNumber} · ${item.matterTitle}`
                                  : item.matterNumber
                                : "—"}
                            </td>
                          ) : null}
                          <td>{item.title}</td>
                          <td>{item.fileName}</td>
                          <td>{formatBytes(item.sizeBytes)}</td>
                          <td>
                            {new Date(item.createdAt).toLocaleString()}
                            {item.createdByName ? ` · ${item.createdByName}` : ""}
                          </td>
                          <td>
                            <Can permission="documents.view">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void onView(item.id)}
                              >
                                View
                              </Button>
                            </Can>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
