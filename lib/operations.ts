/**
 * Operational maths for the Resource Manager side of the job: approvals sitting
 * with someone, invoices waiting to be approved or paid, and the chasing that
 * holds it all together.
 *
 * The deliberate design point here is that nothing is a status field alone.
 * Every state carries an "as at" date, so the app can always answer the only
 * question that matters in a manual process: how long has this been stuck, and
 * with whom.
 */

import { daysBetween, daysUntil, parseDate, today } from "./calc";
import {
  AppData,
  Approval,
  ApprovalState,
  Chase,
  Invoice,
  InvoiceStatus,
  Settings,
  Variation,
} from "./types";

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const APPROVAL_KIND_LABELS: Record<string, string> = {
  "new-engagement": "New engagement",
  extension: "Extension",
  "rate-change": "Rate change",
  "hours-change": "Hours change",
  "scope-change": "Scope change",
  "po-increase": "PO increase",
  "early-termination": "Early termination",
};

export const APPROVAL_STATE_LABELS: Record<ApprovalState, string> = {
  draft: "Draft",
  submitted: "Submitted",
  "with-approver": "With approver",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  expected: "Expected",
  received: "Received",
  "with-approver": "With approver",
  approved: "Approved",
  paid: "Paid",
  disputed: "Disputed",
  "on-hold": "On hold",
};

export const VARIATION_TYPE_LABELS: Record<string, string> = {
  extension: "Extension",
  "rate-change": "Rate change",
  "hours-change": "Hours change",
  "scope-change": "Scope change",
  "early-termination": "Early termination",
};

/** Approval states that are still consuming somebody's attention. */
export const OPEN_APPROVAL_STATES: ApprovalState[] = [
  "draft",
  "submitted",
  "with-approver",
];

export function isApprovalOpen(a: Approval): boolean {
  return OPEN_APPROVAL_STATES.includes(a.state);
}

/** Invoice statuses that still owe somebody money or an action. */
export const OPEN_INVOICE_STATUSES: InvoiceStatus[] = [
  "expected",
  "received",
  "with-approver",
  "approved",
  "disputed",
  "on-hold",
];

export function isInvoiceOpen(i: Invoice): boolean {
  return OPEN_INVOICE_STATUSES.includes(i.status);
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

/** Calendar days the approval has been sitting with the current approver. */
export function daysWithApprover(a: Approval): number | null {
  if (!isApprovalOpen(a)) return null;
  const since = parseDate(a.withApproverSince || a.raisedOn);
  if (!since) return null;
  return Math.max(0, daysBetween(since, today()));
}

/** Total days since the approval was first raised, whatever has happened since. */
export function approvalAge(a: Approval): number | null {
  const raised = parseDate(a.raisedOn);
  if (!raised) return null;
  return Math.max(0, daysBetween(raised, today()));
}

export function approvalIsStalled(a: Approval, s: Settings): boolean {
  const days = daysWithApprover(a);
  return days !== null && days >= s.approvalChaseAfterDays;
}

/** Days until the decision is actually needed. Negative means it is late. */
export function approvalDaysToDeadline(a: Approval): number | null {
  if (!a.requiredBy || !isApprovalOpen(a)) return null;
  return daysUntil(a.requiredBy);
}

export function lastChase(chases: Chase[]): Chase | null {
  if (!chases.length) return null;
  return [...chases].sort((x, y) => y.date.localeCompare(x.date))[0];
}

export function daysSinceLastChase(chases: Chase[]): number | null {
  const last = lastChase(chases);
  if (!last) return null;
  const d = parseDate(last.date);
  if (!d) return null;
  return Math.max(0, daysBetween(d, today()));
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export function invoiceGst(i: Invoice, s: Settings): number {
  return i.amountExGst * s.gstRate;
}

export function invoiceTotal(i: Invoice, s: Settings): number {
  return i.amountExGst * (1 + s.gstRate);
}

/** Days the invoice has been waiting for internal approval. */
export function daysAwaitingApproval(i: Invoice): number | null {
  if (i.status !== "with-approver" && i.status !== "received") return null;
  const from = parseDate(i.sentForApprovalOn || i.receivedOn);
  if (!from) return null;
  return Math.max(0, daysBetween(from, today()));
}

/** Negative means overdue. Null when the invoice is already paid or not yet real. */
export function daysToPaymentDue(i: Invoice): number | null {
  if (i.status === "paid" || i.status === "expected") return null;
  if (!i.dueDate) return null;
  return daysUntil(i.dueDate);
}

export function invoiceIsOverdue(i: Invoice): boolean {
  const d = daysToPaymentDue(i);
  return d !== null && d < 0;
}

export function invoiceApprovalBreached(i: Invoice, s: Settings): boolean {
  const d = daysAwaitingApproval(i);
  return d !== null && d >= s.invoiceApprovalSlaDays;
}

/**
 * An expected invoice whose period ended some time ago and which still has not
 * turned up. In a manual process this is the one that silently rolls into the
 * next month and wrecks the accrual.
 */
export function invoiceIsMissing(i: Invoice, s: Settings): boolean {
  if (i.status !== "expected") return false;
  const end = parseDate(i.periodEnd);
  if (!end) return false;
  return daysBetween(end, today()) >= s.invoiceExpectedAfterDays;
}

/** Standard ageing buckets, measured from the payment due date. */
export type AgeingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function ageingBucket(i: Invoice): AgeingBucket {
  const d = daysToPaymentDue(i);
  if (d === null || d >= 0) return "current";
  const overdue = Math.abs(d);
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";
  return "90+";
}

export const AGEING_ORDER: AgeingBucket[] = [
  "current",
  "1-30",
  "31-60",
  "61-90",
  "90+",
];

export interface AgeingRow {
  bucket: AgeingBucket;
  count: number;
  amountExGst: number;
}

export function ageingSummary(data: AppData): AgeingRow[] {
  const rows = new Map<AgeingBucket, AgeingRow>(
    AGEING_ORDER.map((b) => [b, { bucket: b, count: 0, amountExGst: 0 }])
  );
  for (const i of data.invoices) {
    if (i.status === "paid" || i.status === "expected") continue;
    const row = rows.get(ageingBucket(i))!;
    row.count += 1;
    row.amountExGst += i.amountExGst;
  }
  return AGEING_ORDER.map((b) => rows.get(b)!);
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

export interface InvoicePosition {
  /** Received but not yet approved. */
  awaitingApprovalCount: number;
  awaitingApprovalValue: number;
  /** Approved but not yet paid. */
  awaitingPaymentCount: number;
  awaitingPaymentValue: number;
  overdueCount: number;
  overdueValue: number;
  disputedCount: number;
  disputedValue: number;
  missingCount: number;
  missingValue: number;
  paidThisMonthValue: number;
  slaBreachCount: number;
}

export function invoicePosition(data: AppData): InvoicePosition {
  const s = data.settings;
  const now = today();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const pos: InvoicePosition = {
    awaitingApprovalCount: 0,
    awaitingApprovalValue: 0,
    awaitingPaymentCount: 0,
    awaitingPaymentValue: 0,
    overdueCount: 0,
    overdueValue: 0,
    disputedCount: 0,
    disputedValue: 0,
    missingCount: 0,
    missingValue: 0,
    paidThisMonthValue: 0,
    slaBreachCount: 0,
  };

  for (const i of data.invoices) {
    if (i.status === "received" || i.status === "with-approver") {
      pos.awaitingApprovalCount += 1;
      pos.awaitingApprovalValue += i.amountExGst;
      if (invoiceApprovalBreached(i, s)) pos.slaBreachCount += 1;
    }
    if (i.status === "approved") {
      pos.awaitingPaymentCount += 1;
      pos.awaitingPaymentValue += i.amountExGst;
    }
    if (invoiceIsOverdue(i)) {
      pos.overdueCount += 1;
      pos.overdueValue += i.amountExGst;
    }
    if (i.status === "disputed" || i.status === "on-hold") {
      pos.disputedCount += 1;
      pos.disputedValue += i.amountExGst;
    }
    if (invoiceIsMissing(i, s)) {
      pos.missingCount += 1;
      pos.missingValue += i.amountExGst;
    }
    if (i.status === "paid" && i.paidOn >= monthStart) {
      pos.paidThisMonthValue += i.amountExGst;
    }
  }
  return pos;
}

export interface ApprovalPosition {
  openCount: number;
  openValue: number;
  stalledCount: number;
  lateCount: number;
  oldestDays: number;
  byApprover: Array<{ approver: string; count: number; oldestDays: number; value: number }>;
}

export function approvalPosition(data: AppData): ApprovalPosition {
  const s = data.settings;
  const open = data.approvals.filter(isApprovalOpen);
  const byApprover = new Map<
    string,
    { approver: string; count: number; oldestDays: number; value: number }
  >();

  let oldest = 0;
  for (const a of open) {
    const days = daysWithApprover(a) ?? 0;
    oldest = Math.max(oldest, days);
    const key = a.currentApprover || "Unassigned";
    const row = byApprover.get(key) ?? {
      approver: key,
      count: 0,
      oldestDays: 0,
      value: 0,
    };
    row.count += 1;
    row.oldestDays = Math.max(row.oldestDays, days);
    row.value += a.value ?? 0;
    byApprover.set(key, row);
  }

  return {
    openCount: open.length,
    openValue: open.reduce((sum, a) => sum + (a.value ?? 0), 0),
    stalledCount: open.filter((a) => approvalIsStalled(a, s)).length,
    lateCount: open.filter((a) => {
      const d = approvalDaysToDeadline(a);
      return d !== null && d < 0;
    }).length,
    oldestDays: oldest,
    byApprover: Array.from(byApprover.values()).sort(
      (a, b) => b.oldestDays - a.oldestDays
    ),
  };
}

/** Invoiced total for one contractor, whatever the status. */
export function invoicedTotal(data: AppData, contractorId: string): number {
  return data.invoices
    .filter((i) => i.contractorId === contractorId && i.status !== "expected")
    .reduce((sum, i) => sum + i.amountExGst, 0);
}

/** Actually paid, which is the figure Finance will recognise. */
export function paidTotal(data: AppData, contractorId: string): number {
  return data.invoices
    .filter((i) => i.contractorId === contractorId && i.status === "paid")
    .reduce((sum, i) => sum + i.amountExGst, 0);
}

export function variationsFor(data: AppData, contractorId: string): Variation[] {
  return data.variations
    .filter((v) => v.contractorId === contractorId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

export function approvalsFor(data: AppData, contractorId: string): Approval[] {
  return data.approvals
    .filter((a) => a.contractorId === contractorId)
    .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn));
}

export function invoicesFor(data: AppData, contractorId: string): Invoice[] {
  return data.invoices
    .filter((i) => i.contractorId === contractorId)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

/**
 * Payment due date from the vendor's terms, or the default. Exposed so the UI
 * can suggest a date rather than making the user work it out.
 */
export function suggestedDueDate(
  data: AppData,
  invoice: Invoice
): string | null {
  const received = parseDate(invoice.receivedOn);
  if (!received) return null;
  const vendor = data.vendors.find((v) => v.id === invoice.vendorId);
  const terms = vendor?.paymentTermsDays ?? data.settings.defaultPaymentTermsDays;
  const due = new Date(
    received.getFullYear(),
    received.getMonth(),
    received.getDate() + terms
  );
  const m = `${due.getMonth() + 1}`.padStart(2, "0");
  const d = `${due.getDate()}`.padStart(2, "0");
  return `${due.getFullYear()}-${m}-${d}`;
}
