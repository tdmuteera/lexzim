"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { HrAccessCallout } from "@/components/hr/HrAccessCallout";
import { HrPageShell } from "@/components/hr/HrPageShell";
import { HrStatStrip } from "@/components/hr/HrStatStrip";
import {
  SalaryAdvanceFormDocument,
  type StaffProfileOption,
} from "@/components/hr/SalaryAdvanceFormDocument";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { centsToDisplay, dollarsToCents } from "@/lib/billing/money";

type AdvanceItem = {
  id: string;
  staffProfileId: string;
  staffName: string;
  employeeName: string;
  positionTitle: string | null;
  department: string | null;
  employeeNumber: string | null;
  applicationDate: string;
  amountCents: number;
  amountInWords: string | null;
  reason: string | null;
  declarationAcceptedAt: string | null;
  grossSalaryCents: number | null;
  netSalaryCents: number | null;
  existingAdvanceBalanceCents: number;
  proposedAdvanceCents: number | null;
  proposedMonthlyDeductionCents: number | null;
  recommendedMonths: number | null;
  preparedByName: string | null;
  financeNotes: string | null;
  financeReviewedAt: string | null;
  decision: string | null;
  approvedAmountCents: number | null;
  monthlyDeductionCents: number | null;
  repaymentMonths: number | null;
  effectiveDeductionDate: string | null;
  managementComments: string | null;
  decidedAt: string | null;
  balanceRemainingCents: number;
  status: string;
  createdAt: string;
};

const STATUSES = [
  "submitted",
  "finance_reviewed",
  "decided",
  "paid",
  "closed",
] as const;

function statusTone(status: string) {
  if (status === "paid" || status === "closed") return "open" as const;
  if (status === "submitted" || status === "finance_reviewed") return "pending" as const;
  if (status === "decided") return "open" as const;
  return "closed" as const;
}

function todayInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputFromIso(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function HrAdvancesView() {
  const { can, canAny, user } = useAuth();
  const canManage = can("hr.manage");
  const canDecide = canAny(["payroll.advance.approve", "hr.manage"]);

  const [items, setItems] = useState<AdvanceItem[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffProfileOption[]>([]);
  const [selfStaffProfileId, setSelfStaffProfileId] = useState<string | null>(null);
  const [previewBalanceCents, setPreviewBalanceCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [staffProfileId, setStaffProfileId] = useState("");
  const [amountDollars, setAmountDollars] = useState("");
  const [amountInWords, setAmountInWords] = useState("");
  const [reason, setReason] = useState("");
  const [applicationDate, setApplicationDate] = useState(todayInput);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  const [financeGross, setFinanceGross] = useState("");
  const [financeNet, setFinanceNet] = useState("");
  const [financeProposed, setFinanceProposed] = useState("");
  const [financeMonthly, setFinanceMonthly] = useState("");
  const [financeMonths, setFinanceMonths] = useState("");
  const [financeNotes, setFinanceNotes] = useState("");

  const [decision, setDecision] = useState("approved");
  const [approvedAmount, setApprovedAmount] = useState("");
  const [monthlyDeduction, setMonthlyDeduction] = useState("");
  const [repaymentMonths, setRepaymentMonths] = useState("");
  const [effectiveDeductionDate, setEffectiveDeductionDate] = useState("");
  const [managementComments, setManagementComments] = useState("");

  const firmName = user?.firm.name ?? "Firm";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const [advRes, staffRes] = await Promise.all([
        fetch(`/api/hr/salary-advances?${params.toString()}`, { credentials: "include" }),
        fetch("/api/hr/staff?activeOnly=1", { credentials: "include" }),
      ]);
      const advBody = (await advRes.json()) as {
        ok?: boolean;
        data?: { items: AdvanceItem[]; selfStaffProfileId: string | null };
        error?: { message: string };
      };
      const staffBody = (await staffRes.json()) as {
        ok?: boolean;
        data?: {
          items: Array<{
            id: string;
            fullName: string;
            jobTitle: string | null;
            department: string | null;
            employeeNumber: string | null;
            grossSalaryCents: number | null;
            netSalaryCents: number | null;
          }>;
        };
      };
      if (!advRes.ok || !advBody.ok || !advBody.data) {
        setError(advBody.error?.message ?? "Could not load salary advances.");
        return;
      }
      setItems(advBody.data.items);
      setSelfStaffProfileId(advBody.data.selfStaffProfileId);
      if (!staffProfileId && advBody.data.selfStaffProfileId) {
        setStaffProfileId(advBody.data.selfStaffProfileId);
      }
      if (staffRes.ok && staffBody.ok && staffBody.data) {
        setStaffOptions(
          staffBody.data.items.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            jobTitle: s.jobTitle,
            department: s.department,
            employeeNumber: s.employeeNumber,
            grossSalaryCents: s.grossSalaryCents,
            netSalaryCents: s.netSalaryCents,
          })),
        );
      }
    } catch {
      setError("Could not load salary advances.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, staffProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formOpen || !staffProfileId) {
      setPreviewBalanceCents(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/hr/salary-advances?staffProfileId=${encodeURIComponent(staffProfileId)}`,
          { credentials: "include" },
        );
        const body = (await res.json()) as {
          ok?: boolean;
          data?: { items: Array<{ balanceRemainingCents: number }> };
        };
        if (!cancelled && res.ok && body.ok && body.data) {
          setPreviewBalanceCents(
            body.data.items.reduce((sum, row) => sum + row.balanceRemainingCents, 0),
          );
        }
      } catch {
        if (!cancelled) setPreviewBalanceCents(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formOpen, staffProfileId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setFinanceGross(
      selected.grossSalaryCents != null ? String(selected.grossSalaryCents / 100) : "",
    );
    setFinanceNet(
      selected.netSalaryCents != null ? String(selected.netSalaryCents / 100) : "",
    );
    setFinanceProposed(
      selected.proposedAdvanceCents != null
        ? String(selected.proposedAdvanceCents / 100)
        : String(selected.amountCents / 100),
    );
    setFinanceMonthly(
      selected.proposedMonthlyDeductionCents != null
        ? String(selected.proposedMonthlyDeductionCents / 100)
        : "",
    );
    setFinanceMonths(
      selected.recommendedMonths != null ? String(selected.recommendedMonths) : "",
    );
    setFinanceNotes(selected.financeNotes ?? "");
    setApprovedAmount(
      selected.approvedAmountCents != null
        ? String(selected.approvedAmountCents / 100)
        : String((selected.proposedAdvanceCents ?? selected.amountCents) / 100),
    );
    setMonthlyDeduction(
      selected.monthlyDeductionCents != null
        ? String(selected.monthlyDeductionCents / 100)
        : selected.proposedMonthlyDeductionCents != null
          ? String(selected.proposedMonthlyDeductionCents / 100)
          : "",
    );
    setRepaymentMonths(
      selected.repaymentMonths != null
        ? String(selected.repaymentMonths)
        : selected.recommendedMonths != null
          ? String(selected.recommendedMonths)
          : "",
    );
    setManagementComments(selected.managementComments ?? "");
    setEffectiveDeductionDate(dateInputFromIso(selected.effectiveDeductionDate));
  }, [selected]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const amountCents = dollarsToCents(amountDollars);
      if (amountCents == null || amountCents <= 0) {
        setError("Enter a valid advance amount.");
        return;
      }
      const res = await fetch("/api/hr/salary-advances", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffProfileId,
          amountCents,
          amountInWords: amountInWords || null,
          reason: reason || null,
          applicationDate: applicationDate || null,
          declarationAccepted,
          declarationAcceptedAt: declarationAccepted ? new Date().toISOString() : null,
        }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not submit salary advance.");
        return;
      }
      setFormOpen(false);
      setAmountDollars("");
      setAmountInWords("");
      setReason("");
      setDeclarationAccepted(false);
      await load();
    } catch {
      setError("Could not submit salary advance.");
    } finally {
      setSaving(false);
    }
  }

  async function patchAction(id: string, payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/salary-advances/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !body.ok) {
        setError(body.error?.message ?? "Could not update salary advance.");
        return;
      }
      await load();
    } catch {
      setError("Could not update salary advance.");
    } finally {
      setSaving(false);
    }
  }

  const canSubmit =
    canManage || (selfStaffProfileId !== null && staffProfileId === selfStaffProfileId);

  const summaryStats = useMemo(() => {
    const submitted = items.filter((i) => i.status === "submitted").length;
    const outstanding = items.reduce((sum, i) => sum + i.balanceRemainingCents, 0);
    const paid = items.filter((i) => i.status === "paid" || i.status === "closed").length;
    return [
      { label: "Applications", value: loading ? "—" : items.length, icon: "AP" },
      { label: "Awaiting review", value: loading ? "—" : submitted, icon: "PD" },
      { label: "Outstanding balance", value: loading ? "—" : centsToDisplay(outstanding), icon: "BL" },
      { label: "Paid / closed", value: loading ? "—" : paid, icon: "OK" },
    ];
  }, [items, loading]);

  return (
    <HrPageShell
      title="Salary advances"
      subtitle="Request · finance check · discretionary approval · recovery"
      ariaLabel="Salary advances"
      actions={
        <>
          {(canManage || selfStaffProfileId) ? (
            <Button size="sm" onClick={() => setFormOpen(true)} disabled={loading}>
              Request advance
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </>
      }
      summary={<HrStatStrip stats={summaryStats} />}
    >
      <HrAccessCallout />
      <p className="muted hr-aging-note">Approval of salary advances is discretionary.</p>

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {formOpen ? (
        <form className="hr-advance-form-wrap" onSubmit={onSubmit}>
          <SalaryAdvanceFormDocument
            mode="create"
            firmName={firmName}
            canPickStaff={canManage}
            staffOptions={staffOptions}
            staffProfileId={staffProfileId}
            onStaffProfileIdChange={setStaffProfileId}
            amountDollars={amountDollars}
            onAmountDollarsChange={setAmountDollars}
            amountInWords={amountInWords}
            onAmountInWordsChange={setAmountInWords}
            reason={reason}
            onReasonChange={setReason}
            applicationDate={applicationDate}
            onApplicationDateChange={setApplicationDate}
            declarationAccepted={declarationAccepted}
            onDeclarationAcceptedChange={setDeclarationAccepted}
            previewBalanceCents={previewBalanceCents}
            footer={
              <div className="hr-form-actions">
                <Button type="submit" size="sm" disabled={saving || !canSubmit || !declarationAccepted}>
                  {saving ? "Submitting…" : "Submit request"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            }
          />
        </form>
      ) : null}

      <div className="hr-toolbar">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>

      {loading ? (
        <p className="hr-empty-loading">Loading advances…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No salary advances" />
      ) : (
        <div className="hr-table-wrap">
          <table className="data data-dense hr-data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="hr-cell-primary">{row.employeeName}</div>
                      {row.employeeNumber ? (
                        <div className="hr-cell-meta">{row.employeeNumber}</div>
                      ) : null}
                    </td>
                    <td>{centsToDisplay(row.amountCents)}</td>
                    <td>{centsToDisplay(row.balanceRemainingCents)}</td>
                    <td>
                      <Badge tone={statusTone(row.status)}>
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td>{row.decision?.replace(/_/g, " ") ?? "—"}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                      >
                        {selectedId === row.id ? "Hide" : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <SalaryAdvanceFormDocument
          mode="record"
          firmName={firmName}
          record={selected}
          financeEditable={
            canManage &&
            (selected.status === "submitted" || selected.status === "finance_reviewed")
          }
          financeGross={financeGross}
          onFinanceGrossChange={setFinanceGross}
          financeNet={financeNet}
          onFinanceNetChange={setFinanceNet}
          financeProposed={financeProposed}
          onFinanceProposedChange={setFinanceProposed}
          financeMonthly={financeMonthly}
          onFinanceMonthlyChange={setFinanceMonthly}
          financeMonths={financeMonths}
          onFinanceMonthsChange={setFinanceMonths}
          financeNotes={financeNotes}
          onFinanceNotesChange={setFinanceNotes}
          managementEditable={
            canDecide &&
            (selected.status === "submitted" || selected.status === "finance_reviewed")
          }
          decision={decision}
          onDecisionChange={setDecision}
          approvedAmount={approvedAmount}
          onApprovedAmountChange={setApprovedAmount}
          monthlyDeduction={monthlyDeduction}
          onMonthlyDeductionChange={setMonthlyDeduction}
          repaymentMonths={repaymentMonths}
          onRepaymentMonthsChange={setRepaymentMonths}
          effectiveDeductionDate={effectiveDeductionDate}
          onEffectiveDeductionDateChange={setEffectiveDeductionDate}
          managementComments={managementComments}
          onManagementCommentsChange={setManagementComments}
          financeActions={
            <Button
              size="sm"
              disabled={saving}
              onClick={() =>
                void patchAction(selected.id, {
                  action: "finance",
                  proposedAdvanceCents: dollarsToCents(financeProposed),
                  proposedMonthlyDeductionCents: dollarsToCents(financeMonthly),
                  recommendedMonths: financeMonths ? Number(financeMonths) : null,
                  financeNotes: financeNotes || null,
                  grossSalaryCents: dollarsToCents(financeGross),
                  netSalaryCents: dollarsToCents(financeNet),
                })
              }
            >
              Save finance review
            </Button>
          }
          managementActions={
            <Button
              size="sm"
              disabled={saving}
              onClick={() =>
                void patchAction(selected.id, {
                  action: "decide",
                  decision,
                  approvedAmountCents: dollarsToCents(approvedAmount),
                  monthlyDeductionCents: dollarsToCents(monthlyDeduction),
                  repaymentMonths: repaymentMonths ? Number(repaymentMonths) : null,
                  effectiveDeductionDate: effectiveDeductionDate || null,
                  managementComments: managementComments || null,
                })
              }
            >
              Record decision
            </Button>
          }
          footer={
            canManage &&
            selected.status === "decided" &&
            (selected.decision === "approved" ||
              selected.decision === "approved_subject_to_amendment")
              ? (
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => void patchAction(selected.id, { action: "mark_paid" })}
                >
                  Mark advance paid
                </Button>
              )
              : null
          }
        />
      ) : null}
    </HrPageShell>
  );
}
