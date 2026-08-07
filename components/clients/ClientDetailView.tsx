"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RelatedPartiesPanel } from "@/components/parties/RelatedPartiesPanel";
import type { ClientFormValues } from "@/components/clients/ClientForm";

type ClientDetail = {
  id: string;
  clientType: string;
  fullName: string | null;
  legalName: string | null;
  tradingName: string | null;
  nationalIdOrRegNumber: string | null;
  taxNumber: string | null;
  email: string | null;
  phone: string | null;
  altPhone: string | null;
  physicalAddress: string | null;
  postalAddress: string | null;
  kycNotes: string | null;
  displayName: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MatterCounts = {
  open: number;
  closed: number;
  total: number;
};

type MatterSummary = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  areaOfLaw: string;
  matterNumber: string | null;
};

type ClientDetailViewProps = {
  client: ClientDetail;
  matterCounts: MatterCounts;
  matters: MatterSummary[];
};

export function ClientDetailView({ client, matterCounts, matters }: ClientDetailViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isArchived = Boolean(client.archivedAt);

  async function onArchiveOrRestore() {
    setLoading(true);
    setError(null);
    const action = isArchived ? "restore" : "archive";
    try {
      const res = await fetch(`/api/clients/${client.id}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Action failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Action failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="view active scrollable" aria-label="Client detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{client.displayName}</h3>
            <p className="muted" style={{ marginTop: "0.25rem" }}>
              Client profile and matter summary
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <Badge tone={client.clientType === "company" ? "company" : "individual"}>
              {client.clientType === "company" ? "Company" : "Individual"}
            </Badge>
            {isArchived ? <Badge tone="closed">Archived</Badge> : <Badge tone="open">Active</Badge>}
            <Can permission="clients.edit">
              <Link href={`/clients/${client.id}/edit`} className="btn btn-outline btn-sm">
                Edit
              </Link>
            </Can>
            <Can permission="clients.delete">
              <Button
                size="sm"
                variant="danger"
                onClick={onArchiveOrRestore}
                disabled={loading}
              >
                {isArchived ? "Restore" : "Archive"}
              </Button>
            </Can>
          </div>
        </div>
        <div className="panel-body">
          {error ? (
            <p style={{ color: "var(--danger)", marginBottom: "0.75rem" }}>{error}</p>
          ) : null}

          <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
            <div className="panel" style={{ padding: "1rem" }}>
              <div className="muted">Open matters</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{matterCounts.open}</div>
            </div>
            <div className="panel" style={{ padding: "1rem" }}>
              <div className="muted">Closed matters</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{matterCounts.closed}</div>
            </div>
            <div className="panel" style={{ padding: "1rem" }}>
              <div className="muted">Total matters</div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{matterCounts.total}</div>
            </div>
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h4 style={{ margin: 0 }}>Matters</h4>
              <Can permission="matters.create">
                <Link
                  href={`/matters/new?clientId=${encodeURIComponent(client.id)}`}
                  className="btn btn-primary btn-sm"
                >
                  New matter
                </Link>
              </Can>
            </div>
            {matters.length === 0 ? (
              <p className="muted">No matters for this client yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Area</th>
                      <th>Status</th>
                      <th>Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matters.map((matter) => (
                      <tr key={matter.id}>
                        <td>
                          <Link href={`/matters/${matter.id}`} style={{ fontWeight: 600 }}>
                            {matter.title}
                          </Link>
                        </td>
                        <td>{matter.areaOfLaw}</td>
                        <td>
                          <Badge
                            tone={
                              matter.status === "open"
                                ? "open"
                                : matter.status === "closed" || matter.status === "archived"
                                  ? "closed"
                                  : "pending"
                            }
                          >
                            {matter.statusLabel}
                          </Badge>
                        </td>
                        <td>{matter.matterNumber ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid-2">
            <DetailField label="National ID / registration" value={client.nationalIdOrRegNumber} />
            <DetailField label="Tax number" value={client.taxNumber} />
            <DetailField label="Email" value={client.email} />
            <DetailField label="Phone" value={client.phone} />
            <DetailField label="Alternate phone" value={client.altPhone} />
            {client.clientType === "company" ? (
              <>
                <DetailField label="Legal name" value={client.legalName} />
                <DetailField label="Trading name" value={client.tradingName} />
              </>
            ) : (
              <DetailField label="Full name" value={client.fullName} />
            )}
          </div>

          <DetailField label="Physical address" value={client.physicalAddress} block />
          <DetailField label="Postal address" value={client.postalAddress} block />
          <DetailField label="KYC notes" value={client.kycNotes} block />

          <div style={{ marginTop: "1.5rem" }}>
            <RelatedPartiesPanel scope="client" scopeId={client.id} />
          </div>

          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
            Created {formatDate(client.createdAt)} · Updated {formatDate(client.updatedAt)}
          </p>

          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/clients" className="btn btn-outline btn-sm">
              Back to clients
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailField({
  label,
  value,
  block = false,
}: {
  label: string;
  value: string | null;
  block?: boolean;
}) {
  return (
    <div className="form-group" style={block ? { gridColumn: "1 / -1" } : undefined}>
      <label>{label}</label>
      <div>{value?.trim() ? value : "—"}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function toClientFormValues(client: ClientDetail): ClientFormValues {
  return {
    clientType: client.clientType as ClientFormValues["clientType"],
    fullName: client.fullName ?? "",
    legalName: client.legalName ?? "",
    tradingName: client.tradingName ?? "",
    nationalIdOrRegNumber: client.nationalIdOrRegNumber ?? "",
    taxNumber: client.taxNumber ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    altPhone: client.altPhone ?? "",
    physicalAddress: client.physicalAddress ?? "",
    postalAddress: client.postalAddress ?? "",
    kycNotes: client.kycNotes ?? "",
  };
}
