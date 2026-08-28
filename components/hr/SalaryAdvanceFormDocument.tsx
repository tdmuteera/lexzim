"use client";

import type { ReactNode } from "react";

export type StaffProfileOption = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  employeeNumber: string | null;
  grossSalaryCents: number | null;
  netSalaryCents: number | null;
};

export type SalaryAdvanceRecord = {
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
  status: string;
};

type CreateProps = {
  mode: "create";
  firmName: string;
  canPickStaff: boolean;
  staffOptions: StaffProfileOption[];
  staffProfileId: string;
  onStaffProfileIdChange: (id: string) => void;
  amountDollars: string;
  onAmountDollarsChange: (value: string) => void;
  amountInWords: string;
  onAmountInWordsChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
  applicationDate: string;
  onApplicationDateChange: (value: string) => void;
  declarationAccepted: boolean;
  onDeclarationAcceptedChange: (value: boolean) => void;
  previewBalanceCents: number;
  footer?: ReactNode;
};

type RecordProps = {
  mode: "record";
  firmName: string;
  record: SalaryAdvanceRecord;
  financeEditable?: boolean;
  financeGross: string;
  onFinanceGrossChange: (value: string) => void;
  financeNet: string;
  onFinanceNetChange: (value: string) => void;
  financeProposed: string;
  onFinanceProposedChange: (value: string) => void;
  financeMonthly: string;
  onFinanceMonthlyChange: (value: string) => void;
  financeMonths: string;
  onFinanceMonthsChange: (value: string) => void;
  financeNotes: string;
  onFinanceNotesChange: (value: string) => void;
  managementEditable?: boolean;
  decision: string;
  onDecisionChange: (value: string) => void;
  approvedAmount: string;
  onApprovedAmountChange: (value: string) => void;
  monthlyDeduction: string;
  onMonthlyDeductionChange: (value: string) => void;
  repaymentMonths: string;
  onRepaymentMonthsChange: (value: string) => void;
  effectiveDeductionDate: string;
  onEffectiveDeductionDateChange: (value: string) => void;
  managementComments: string;
  onManagementCommentsChange: (value: string) => void;
  financeActions?: ReactNode;
  managementActions?: ReactNode;
  footer?: ReactNode;
};

export type SalaryAdvanceFormDocumentProps = CreateProps | RecordProps;

function formatDisplayDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function positionDepartment(jobTitle: string | null, department: string | null) {
  if (jobTitle && department) return `${jobTitle} / ${department}`;
  return jobTitle ?? department ?? "—";
}

function dollarsFromCents(cents: number | null) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="hr-advance-form-section-title">{children}</h4>;
}

function ReadonlyValue({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["hr-advance-form-readonly", className].filter(Boolean).join(" ")}>{children}</div>;
}

function UsdInput({
  value,
  onChange,
  readOnly,
  required,
  min,
  step = "0.01",
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  min?: string;
  step?: string;
}) {
  return (
    <div className="hr-advance-form-usd">
      <span className="hr-advance-form-usd-prefix">USD $</span>
      {readOnly ? (
        <ReadonlyValue>{value ? value : "—"}</ReadonlyValue>
      ) : (
        <input
          className="filter-input"
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
        />
      )}
    </div>
  );
}

function DecisionRadios({
  value,
  onChange,
  readOnly,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const options = [
    { id: "approved", label: "APPROVED" },
    { id: "approved_subject_to_amendment", label: "APPROVED SUBJECT TO AMENDMENT" },
    { id: "not_approved", label: "NOT APPROVED" },
  ];
  if (readOnly) {
    if (!value) return <ReadonlyValue>—</ReadonlyValue>;
    const label =
      options.find((o) => o.id === value)?.label ??
      value.replace(/_/g, " ").toUpperCase();
    return <ReadonlyValue>{label}</ReadonlyValue>;
  }
  return (
    <div className="hr-advance-form-decision-options">
      {options.map((opt) => (
        <label key={opt.id} className="hr-advance-form-decision-option">
          <input
            type="radio"
            name="advance-decision"
            value={opt.id}
            checked={value === opt.id}
            onChange={() => onChange?.(opt.id)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export function SalaryAdvanceFormDocument(props: SalaryAdvanceFormDocumentProps) {
  const firmName = props.firmName.trim() || "Firm";

  const selectedStaff =
    props.mode === "create"
      ? props.staffOptions.find((s) => s.id === props.staffProfileId)
      : null;

  const employeeName =
    props.mode === "create"
      ? selectedStaff?.fullName ?? "—"
      : props.record.employeeName;

  const positionDept =
    props.mode === "create"
      ? positionDepartment(selectedStaff?.jobTitle ?? null, selectedStaff?.department ?? null)
      : positionDepartment(props.record.positionTitle, props.record.department);

  const employeeNumber =
    props.mode === "create"
      ? selectedStaff?.employeeNumber ?? "—"
      : props.record.employeeNumber ?? "—";

  const applicationDateDisplay =
    props.mode === "create"
      ? formatDisplayDate(props.applicationDate ? `${props.applicationDate}T12:00:00` : null)
      : formatDisplayDate(props.record.applicationDate);

  const grossCents =
    props.mode === "create"
      ? selectedStaff?.grossSalaryCents ?? null
      : props.record.grossSalaryCents;

  const netCents =
    props.mode === "create"
      ? selectedStaff?.netSalaryCents ?? null
      : props.record.netSalaryCents;

  const existingBalance =
    props.mode === "create"
      ? props.previewBalanceCents
      : props.record.existingAdvanceBalanceCents;

  const importantNote = `Approval of a salary advance is at the discretion of ${firmName} management and is subject to the Firm's internal policies, the employee's salary and existing deductions and applicable employment legislation. Submission of this form does not constitute an entitlement to a salary advance. The approved advance and repayment arrangement shall be confirmed in writing by the Firm before payment is made.`;

  return (
    <div className="hr-advance-form" aria-label="Salary advance request form">
      <header className="hr-advance-form-header">
        <div className="hr-advance-form-firm">{firmName.toUpperCase()}</div>
        <div className="hr-advance-form-title">SALARY ADVANCE REQUEST FORM</div>
      </header>

      <section className="hr-advance-form-section">
        <SectionTitle>1. EMPLOYEE DETAILS</SectionTitle>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Employee Name</label>
            {props.mode === "create" && props.canPickStaff ? (
              <select
                className="filter-select"
                value={props.staffProfileId}
                onChange={(e) => props.onStaffProfileIdChange(e.target.value)}
                required
              >
                <option value="">Select employee…</option>
                {props.staffOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.fullName}</option>
                ))}
              </select>
            ) : (
              <ReadonlyValue>{employeeName}</ReadonlyValue>
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Position / Department</label>
            <ReadonlyValue>{positionDept}</ReadonlyValue>
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Employee Number</label>
            <ReadonlyValue>{employeeNumber}</ReadonlyValue>
          </div>
          <div className="hr-advance-form-field">
            <label>Date of Application</label>
            {props.mode === "create" ? (
              <input
                className="filter-input"
                type="date"
                value={props.applicationDate}
                onChange={(e) => props.onApplicationDateChange(e.target.value)}
              />
            ) : (
              <ReadonlyValue>{applicationDateDisplay}</ReadonlyValue>
            )}
          </div>
        </div>
      </section>

      <section className="hr-advance-form-section">
        <SectionTitle>2. SALARY ADVANCE REQUEST</SectionTitle>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Amount Requested (USD)</label>
            {props.mode === "create" ? (
              <UsdInput
                value={props.amountDollars}
                onChange={props.onAmountDollarsChange}
                required
                min="0.01"
              />
            ) : (
              <UsdInput value={dollarsFromCents(props.record.amountCents)} readOnly />
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Amount in Words</label>
            {props.mode === "create" ? (
              <input
                className="filter-input"
                value={props.amountInWords}
                onChange={(e) => props.onAmountInWordsChange(e.target.value)}
              />
            ) : (
              <ReadonlyValue>{props.record.amountInWords ?? "—"}</ReadonlyValue>
            )}
          </div>
        </div>
        <div className="hr-advance-form-row full">
          <div className="hr-advance-form-field">
            <label>Reason for Salary Advance</label>
            {props.mode === "create" ? (
              <textarea
                className="filter-input"
                rows={4}
                value={props.reason}
                onChange={(e) => props.onReasonChange(e.target.value)}
              />
            ) : (
              <ReadonlyValue>{props.record.reason ?? "—"}</ReadonlyValue>
            )}
          </div>
        </div>
      </section>

      <section className="hr-advance-form-section">
        <SectionTitle>3. EMPLOYEE DECLARATION</SectionTitle>
        <p className="hr-advance-form-declaration">
          I confirm that the information provided in this application is true and correct. I
          understand and agree that, once approved, the salary advance will constitute an amount
          owing to {firmName} and will be recovered from my salary in accordance with the approved
          repayment arrangement. I authorise the Firm to make the approved deductions from my
          salary. I further understand that any outstanding balance may become immediately due and
          payable upon termination of my employment, subject to applicable law and the Firm&apos;s
          policies.
        </p>
        <div className="hr-advance-form-important">
          <strong>*IMPORTANT NOTE</strong>
          {importantNote}
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Employee Name</label>
            <ReadonlyValue>{employeeName}</ReadonlyValue>
          </div>
          <div className="hr-advance-form-field">
            <label>Signature</label>
            {props.mode === "create" ? (
              <ReadonlyValue className="hr-advance-form-signature-hint">
                Electronic acceptance on submit below
              </ReadonlyValue>
            ) : (
              <ReadonlyValue>
                {props.record.declarationAcceptedAt
                  ? `Accepted electronically · ${formatDisplayDate(props.record.declarationAcceptedAt)}`
                  : "—"}
              </ReadonlyValue>
            )}
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Date</label>
            <ReadonlyValue>
              {props.mode === "create" ? applicationDateDisplay : applicationDateDisplay}
            </ReadonlyValue>
          </div>
          {props.mode === "create" ? (
            <div className="hr-advance-form-field">
              <label className="hr-checkbox-row" style={{ marginTop: "1.5rem" }}>
                <input
                  type="checkbox"
                  checked={props.declarationAccepted}
                  onChange={(e) => props.onDeclarationAcceptedChange(e.target.checked)}
                  required
                />
                <span>I accept the employee declaration above</span>
              </label>
            </div>
          ) : null}
        </div>
      </section>

      <section className="hr-advance-form-section hr-advance-form-admin">
        <SectionTitle>4. FOR ADMINISTRATION / FINANCE USE</SectionTitle>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Employee&apos;s Gross Salary</label>
            {props.mode === "record" && props.financeEditable ? (
              <UsdInput value={props.financeGross} onChange={props.onFinanceGrossChange} />
            ) : (
              <UsdInput value={dollarsFromCents(grossCents)} readOnly />
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Employee&apos;s Net Salary</label>
            {props.mode === "record" && props.financeEditable ? (
              <UsdInput value={props.financeNet} onChange={props.onFinanceNetChange} />
            ) : (
              <UsdInput value={dollarsFromCents(netCents)} readOnly />
            )}
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Existing Salary Advance Balance</label>
            <UsdInput value={dollarsFromCents(existingBalance)} readOnly />
          </div>
          <div className="hr-advance-form-field">
            <label>Proposed Advance</label>
            {props.mode === "record" && props.financeEditable ? (
              <UsdInput value={props.financeProposed} onChange={props.onFinanceProposedChange} />
            ) : (
              <UsdInput
                value={
                  props.mode === "record"
                    ? dollarsFromCents(
                        props.record.proposedAdvanceCents ?? props.record.amountCents,
                      )
                    : props.mode === "create"
                      ? props.amountDollars
                      : ""
                }
                readOnly
              />
            )}
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Proposed Monthly Deduction</label>
            {props.mode === "record" && props.financeEditable ? (
              <UsdInput value={props.financeMonthly} onChange={props.onFinanceMonthlyChange} />
            ) : (
              <UsdInput
                value={dollarsFromCents(
                  props.mode === "record" ? props.record.proposedMonthlyDeductionCents : null,
                )}
                readOnly
              />
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Recommended Repayment Period</label>
            {props.mode === "record" && props.financeEditable ? (
              <div className="hr-advance-form-period">
                <input
                  className="filter-input"
                  type="number"
                  min={1}
                  value={props.financeMonths}
                  onChange={(e) => props.onFinanceMonthsChange(e.target.value)}
                />
                <span className="hr-advance-form-period-suffix">Month(s)</span>
              </div>
            ) : (
              <ReadonlyValue>
                {props.mode === "record" && props.record.recommendedMonths != null
                  ? `${props.record.recommendedMonths} Month(s)`
                  : "—"}
              </ReadonlyValue>
            )}
          </div>
        </div>
        <div className="hr-advance-form-row full">
          <div className="hr-advance-form-field">
            <label>Prepared / Checked By</label>
            <ReadonlyValue>
              {props.mode === "record"
                ? props.record.preparedByName ??
                  (props.record.financeReviewedAt ? "Recorded in system" : "—")
                : "—"}
            </ReadonlyValue>
          </div>
        </div>
        {props.mode === "record" && props.financeEditable ? (
          <div className="hr-advance-form-row full">
            <div className="hr-advance-form-field">
              <label>Finance notes</label>
              <textarea
                className="filter-input"
                rows={2}
                value={props.financeNotes}
                onChange={(e) => props.onFinanceNotesChange(e.target.value)}
              />
            </div>
          </div>
        ) : props.mode === "record" && props.record.financeNotes ? (
          <div className="hr-advance-form-row full">
            <div className="hr-advance-form-field">
              <label>Finance notes</label>
              <ReadonlyValue>{props.record.financeNotes}</ReadonlyValue>
            </div>
          </div>
        ) : null}
        {props.mode === "record" && props.financeEditable && props.financeActions ? (
          <div className="hr-form-actions">{props.financeActions}</div>
        ) : null}
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Signature</label>
            <ReadonlyValue>
              {props.mode === "record" && props.record.financeReviewedAt
                ? formatDisplayDate(props.record.financeReviewedAt)
                : "—"}
            </ReadonlyValue>
          </div>
          <div className="hr-advance-form-field">
            <label>Date</label>
            <ReadonlyValue>
              {props.mode === "record" && props.record.financeReviewedAt
                ? formatDisplayDate(props.record.financeReviewedAt)
                : "—"}
            </ReadonlyValue>
          </div>
        </div>
      </section>

      <section className="hr-advance-form-section">
        <SectionTitle>5. MANAGEMENT APPROVAL</SectionTitle>
        <div className="hr-advance-form-field">
          <label>Decision</label>
          <DecisionRadios
            value={
              props.mode === "record"
                ? props.managementEditable
                  ? props.decision
                  : props.record.decision ?? ""
                : ""
            }
            onChange={
              props.mode === "record" && props.managementEditable
                ? props.onDecisionChange
                : undefined
            }
            readOnly={props.mode === "create" || !props.managementEditable}
          />
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Approved Salary Advance</label>
            {props.mode === "record" && props.managementEditable ? (
              <UsdInput value={props.approvedAmount} onChange={props.onApprovedAmountChange} />
            ) : (
              <UsdInput
                value={dollarsFromCents(
                  props.mode === "record" ? props.record.approvedAmountCents : null,
                )}
                readOnly
              />
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Approved Monthly Deduction</label>
            {props.mode === "record" && props.managementEditable ? (
              <UsdInput value={props.monthlyDeduction} onChange={props.onMonthlyDeductionChange} />
            ) : (
              <UsdInput
                value={dollarsFromCents(
                  props.mode === "record" ? props.record.monthlyDeductionCents : null,
                )}
                readOnly
              />
            )}
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Approved Repayment Period</label>
            {props.mode === "record" && props.managementEditable ? (
              <div className="hr-advance-form-period">
                <input
                  className="filter-input"
                  type="number"
                  min={1}
                  value={props.repaymentMonths}
                  onChange={(e) => props.onRepaymentMonthsChange(e.target.value)}
                />
                <span className="hr-advance-form-period-suffix">months</span>
              </div>
            ) : (
              <ReadonlyValue>
                {props.mode === "record" && props.record.repaymentMonths != null
                  ? `${props.record.repaymentMonths} months`
                  : "—"}
              </ReadonlyValue>
            )}
          </div>
          <div className="hr-advance-form-field">
            <label>Effective Date of Deduction</label>
            {props.mode === "record" && props.managementEditable ? (
              <input
                className="filter-input"
                type="date"
                value={props.effectiveDeductionDate}
                onChange={(e) => props.onEffectiveDeductionDateChange(e.target.value)}
              />
            ) : (
              <ReadonlyValue>
                {props.mode === "record"
                  ? formatDisplayDate(props.record.effectiveDeductionDate)
                  : "—"}
              </ReadonlyValue>
            )}
          </div>
        </div>
        <div className="hr-advance-form-row full">
          <div className="hr-advance-form-field">
            <label>Comments / Conditions</label>
            {props.mode === "record" && props.managementEditable ? (
              <textarea
                className="filter-input"
                rows={2}
                value={props.managementComments}
                onChange={(e) => props.onManagementCommentsChange(e.target.value)}
              />
            ) : (
              <ReadonlyValue>
                {props.mode === "record" ? props.record.managementComments ?? "—" : "—"}
              </ReadonlyValue>
            )}
          </div>
        </div>
        {props.mode === "record" && props.managementEditable && props.managementActions ? (
          <div className="hr-form-actions">{props.managementActions}</div>
        ) : null}
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Authorised By</label>
            <ReadonlyValue>
              {props.mode === "record" && props.record.decidedAt ? "Recorded in system" : "—"}
            </ReadonlyValue>
          </div>
          <div className="hr-advance-form-field">
            <label>Designation</label>
            <ReadonlyValue>—</ReadonlyValue>
          </div>
        </div>
        <div className="hr-advance-form-row">
          <div className="hr-advance-form-field">
            <label>Signature</label>
            <ReadonlyValue>
              {props.mode === "record" && props.record.decidedAt
                ? formatDisplayDate(props.record.decidedAt)
                : "—"}
            </ReadonlyValue>
          </div>
          <div className="hr-advance-form-field">
            <label>Date</label>
            <ReadonlyValue>
              {props.mode === "record" ? formatDisplayDate(props.record.decidedAt) : "—"}
            </ReadonlyValue>
          </div>
        </div>
      </section>

      {props.footer ? <div className="hr-advance-form-footer">{props.footer}</div> : null}
    </div>
  );
}
