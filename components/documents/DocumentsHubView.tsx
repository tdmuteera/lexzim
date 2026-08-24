"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Can } from "@/components/auth/Can";
import { Button } from "@/components/ui/Button";
import { ClientDocumentsPanel } from "@/components/clients/ClientDocumentsPanel";
import { ClientSearchPicker } from "@/components/finance/ClientSearchPicker";
import { TemplatesLibraryView } from "@/components/templates/TemplatesLibraryView";
import { formatBytes } from "@/lib/documents/serialize";

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
};

export function DocumentsHubView() {
  const [tab, setTab] = useState<HubTab>("client-docs");
  const [browseClientId, setBrowseClientId] = useState("");
  const [browseClientLabel, setBrowseClientLabel] = useState("");
  const [items, setItems] = useState<ClientDocItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFirmDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: "client" });
      if (q.trim()) params.set("q", q.trim());
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
  }, [q]);

  useEffect(() => {
    if (tab !== "client-docs") return;
    const timer = window.setTimeout(() => void loadFirmDocs(), 200);
    return () => window.clearTimeout(timer);
  }, [tab, loadFirmDocs]);

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
                Client-specific files (identity, KYC, correspondence). Matter files stay on each
                matter. Templates are on the Templates tab.
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
                  placeholder="Search all client documents…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Search client documents"
                />
                <div className="toolbar-spacer" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadFirmDocs()}
                  disabled={loading}
                >
                  Refresh
                </Button>
              </div>

              {error ? (
                <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
              ) : null}

              {loading ? (
                <p className="muted">Loading client documents…</p>
              ) : items.length === 0 ? (
                <p className="muted">No client documents yet.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Title</th>
                        <th>File</th>
                        <th>Size</th>
                        <th>Added</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
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
