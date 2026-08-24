"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Can } from "@/components/auth/Can";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClientEmailButton } from "@/components/email/ClientEmailButton";
import { ClientDocumentsPanel } from "@/components/clients/ClientDocumentsPanel";
import { RelatedPartiesPanel } from "@/components/parties/RelatedPartiesPanel";
import {
  KYC_STATUS_OPTIONS,
  SOURCE_OF_FUNDS_OPTIONS,
  clientTypeLabel,
  normalizeClientType,
} from "@/lib/clients/kyc-types";

type ClientDetail = {
  id: string;
  clientNumber: string;
  clientType: string;
  displayName: string;
  displayLabel: string;
  firstName: string | null;
  surname: string | null;
  otherNames: string | null;
  maidenName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  idNumber: string | null;
  registeredName: string | null;
  tradingName: string | null;
  regTaxNumber: string | null;
  taxNumber: string | null;
  nationalIdOrRegNumber: string | null;
  incorporationDate: string | null;
  incorporationCountry: string | null;
  registeredAddress: string | null;
  businessAddress: string | null;
  industry: string | null;
  responsibleLawyerId: string | null;
  responsibleLawyerName?: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  altPhone: string | null;
  residentialAddress: string | null;
  postalAddress: string | null;
  occupation: string | null;
  employer: string | null;
  pepStatus: boolean;
  pepDetails: string | null;
  uboJson: Array<{
    fullName: string;
    dob?: string | null;
    nationality?: string | null;
    address?: string | null;
    controlPct?: number | null;
  }>;
  matterScopePurpose: string | null;
  sourceOfFunds: string | null;
  sourceOfFundsOther: string | null;
  kycDocumentsJson: Record<string, unknown>;
  declarationSignedAt: string | null;
  declarationSignatory: string | null;
  kycStatus: string;
  kycNotes: string | null;
  fullName: string | null;
  legalName: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MatterCounts = { open: number; closed: number; total: number };
type MatterSummary = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  areaOfLaw: string;
  matterNumber: string | null;
};

type Tab = "overview" | "kyc" | "matters" | "documents" | "billing" | "trust";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "kyc", label: "KYC" },
  { id: "matters", label: "Matters" },
  { id: "documents", label: "Documents" },
  { id: "billing", label: "Billing" },
  { id: "trust", label: "Trust" },
];

export function ClientDetailView({
  client,
  matterCounts,
  matters,
}: {
  client: ClientDetail;
  matterCounts: MatterCounts;
  matters: MatterSummary[];
}) {
  const { can } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isArchived = Boolean(client.archivedAt);
  const type = normalizeClientType(client.clientType);
  const canSeeKyc = can("clients.kyc.manage") || can("clients.edit");
  const visibleTabs = TABS.filter((t) => t.id !== "kyc" || canSeeKyc);

  async function onArchiveOrRestore() {
    const action = isArchived ? "restore" : "archive";
    if (action === "archive") {
      const ok = window.confirm(
        `Delete client "${client.displayName}"?\n\nThis archives the client (soft delete). You can restore them later from Archived clients.`,
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(`Restore client "${client.displayName}"?`);
      if (!ok) return;
    }

    setLoading(true);
    setError(null);
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
      if (action === "archive") {
        router.push("/clients");
      }
    } catch {
      setError("Action failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const kycStatusLabel =
    KYC_STATUS_OPTIONS.find((o) => o.value === client.kycStatus)?.label ?? client.kycStatus;
  const sourceLabel =
    SOURCE_OF_FUNDS_OPTIONS.find((o) => o.value === client.sourceOfFunds)?.label ??
    client.sourceOfFunds;

  return (
    <section className="view active scrollable" aria-label="Client detail">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>{client.displayName}</h3>
            <p className="muted">
              {client.clientNumber} · {clientTypeLabel(type)} · KYC {kycStatusLabel}
            </p>
          </div>
          <div className="panel-actions" style={{ position: "relative" }}>
            <Badge tone={type === "individual" ? "individual" : "company"}>
              {clientTypeLabel(type)}
            </Badge>
            {isArchived ? <Badge tone="closed">Archived</Badge> : <Badge tone="open">Active</Badge>}
            <Can permissions={["users.manage", "billing.manage"]} mode="any">
              <ClientEmailButton clientId={client.id} defaultEmail={client.email} />
            </Can>
            <Can permission="clients.edit">
              <Link href={`/clients/${client.id}/edit`} className="btn btn-outline btn-sm">
                Edit KYC
              </Link>
            </Can>
            <Can permission="clients.delete">
              <Button size="sm" variant="danger" onClick={onArchiveOrRestore} disabled={loading}>
                {loading
                  ? isArchived
                    ? "Restoring…"
                    : "Deleting…"
                  : isArchived
                    ? "Restore client"
                    : "Delete client"}
              </Button>
            </Can>
          </div>
        </div>

        <nav className="tabs client-detail-tabs" aria-label="Client sections">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="panel-body">
          {error ? <p className="error-text">{error}</p> : null}

          {tab === "overview" ? (
            <>
              <div className="card-grid">
                <div className="panel compact-panel">
                  <div className="muted">Client number</div>
                  <div className="stat-value">{client.clientNumber}</div>
                </div>
                <div className="panel compact-panel">
                  <div className="muted">Open matters</div>
                  <div className="stat-value">{matterCounts.open}</div>
                </div>
                <div className="panel compact-panel">
                  <div className="muted">KYC status</div>
                  <div className="stat-value">{kycStatusLabel}</div>
                </div>
              </div>
              <div className="grid-2">
                <DetailField label="Phone" value={client.phone} />
                <DetailField label="WhatsApp" value={client.whatsapp} />
                <DetailField label="Email" value={client.email} />
                <DetailField label="ID / registration" value={client.idNumber || client.nationalIdOrRegNumber} />
                <DetailField
                  label="Responsible lawyer"
                  value={client.responsibleLawyerName ?? "Unassigned"}
                />
              </div>
              {type === "individual" ? (
                <div className="grid-2">
                  <DetailField label="First name" value={client.firstName} />
                  <DetailField label="Surname" value={client.surname} />
                </div>
              ) : (
                <div className="grid-2">
                  <DetailField label="Registered name" value={client.registeredName || client.legalName} />
                  <DetailField label="Trading name" value={client.tradingName} />
                </div>
              )}
              <RelatedPartiesPanel scope="client" scopeId={client.id} />
            </>
          ) : null}

          {tab === "kyc" && canSeeKyc ? (
            <div className="kyc-readonly">
              <h4>Individual / entity</h4>
              {type === "individual" ? (
                <div className="grid-2">
                  <DetailField label="First name" value={client.firstName} />
                  <DetailField label="Surname" value={client.surname} />
                  <DetailField label="Other names" value={client.otherNames} />
                  <DetailField label="Date of birth" value={client.dateOfBirth} />
                  <DetailField label="Nationality" value={client.nationality} />
                  <DetailField label="ID number" value={client.idNumber} />
                  <DetailField label="Occupation" value={client.occupation} />
                  <DetailField label="Employer" value={client.employer} />
                </div>
              ) : (
                <div className="grid-2">
                  <DetailField label="Registered name" value={client.registeredName} />
                  <DetailField label="Trading name" value={client.tradingName} />
                  <DetailField label="Reg / tax number" value={client.regTaxNumber || client.taxNumber} />
                  <DetailField label="Industry" value={client.industry} />
                  <DetailField label="Registered address" value={client.registeredAddress} block />
                  <DetailField label="Business address" value={client.businessAddress} block />
                </div>
              )}

              <h4>Matter and funds</h4>
              <DetailField label="Purpose" value={client.matterScopePurpose} block />
              <DetailField label="Source of funds" value={sourceLabel || client.sourceOfFundsOther} />
              <DetailField
                label="PEP"
                value={client.pepStatus ? client.pepDetails || "Yes" : "No"}
              />

              {client.uboJson.length > 0 ? (
                <>
                  <h4>Ultimate beneficial owners</h4>
                  <div className="table-wrap">
                    <table className="data-table compact">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Nationality</th>
                          <th>Control %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.uboJson.map((ubo, idx) => (
                          <tr key={idx}>
                            <td>{ubo.fullName}</td>
                            <td>{ubo.nationality ?? "—"}</td>
                            <td>{ubo.controlPct ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <h4>Declaration</h4>
              <div className="grid-2">
                <DetailField label="Signatory" value={client.declarationSignatory} />
                <DetailField label="Signed" value={client.declarationSignedAt} />
              </div>
              <DetailField label="Internal notes" value={client.kycNotes} block />
            </div>
          ) : null}

          {tab === "matters" ? (
            <>
              <div className="panel-head inline-head">
                <h4>Matters</h4>
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
                            <Link href={`/matters/${matter.id}`}>{matter.title}</Link>
                          </td>
                          <td>{matter.areaOfLaw}</td>
                          <td>{matter.statusLabel}</td>
                          <td>{matter.matterNumber ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {tab === "documents" ? <ClientDocumentsPanel clientId={client.id} /> : null}

          {tab === "billing" ? (
            <div className="client-link-panel">
              <p>Fee invoices and debtors for this client.</p>
              <Link
                href={`/finance/invoicing?clientId=${encodeURIComponent(client.id)}`}
                className="btn btn-outline btn-sm"
              >
                Open invoicing
              </Link>
              <Link
                href={`/finance/debtors?clientId=${encodeURIComponent(client.id)}`}
                className="btn btn-outline btn-sm"
              >
                View debtors
              </Link>
            </div>
          ) : null}

          {tab === "trust" ? (
            <div className="client-link-panel">
              <p>Trust ledger and client statement for {client.clientNumber}.</p>
              <Link href={`/finance/trust?clientId=${encodeURIComponent(client.id)}`} className="btn btn-outline btn-sm">
                Open trust desk
              </Link>
            </div>
          ) : null}

          <p className="muted footer-meta">
            Created {formatDate(client.createdAt)} · Updated {formatDate(client.updatedAt)}
          </p>
          <Link href="/clients" className="btn btn-outline btn-sm">
            Back to clients
          </Link>
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
  value: string | null | undefined;
  block?: boolean;
}) {
  return (
    <div className={`form-group${block ? " full-width" : ""}`}>
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

export { toClientKycFormValues as toClientFormValues } from "@/lib/clients/kyc-form-values";
