import {
  addDays,
  daysUntil,
  fullName,
  isConsuming,
  parseDate,
  poBurnRatio,
  tenureMonths,
  toISO,
  today,
} from "./calc";
import { AppData, Reminder, ReminderStatus, ReminderType } from "./types";
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STATE_LABELS,
  INVOICE_STATUS_LABELS,
  approvalIsStalled,
  daysAwaitingApproval,
  daysSinceLastChase,
  daysWithApprover,
  invoiceApprovalBreached,
  invoiceIsMissing,
  invoiceIsOverdue,
  isApprovalOpen,
} from "./operations";

export interface ResolvedReminder extends Reminder {
  /** Stable key used to remember done/dismissed state for derived reminders. */
  key: string;
  daysOut: number | null;
  severity: "overdue" | "due" | "soon" | "later";
  subjectLabel: string;
}

function severityFor(daysOut: number | null): ResolvedReminder["severity"] {
  if (daysOut === null) return "later";
  if (daysOut < 0) return "overdue";
  if (daysOut <= 7) return "due";
  if (daysOut <= 30) return "soon";
  return "later";
}

function derivedKey(type: ReminderType, subjectId: string, dueDate: string) {
  return `${type}:${subjectId}:${dueDate}`;
}

/**
 * Reminders derived from the data itself. These are recomputed on every render
 * rather than stored, so they can never drift from the record. Only their
 * done/dismissed state is persisted, keyed by `derivedKey`.
 */
export function deriveReminders(data: AppData): ResolvedReminder[] {
  const s = data.settings;
  const out: ResolvedReminder[] = [];
  const now = today();

  const push = (
    type: ReminderType,
    subjectId: string,
    dueDate: string,
    title: string,
    detail: string,
    contractorId: string | null,
    vendorId: string | null,
    subjectLabel: string
  ) => {
    if (!dueDate) return;
    const key = derivedKey(type, subjectId, dueDate);
    const state = data.derivedState[key];
    const daysOut = daysUntil(dueDate);
    out.push({
      id: key,
      key,
      type,
      title,
      detail,
      dueDate,
      contractorId,
      vendorId,
      status: state?.status ?? "open",
      derived: true,
      owner: "",
      daysOut,
      severity: severityFor(daysOut),
      subjectLabel,
    });
  };

  for (const c of data.contractors) {
    const name = fullName(c);
    const vendor = data.vendors.find((v) => v.id === c.vendorId) ?? null;
    const via = vendor ? ` via ${vendor.name}` : " (direct)";

    if (isConsuming(c)) {
      const end = parseDate(c.endDate);
      if (end) {
        // Decision point: notice period ahead of the end date.
        const noticeDate = addDays(end, -Math.max(0, c.noticePeriodDays));
        push(
          "notice-decision",
          c.id,
          toISO(noticeDate),
          `Extend or release: ${name}`,
          `Contract ends ${c.endDate}. Notice period is ${c.noticePeriodDays} days, so the extend/release call needs making by this date${via}.`,
          c.id,
          c.vendorId,
          name
        );

        // The end date itself.
        push(
          "contract-end",
          c.id,
          c.endDate,
          `Contract end: ${name}`,
          `${c.role} in ${c.team}. Confirm final timesheet, invoice reconciliation and offboarding${via}.`,
          c.id,
          c.vendorId,
          name
        );

        // Offboarding kick-off, a fortnight out.
        const offboardStart = addDays(end, -14);
        if (offboardStart >= addDays(now, -365)) {
          push(
            "offboarding",
            c.id,
            toISO(offboardStart),
            `Start offboarding: ${name}`,
            "Raise account revocation, asset return and knowledge handover.",
            c.id,
            c.vendorId,
            name
          );
        }
      }

      const burn = poBurnRatio(c);
      if (burn !== null && burn >= s.poBurnWarnRatio) {
        push(
          "po-burn",
          c.id,
          toISO(now),
          `PO ${Math.round(burn * 100)}% consumed: ${name}`,
          `PO ${c.poNumber || "(unnumbered)"} is at ${Math.round(burn * 100)}% of value. Raise a variation before invoices bounce.`,
          c.id,
          c.vendorId,
          name
        );
      }

      const tenure = tenureMonths(c);
      if (tenure !== null && tenure >= s.maxTenureMonths) {
        push(
          "tenure-review",
          c.id,
          toISO(now),
          `Tenure review: ${name}`,
          `${tenure} months of continuous engagement, past the ${s.maxTenureMonths} month threshold. Review employment status, permanence case and contractor test.`,
          c.id,
          c.vendorId,
          name
        );
      }

      if (c.workRightsExpiry) {
        const warn = parseDate(c.workRightsExpiry);
        if (warn) {
          push(
            "work-rights",
            c.id,
            toISO(addDays(warn, -60)),
            `Work rights expiring: ${name}`,
            `${c.workRightsType || "Work rights"} expire ${c.workRightsExpiry}. Confirm renewal evidence before it lapses.`,
            c.id,
            c.vendorId,
            name
          );
        }
      }
    }

    if (c.status === "pipeline" || c.status === "onboarding") {
      for (const item of c.onboarding.filter((i) => !i.done && i.dueDate)) {
        push(
          "onboarding",
          `${c.id}|${item.task}`,
          item.dueDate,
          `Onboarding: ${item.task} — ${name}`,
          `Owner: ${item.owner || "unassigned"}. Start date ${c.startDate}.`,
          c.id,
          c.vendorId,
          name
        );
      }
    }

    // Offboarding checklist items only become actionable once the end is in
    // sight, otherwise every record would carry five standing reminders.
    const endDays = daysUntil(c.endDate);
    const offboardingLive =
      c.status === "notice" ||
      c.status === "ended" ||
      (isConsuming(c) && endDays !== null && endDays <= 30);
    for (const item of offboardingLive
      ? c.offboarding.filter((i) => !i.done && i.dueDate)
      : []) {
      push(
        "offboarding",
        `${c.id}|${item.task}`,
        item.dueDate,
        `Offboarding: ${item.task} — ${name}`,
        `Owner: ${item.owner || "unassigned"}. End date ${c.endDate}.`,
        c.id,
        c.vendorId,
        name
      );
    }
  }

  for (const v of data.vendors.filter((x) => x.active)) {
    if (v.msaExpiry) {
      push(
        "msa-expiry",
        v.id,
        toISO(addDays(parseDate(v.msaExpiry) ?? now, -90)),
        `MSA renewal: ${v.name}`,
        `Master agreement ${v.msaRef || ""} expires ${v.msaExpiry}. Start the renewal or retender conversation with ${v.accountManagerName || "the account manager"}.`,
        null,
        v.id,
        v.name
      );
    }
    const covers: Array<[string, string]> = [
      ["Professional indemnity", v.piInsuranceExpiry],
      ["Public liability", v.plInsuranceExpiry],
    ];
    for (const [label, expiry] of covers) {
      if (!expiry) continue;
      push(
        "insurance-expiry",
        `${v.id}|${label}`,
        toISO(addDays(parseDate(expiry) ?? now, -30)),
        `${label} certificate: ${v.name}`,
        `Cover expires ${expiry}. Request the updated certificate of currency before it lapses, or the engagement sits outside the MSA terms.`,
        null,
        v.id,
        v.name
      );
    }
  }

  for (const entry of data.comms.filter((e) => e.followUpDate)) {
    const c = data.contractors.find((x) => x.id === entry.contractorId) ?? null;
    const v = data.vendors.find((x) => x.id === entry.vendorId) ?? null;
    push(
      "comms-followup",
      entry.id,
      entry.followUpDate,
      `Follow up: ${entry.subject}`,
      `${entry.channel} on ${entry.date} with ${entry.participants || "—"}. ${entry.summary}`,
      entry.contractorId,
      entry.vendorId,
      c ? fullName(c) : v?.name ?? "—"
    );
  }

  // --- Approvals -----------------------------------------------------------

  for (const a of data.approvals.filter(isApprovalOpen)) {
    const c = data.contractors.find((x) => x.id === a.contractorId) ?? null;
    const label = c ? fullName(c) : "Unknown contractor";
    const waiting = daysWithApprover(a);
    const since = daysSinceLastChase(a.chases);

    if (approvalIsStalled(a, s)) {
      push(
        "approval-stalled",
        a.id,
        toISO(now),
        `Chase approval: ${APPROVAL_KIND_LABELS[a.kind] ?? a.kind} for ${label}`,
        `${a.reference || "No reference"} has been with ${a.currentApprover || "no named approver"}${a.currentApproverRole ? ` (${a.currentApproverRole})` : ""} for ${waiting} days, past the ${s.approvalChaseAfterDays} day threshold. ${
          since === null
            ? "Never chased."
            : `Last chased ${since} days ago.`
        }`,
        a.contractorId,
        c?.vendorId ?? null,
        label
      );
    }

    if (a.requiredBy) {
      push(
        "approval-deadline",
        a.id,
        a.requiredBy,
        `Approval needed by this date: ${label}`,
        `${APPROVAL_KIND_LABELS[a.kind] ?? a.kind}${a.value !== null ? `, value ${a.value.toLocaleString()}` : ""}. ${a.description || ""} Currently ${APPROVAL_STATE_LABELS[a.state].toLowerCase()}.`,
        a.contractorId,
        c?.vendorId ?? null,
        label
      );
    }
  }

  // --- Invoices ------------------------------------------------------------

  for (const i of data.invoices) {
    const c = data.contractors.find((x) => x.id === i.contractorId) ?? null;
    const v = data.vendors.find((x) => x.id === i.vendorId) ?? null;
    const label = c ? fullName(c) : v?.name ?? "Unknown";
    const ref = i.invoiceNumber || "(no number)";

    if (invoiceApprovalBreached(i, s)) {
      push(
        "invoice-approval",
        i.id,
        toISO(now),
        `Chase invoice approval: ${ref}`,
        `${label}. Sitting with ${i.approver || "no named approver"} for ${daysAwaitingApproval(i)} days, past the ${s.invoiceApprovalSlaDays} day service level. Period ${i.periodStart} to ${i.periodEnd}.`,
        i.contractorId,
        i.vendorId,
        label
      );
    }

    if (invoiceIsOverdue(i)) {
      push(
        "invoice-overdue",
        i.id,
        i.dueDate,
        `Payment overdue: ${ref}`,
        `${label}, ${v ? v.name : "direct"}. Due ${i.dueDate} and currently ${INVOICE_STATUS_LABELS[i.status].toLowerCase()}. Expect the agency to chase if you do not get there first.`,
        i.contractorId,
        i.vendorId,
        label
      );
    }

    if (invoiceIsMissing(i, s)) {
      push(
        "invoice-missing",
        i.id,
        toISO(now),
        `Invoice not received: ${label}`,
        `Period ended ${i.periodEnd} and nothing has arrived from ${v ? v.name : "the contractor"}. Chase it before it lands in the wrong accounting period.`,
        i.contractorId,
        i.vendorId,
        label
      );
    }

    if (i.status === "disputed" || i.status === "on-hold") {
      push(
        "invoice-disputed",
        i.id,
        toISO(now),
        `${i.status === "disputed" ? "Disputed" : "On hold"}: ${ref}`,
        `${label}. ${i.disputeReason || "No reason recorded, which is itself the problem."} Nothing moves until this is resolved.`,
        i.contractorId,
        i.vendorId,
        label
      );
    }
  }

  return out;
}

/** Derived reminders plus hand-entered ones, sorted by urgency. */
export function allReminders(data: AppData): ResolvedReminder[] {
  const manual: ResolvedReminder[] = data.reminders.map((r) => {
    const c = data.contractors.find((x) => x.id === r.contractorId) ?? null;
    const v = data.vendors.find((x) => x.id === r.vendorId) ?? null;
    const daysOut = daysUntil(r.dueDate);
    return {
      ...r,
      key: r.id,
      daysOut,
      severity: severityFor(daysOut),
      subjectLabel: c ? fullName(c) : v?.name ?? "—",
    };
  });

  return [...deriveReminders(data), ...manual].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    const ad = a.daysOut ?? 9999;
    const bd = b.daysOut ?? 9999;
    return ad - bd;
  });
}

export function openReminders(data: AppData): ResolvedReminder[] {
  return allReminders(data).filter((r) => r.status === "open");
}

export const REMINDER_LABELS: Record<ReminderType, string> = {
  "contract-end": "Contract end",
  "notice-decision": "Extend / release",
  "po-burn": "PO burn",
  "work-rights": "Work rights",
  "tenure-review": "Tenure",
  "msa-expiry": "MSA renewal",
  "insurance-expiry": "Insurance",
  "approval-stalled": "Approval stalled",
  "approval-deadline": "Approval deadline",
  "invoice-approval": "Invoice approval",
  "invoice-overdue": "Payment overdue",
  "invoice-missing": "Invoice missing",
  "invoice-disputed": "Invoice disputed",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  "comms-followup": "Follow-up",
  custom: "Custom",
};

export const STATUS_LABELS: Record<ReminderStatus, string> = {
  open: "Open",
  done: "Done",
  dismissed: "Dismissed",
};
