import {
  committedRemainingCost,
  effectiveHourlyRate,
  formatDate,
  formatMoney,
  fullName,
  poBurnRatio,
  tenureMonths,
} from "./calc";
import { AppData, Contractor, Vendor } from "./types";
import {
  APPROVAL_KIND_LABELS,
  INVOICE_STATUS_LABELS,
  approvalAge,
  daysAwaitingApproval,
  daysSinceLastChase,
  daysToPaymentDue,
  daysWithApprover,
  invoiceIsMissing,
  invoiceIsOverdue,
  invoiceTotal,
  isApprovalOpen,
  isInvoiceOpen,
} from "./operations";

export interface TemplateContext {
  data: AppData;
  contractor: Contractor | null;
  vendor: Vendor | null;
  senderName: string;
  senderRole: string;
  senderOrg: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  blurb: string;
  audience: "vendor" | "contractor" | "internal";
  /** True when the template needs a contractor selected. */
  needsContractor: boolean;
  needsVendor: boolean;
  subject: (ctx: TemplateContext) => string;
  /** Body blocks. Each entry is a paragraph, a bullet list or a table. */
  build: (ctx: TemplateContext) => Block[];
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "table"; rows: Array<[string, string]> }
  | { kind: "callout"; text: string };

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function recipient(ctx: TemplateContext, audience: EmailTemplate["audience"]) {
  if (audience === "vendor")
    return ctx.vendor?.accountManagerName?.split(" ")[0] || "there";
  if (audience === "contractor")
    return ctx.contractor
      ? (ctx.contractor.preferredName || ctx.contractor.firstName)
      : "there";
  return "team";
}

/** Renders a template into a standalone, email-client-safe HTML document. */
export function renderEmailHtml(
  template: EmailTemplate,
  ctx: TemplateContext
): string {
  const subject = template.subject(ctx);
  const blocks = template.build(ctx);
  const greeting = recipient(ctx, template.audience);

  const body = blocks
    .map((b) => {
      if (b.kind === "p")
        return `<p style="margin:0 0 14px;">${esc(b.text)}</p>`;
      if (b.kind === "callout")
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:#ece8ff;border-radius:10px;padding:12px 14px;font-size:14px;color:#3d3670;">${esc(
          b.text
        )}</td></tr></table>`;
      if (b.kind === "bullets")
        return `<ul style="margin:0 0 16px;padding-left:20px;">${b.items
          .map((i) => `<li style="margin:0 0 6px;">${esc(i)}</li>`)
          .join("")}</ul>`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;font-size:14px;">${b.rows
        .map(
          ([k, v], idx) =>
            `<tr><td style="padding:8px 12px;background:${
              idx % 2 ? "#ffffff" : "#f7f6ff"
            };color:#5f5c85;width:42%;border-bottom:1px solid #ebe8fa;">${esc(
              k
            )}</td><td style="padding:8px 12px;background:${
              idx % 2 ? "#ffffff" : "#f7f6ff"
            };font-weight:600;border-bottom:1px solid #ebe8fa;">${esc(v)}</td></tr>`
        )
        .join("")}</table>`;
    })
    .join("\n        ");

  return `<!doctype html>
<html lang="en-NZ">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f2f0fd;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e1b39;line-height:1.55;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(46,34,110,0.06);">
          <tr>
            <td style="background:#5b3ff5;padding:18px 24px;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-0.01em;">
              ${esc(ctx.senderOrg)} &middot; ${esc(ctx.data.settings.teamName)}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:14px;">
              <p style="margin:0 0 4px;font-size:12px;color:#9c99bb;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Subject</p>
              <p style="margin:0 0 20px;font-size:17px;font-weight:700;letter-spacing:-0.015em;">${esc(subject)}</p>
              <p style="margin:0 0 14px;">Hi ${esc(greeting)},</p>
              ${body}
              <p style="margin:0 0 4px;">Thanks,</p>
              <p style="margin:0;font-weight:600;">${esc(ctx.senderName)}</p>
              <p style="margin:0;color:#5f5c85;font-size:13px;">${esc(ctx.senderRole)}, ${esc(ctx.senderOrg)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:#f7f6ff;color:#9c99bb;font-size:11.5px;">
              Generated from Rostered, the contingent workforce register. Figures are indicative and subject to contract and PO confirmation.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Same content, flattened to plain text for a mailto: link. */
export function renderPlainText(
  template: EmailTemplate,
  ctx: TemplateContext
): string {
  const lines: string[] = [`Hi ${recipient(ctx, template.audience)},`, ""];
  for (const b of template.build(ctx)) {
    if (b.kind === "p" || b.kind === "callout") lines.push(b.text, "");
    else if (b.kind === "bullets") {
      lines.push(...b.items.map((i) => `- ${i}`), "");
    } else {
      lines.push(...b.rows.map(([k, v]) => `${k}: ${v}`), "");
    }
  }
  lines.push("Thanks,", ctx.senderName, `${ctx.senderRole}, ${ctx.senderOrg}`);
  return lines.join("\n");
}

const money = (n: number, ctx: TemplateContext) =>
  formatMoney(n, ctx.data.settings.currency);

function daysToEnd(iso: string): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - midnight) / 86400000);
}

function rateLine(c: Contractor, ctx: TemplateContext) {
  const basis = c.rateBasis === "hourly" ? "per hour" : "per day";
  return `${money(c.chargeRate, ctx)} ${basis} (effective ${money(
    effectiveHourlyRate(c, ctx.data.settings),
    ctx
  )}/hr)`;
}

export const TEMPLATES: EmailTemplate[] = [
  {
    id: "extension-request",
    name: "Extension request to agency",
    blurb:
      "Signals intent to extend, asks for a rate confirmation and a revised schedule. Send inside the notice window.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: true,
    subject: (ctx) =>
      `Extension request - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"} (${ctx.contractor?.contractRef || "contract ref TBC"})`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const tenure = tenureMonths(c);
      return [
        {
          kind: "p",
          text: `We would like to extend ${fullName(c)}'s engagement in the ${c.role} role with ${c.team}. The current contract ends on ${formatDate(c.endDate)} and the notice period is ${c.noticePeriodDays} days, so I need a confirmed position from your side before then.`,
        },
        {
          kind: "table",
          rows: [
            ["Contractor", fullName(c)],
            ["Role / team", `${c.role} - ${c.team}`],
            ["Contract reference", c.contractRef || "To be issued"],
            ["Current end date", formatDate(c.endDate)],
            ["Current charge rate", rateLine(c, ctx)],
            ["Contracted hours", `${c.hoursPerWeek} hours per week`],
            [
              "Continuous tenure",
              tenure === null ? "Unknown" : `${tenure} months`,
            ],
            ["Extensions to date", String(c.extensionCount)],
          ],
        },
        {
          kind: "p",
          text: "Please confirm the following so we can raise the paperwork:",
        },
        {
          kind: "bullets",
          items: [
            "The proposed extension end date and whether the contractor has confirmed availability",
            "Whether the charge rate is held or is subject to a review, with any increase itemised",
            "That professional indemnity and public liability cover remains current for the extended period",
            "That work rights evidence remains valid through the extended term",
          ],
        },
        {
          kind: "callout",
          text: "Any rate movement needs to reach us in writing before we commit. We cannot back-date a variation once invoices have been raised.",
        },
      ];
    },
  },
  {
    id: "non-extension",
    name: "Non-extension / end of engagement",
    blurb:
      "Confirms the engagement will end on the contracted date and sets out the exit steps.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Confirmation of end date - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      return [
        {
          kind: "p",
          text: `Thanks for the support on this engagement. I am writing to confirm that ${fullName(c)}'s assignment as ${c.role} will conclude on ${formatDate(c.endDate)} as contracted, and will not be extended.`,
        },
        {
          kind: "p",
          text: "This is not a reflection on the work delivered. The requirement itself is closing out.",
        },
        {
          kind: "bullets",
          items: [
            `Final working day: ${formatDate(c.endDate)}`,
            `Final timesheet to be submitted within 5 working days of the end date`,
            `Final invoice to reference PO ${c.poNumber || "(to be confirmed)"} and must not exceed the remaining PO value`,
            "All equipment and access cards to be returned to the IT service desk on or before the final day",
            "Knowledge handover to be completed with the hiring manager before the final week",
          ],
        },
        {
          kind: "p",
          text: `Accounts and privileged access will be revoked on ${formatDate(c.endDate)}. Please let me know immediately if any handover activity requires access beyond that date so we can arrange a short, time-boxed extension.`,
        },
      ];
    },
  },
  {
    id: "po-variation",
    name: "PO variation / burn warning",
    blurb:
      "Flags that the purchase order is close to exhausted and asks the vendor to hold invoicing until a variation is raised.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Purchase order variation required - ${ctx.contractor?.poNumber || "PO"} (${ctx.contractor ? fullName(ctx.contractor) : ""})`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const burn = poBurnRatio(c);
      return [
        {
          kind: "p",
          text: `Our records show that the purchase order covering ${fullName(c)} is close to fully consumed. I am raising a variation now so that invoicing is not interrupted.`,
        },
        {
          kind: "table",
          rows: [
            ["Purchase order", c.poNumber || "Not yet raised"],
            ["PO value", c.poValue ? money(c.poValue, ctx) : "Not set"],
            ["Invoiced to date", money(c.poSpentToDate, ctx)],
            [
              "Consumed",
              burn === null ? "Unknown" : `${Math.round(burn * 100)}%`,
            ],
            [
              "Remaining commitment to contract end",
              money(committedRemainingCost(c, ctx.data.settings), ctx),
            ],
            ["Contract end date", formatDate(c.endDate)],
          ],
        },
        {
          kind: "callout",
          text: "Please do not submit further invoices against this PO until the variation is issued. Invoices that exceed the PO value will be rejected by accounts payable and will delay payment.",
        },
        {
          kind: "p",
          text: "I will confirm the new PO number by return once finance has processed it.",
        },
      ];
    },
  },
  {
    id: "onboarding-chase",
    name: "Pre-start readiness chase",
    blurb:
      "Chases the outstanding pre-start items so day one is not wasted. Lists exactly what is still open.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Pre-start items outstanding - ${ctx.contractor ? fullName(ctx.contractor) : "new starter"} (start ${ctx.contractor ? formatDate(ctx.contractor.startDate) : "TBC"})`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const open = c.onboarding.filter((i) => !i.done);
      return [
        {
          kind: "p",
          text: `${fullName(c)} is due to start as ${c.role} on ${formatDate(c.startDate)}. The following items are still outstanding and will block a clean start.`,
        },
        open.length
          ? {
              kind: "bullets" as const,
              items: open.map(
                (i) =>
                  `${i.task}${i.owner ? ` (owner: ${i.owner})` : ""}${i.dueDate ? ` - due ${formatDate(i.dueDate)}` : ""}`
              ),
            }
          : {
              kind: "p" as const,
              text: "All checklist items are currently marked complete.",
            },
        {
          kind: "p",
          text: `Compliance status on file: employment status test ${c.statusTestCompleted ? "completed" : "NOT completed"}, background check ${c.backgroundCheckCompleted ? "cleared" : "NOT cleared"}, health and safety induction ${c.healthSafetyInducted ? "completed" : "NOT completed"}.`,
        },
        {
          kind: "callout",
          text: c.poNumber
            ? `Purchase order ${c.poNumber} is in place.`
            : "No purchase order has been raised yet. Invoices cannot be paid until it is, so please do not start work on the assumption that one exists.",
        },
      ];
    },
  },
  {
    id: "work-rights",
    name: "Work rights evidence request",
    blurb:
      "Requests renewed right-to-work evidence before the current entitlement lapses.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Right to work evidence required - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      return [
        {
          kind: "p",
          text: `Our register records ${fullName(c)}'s current entitlement as "${c.workRightsType || "not recorded"}", expiring ${formatDate(c.workRightsExpiry)}. The contracted end date is ${formatDate(c.endDate)}, which sits beyond that expiry.`,
        },
        {
          kind: "p",
          text: "As the engaging organisation we need to hold current evidence of the right to work for the whole period of engagement. Please provide:",
        },
        {
          kind: "bullets",
          items: [
            "A copy of the renewed visa or entitlement confirmation",
            "The new expiry date and any conditions attached to it",
            "Confirmation of the date the application was lodged, if a decision is still pending",
          ],
        },
        {
          kind: "callout",
          text: "If renewed evidence is not held before the current entitlement expires, we will have to suspend the assignment on that date. That is a compliance requirement, not a preference.",
        },
      ];
    },
  },
  {
    id: "tenure-review",
    name: "Tenure and engagement status review",
    blurb:
      "Internal note flagging long tenure and the co-employment / permanence question.",
    audience: "internal",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Tenure review - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const s = ctx.data.settings;
      const tenure = tenureMonths(c);
      return [
        {
          kind: "p",
          text: `${fullName(c)} has now been engaged continuously for ${tenure ?? "?"} months, past our ${s.maxTenureMonths} month review threshold. Flagging for a decision rather than another quiet extension.`,
        },
        {
          kind: "table",
          rows: [
            ["Role / team", `${c.role} - ${c.team}`],
            ["Hiring manager", c.hiringManager || "Not recorded"],
            ["Start date", formatDate(c.startDate)],
            ["Current end date", formatDate(c.endDate)],
            ["Extensions to date", String(c.extensionCount)],
            ["Charge rate", rateLine(c, ctx)],
            [
              "Annualised charge cost",
              money(
                (c.rateBasis === "hourly"
                  ? c.chargeRate * c.hoursPerWeek
                  : c.chargeRate *
                    (c.hoursPerWeek / (s.standardWeekHours / s.workingDaysPerWeek))) *
                  s.weeksPerYear,
                ctx
              ),
            ],
            [
              "Employment status test",
              c.statusTestCompleted ? "Completed" : "Not completed",
            ],
          ],
        },
        {
          kind: "p",
          text: "Points to resolve:",
        },
        {
          kind: "bullets",
          items: [
            "Is this a genuine short-term requirement, or has it become an ongoing role that should sit in the permanent establishment?",
            "Does the way the work is directed and controlled still support an independent contractor relationship?",
            "What is the cost of converting to permanent versus continuing at the current charge rate?",
            "If we continue, what is the exit trigger and who owns it?",
          ],
        },
      ];
    },
  },
  {
    id: "msa-renewal",
    name: "Vendor agreement renewal",
    blurb:
      "Opens the renewal or retender conversation ahead of the master agreement lapsing.",
    audience: "vendor",
    needsContractor: false,
    needsVendor: true,
    subject: (ctx) =>
      `Master services agreement renewal - ${ctx.vendor?.name || "vendor"} (${ctx.vendor?.msaRef || "ref TBC"})`,
    build: (ctx) => {
      const v = ctx.vendor!;
      const engaged = ctx.data.contractors.filter(
        (c) => c.vendorId === v.id && c.status !== "ended"
      );
      return [
        {
          kind: "p",
          text: `Our master services agreement ${v.msaRef || ""} with ${v.name} expires on ${formatDate(v.msaExpiry)}. I would like to get the renewal conversation underway well before that date rather than dropping into an uncovered period.`,
        },
        {
          kind: "table",
          rows: [
            ["Agreement reference", v.msaRef || "Not recorded"],
            ["Expiry", formatDate(v.msaExpiry)],
            ["Workers currently engaged", String(engaged.length)],
            [
              "Agreed margin",
              v.marginPct === null ? "Not recorded" : `${v.marginPct}%`,
            ],
            [
              "Payment terms",
              v.paymentTermsDays === null
                ? "Not recorded"
                : `${v.paymentTermsDays} days`,
            ],
            ["PI cover expiry", formatDate(v.piInsuranceExpiry)],
            ["PL cover expiry", formatDate(v.plInsuranceExpiry)],
          ],
        },
        {
          kind: "p",
          text: "For the renewal discussion, please come prepared with:",
        },
        {
          kind: "bullets",
          items: [
            "Your proposed rate card for the next term, with any movement clearly marked against the current card",
            "Current certificates of currency for professional indemnity and public liability",
            "Fill rate, time to submit and time to start metrics for the roles you have covered for us",
            "Any change to your margin structure or on-charges",
          ],
        },
      ];
    },
  },
  {
    id: "offboarding-internal",
    name: "Offboarding instruction (internal)",
    blurb:
      "Tells the service desk, security and finance exactly what to switch off and when.",
    audience: "internal",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Offboarding - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}, last day ${ctx.contractor ? formatDate(ctx.contractor.endDate) : "TBC"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const accounts = c.accounts.filter((a) => a.status === "active");
      const assets = c.assets.filter((a) => !a.returnedOn);
      return [
        {
          kind: "p",
          text: `${fullName(c)} (${c.role}, ${c.team}) finishes on ${formatDate(c.endDate)}. Actions below, please complete on or before that date.`,
        },
        {
          kind: "p",
          text: "Accounts to disable or revoke:",
        },
        accounts.length
          ? {
              kind: "bullets" as const,
              items: accounts.map((a) => a.system),
            }
          : { kind: "p" as const, text: "No active accounts recorded." },
        {
          kind: "p",
          text: "Assets outstanding:",
        },
        assets.length
          ? {
              kind: "bullets" as const,
              items: assets.map(
                (a) => `${a.item}${a.assetTag ? ` (${a.assetTag})` : ""}`
              ),
            }
          : { kind: "p" as const, text: "No outstanding assets recorded." },
        {
          kind: "callout",
          text: `Finance: final invoice must reconcile to PO ${c.poNumber || "(not recorded)"}. Invoiced to date is ${money(c.poSpentToDate, ctx)}${c.poValue ? ` against a PO value of ${money(c.poValue, ctx)}` : ""}.`,
        },
        {
          kind: "p",
          text: `Rehire eligibility on file: ${c.rehireEligible}. Please raise anything that should change that before the record is closed.`,
        },
      ];
    },
  },
  {
    id: "rate-challenge",
    name: "Rate benchmark challenge",
    blurb:
      "Puts a charge rate that sits above the benchmark back to the agency, with the numbers attached.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: true,
    subject: (ctx) =>
      `Charge rate review - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const s = ctx.data.settings;
      const bench = ctx.data.rateCard.find(
        (r) => r.role.toLowerCase() === c.role.toLowerCase()
      );
      const eff = effectiveHourlyRate(c, s);
      return [
        {
          kind: "p",
          text: `Ahead of the next contract event for ${fullName(c)}, I want to put the charge rate alongside our benchmark for the ${c.role} role.`,
        },
        {
          kind: "table",
          rows: [
            ["Current charge rate", rateLine(c, ctx)],
            [
              "Our benchmark",
              bench
                ? `${money(bench.benchmarkHourly, ctx)}/hr (${bench.source})`
                : "No benchmark held for this role",
            ],
            [
              "Variance",
              bench
                ? `${(((eff - bench.benchmarkHourly) / bench.benchmarkHourly) * 100).toFixed(1)}%`
                : "n/a",
            ],
            [
              "Agreed margin",
              ctx.vendor?.marginPct === null || ctx.vendor === null
                ? "Not recorded"
                : `${ctx.vendor.marginPct}%`,
            ],
            [
              "Annualised cost at current rate",
              money(
                (c.rateBasis === "hourly"
                  ? c.chargeRate * c.hoursPerWeek
                  : c.chargeRate *
                    (c.hoursPerWeek / (s.standardWeekHours / s.workingDaysPerWeek))) *
                  s.weeksPerYear,
                ctx
              ),
            ],
          ],
        },
        {
          kind: "p",
          text: "I am not asking you to cut the worker's pay rate. I am asking for a clear split of pay rate versus margin and on-charges, so we can see where the difference sits and have a sensible conversation about it.",
        },
      ];
    },
  },
  {
    id: "welcome",
    name: "Welcome and day one logistics",
    blurb:
      "Goes to the contractor directly. Start time, who to ask for, what they need to bring.",
    audience: "contractor",
    needsContractor: true,
    needsVendor: false,
    subject: (ctx) =>
      `Welcome - your first day with ${ctx.senderOrg} IT on ${ctx.contractor ? formatDate(ctx.contractor.startDate) : "TBC"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      return [
        {
          kind: "p",
          text: `Looking forward to having you join the ${c.team} team as ${c.role}. Here is what you need for day one.`,
        },
        {
          kind: "table",
          rows: [
            ["Start date", formatDate(c.startDate)],
            ["Start time", "9:00am"],
            ["Reporting to", c.hiringManager || "To be confirmed"],
            ["Location", c.location || "To be confirmed"],
            ["Contracted hours", `${c.hoursPerWeek} hours per week`],
          ],
        },
        {
          kind: "bullets",
          items: [
            "Bring photo ID for building access and account activation",
            "Your laptop and access card will be issued by the service desk on arrival",
            "You will complete a health and safety induction and a security briefing in the first hour",
            "Timesheets are submitted weekly by Monday midday for the previous week",
          ],
        },
        {
          kind: "callout",
          text: "If anything above looks wrong, tell me before your start date rather than on the day. It is much easier to fix in advance.",
        },
      ];
    },
  },

  {
    id: "approval-chase",
    name: "Approval chase to an approver",
    blurb:
      "Polite, specific, and impossible to ignore: what it is, how long you have had it, what happens if it slips further.",
    audience: "internal",
    needsContractor: false,
    needsVendor: false,
    subject: (ctx) =>
      `Decision needed: ${ctx.data.approvals.filter(isApprovalOpen).length} contractor approval${ctx.data.approvals.filter(isApprovalOpen).length === 1 ? "" : "s"} outstanding`,
    build: (ctx) => {
      const open = ctx.data.approvals
        .filter(isApprovalOpen)
        .sort((a, b) => (daysWithApprover(b) ?? 0) - (daysWithApprover(a) ?? 0));
      if (!open.length)
        return [{ kind: "p", text: "Nothing is currently awaiting a decision." }];
      return [
        {
          kind: "p",
          text: "The items below are waiting on a decision. I have listed how long each has been outstanding and the date the decision is actually needed by, because in most cases the contract end date will not move to accommodate the approval.",
        },
        {
          kind: "bullets",
          items: open.map((a) => {
            const c = ctx.data.contractors.find((x) => x.id === a.contractorId);
            const deadline = a.requiredBy ? ` Needed by ${formatDate(a.requiredBy)}.` : "";
            const chased = daysSinceLastChase(a.chases);
            return `${a.reference || "No reference"} - ${APPROVAL_KIND_LABELS[a.kind]}${c ? ` for ${fullName(c)}` : ""}${a.value !== null ? `, ${money(a.value, ctx)}` : ""}. With ${a.currentApprover || "no named approver"} for ${daysWithApprover(a) ?? 0} days.${deadline}${chased !== null ? ` Last chased ${chased} days ago.` : ""}`;
          }),
        },
        {
          kind: "callout",
          text: "If any of these are blocked on something I can resolve, tell me what it is and I will sort it. If they are simply waiting, a yes or no this week is all I need.",
        },
      ];
    },
  },
  {
    id: "invoice-approval-chase",
    name: "Invoice approval chase (internal)",
    blurb:
      "Chases invoices sitting past the internal approval service level, with the consequence spelled out.",
    audience: "internal",
    needsContractor: false,
    needsVendor: false,
    subject: () => "Contractor invoices awaiting your approval",
    build: (ctx) => {
      const s = ctx.data.settings;
      const waiting = ctx.data.invoices.filter(
        (i) => (daysAwaitingApproval(i) ?? 0) >= s.invoiceApprovalSlaDays
      );
      if (!waiting.length)
        return [
          { kind: "p", text: "No invoices are currently past the approval service level." },
        ];
      return [
        {
          kind: "p",
          text: `The invoices below have been sitting for longer than our ${s.invoiceApprovalSlaDays} day internal approval window. Each one delays payment to the supplier and, where terms are tight, puts us at risk of a late payment conversation.`,
        },
        {
          kind: "bullets",
          items: waiting.map((i) => {
            const c = ctx.data.contractors.find((x) => x.id === i.contractorId);
            const v = ctx.data.vendors.find((x) => x.id === i.vendorId);
            return `${i.invoiceNumber || "(no number)"} - ${c ? fullName(c) : "unknown"}${v ? `, ${v.name}` : ""}, ${money(i.amountExGst, ctx)} ex GST. With ${i.approver || "no named approver"} for ${daysAwaitingApproval(i)} days. Payment due ${i.dueDate ? formatDate(i.dueDate) : "not set"}.`;
          }),
        },
        {
          kind: "p",
          text: "If the work was not delivered as invoiced, tell me and I will raise a dispute rather than approve it. Otherwise please approve so it can go into the next payment run.",
        },
      ];
    },
  },
  {
    id: "payment-chase",
    name: "Payment chase to Accounts Payable",
    blurb:
      "For approved invoices that have gone past their due date. Includes the ageing so nobody argues about it.",
    audience: "internal",
    needsContractor: false,
    needsVendor: false,
    subject: () => "Overdue contractor payments",
    build: (ctx) => {
      const overdue = ctx.data.invoices.filter(invoiceIsOverdue);
      if (!overdue.length)
        return [{ kind: "p", text: "No contractor payments are currently overdue." }];
      const total = overdue.reduce((sum, i) => sum + i.amountExGst, 0);
      return [
        {
          kind: "p",
          text: `The invoices below are approved and past their payment due date. Total ${money(total, ctx)} exclusive of GST, ${money(total * (1 + ctx.data.settings.gstRate), ctx)} inclusive.`,
        },
        {
          kind: "bullets",
          items: overdue.map((i) => {
            const v = ctx.data.vendors.find((x) => x.id === i.vendorId);
            const d = daysToPaymentDue(i) ?? 0;
            return `${i.invoiceNumber || "(no number)"}${v ? `, ${v.name}` : ""}, ${money(i.amountExGst, ctx)} ex GST. Due ${formatDate(i.dueDate)}, now ${Math.abs(d)} days overdue. Status ${INVOICE_STATUS_LABELS[i.status].toLowerCase()}.`;
          }),
        },
        {
          kind: "callout",
          text: "Several suppliers have already chased us directly. Please confirm which payment run these will land in so I can give them a date.",
        },
      ];
    },
  },
  {
    id: "missing-invoice-chase",
    name: "Missing invoice chase to supplier",
    blurb:
      "For periods that have closed with no invoice. Frames it as an accrual problem, which tends to get a faster response.",
    audience: "vendor",
    needsContractor: false,
    needsVendor: true,
    subject: (ctx) => `Outstanding invoices - ${ctx.vendor?.name ?? "supplier"}`,
    build: (ctx) => {
      const missing = ctx.data.invoices.filter(
        (i) =>
          i.vendorId === ctx.vendor?.id && invoiceIsMissing(i, ctx.data.settings)
      );
      if (!missing.length)
        return [
          { kind: "p", text: "We have no outstanding invoices recorded against you at present." },
        ];
      return [
        {
          kind: "p",
          text: "Our records show the periods below have closed without an invoice reaching us. Until they arrive we are carrying them as an accrual, which makes our position less accurate than it should be and delays payment to you.",
        },
        {
          kind: "table",
          rows: missing.map((i) => {
            const c = ctx.data.contractors.find((x) => x.id === i.contractorId);
            return [
              `${c ? fullName(c) : "Unknown"}, ${formatDate(i.periodStart)} to ${formatDate(i.periodEnd)}`,
              `Expected around ${money(i.amountExGst, ctx)} ex GST, PO ${i.poNumber || "not recorded"}`,
            ] as [string, string];
          }),
        },
        {
          kind: "bullets",
          items: [
            "Please issue these against the purchase order numbers shown",
            "One invoice per contractor per period, so it can be matched and approved without follow-up",
            "If a period is genuinely not billable, tell me and I will close it off",
          ],
        },
      ];
    },
  },
  {
    id: "credit-note-request",
    name: "Credit note request",
    blurb:
      "For an invoice that does not match the contracted terms. States the discrepancy and what you need back.",
    audience: "vendor",
    needsContractor: true,
    needsVendor: true,
    subject: (ctx) =>
      `Credit note required - ${ctx.contractor ? fullName(ctx.contractor) : "contractor"}`,
    build: (ctx) => {
      const c = ctx.contractor!;
      const disputed = ctx.data.invoices.find(
        (i) => i.contractorId === c.id && (i.status === "disputed" || i.status === "on-hold")
      );
      return [
        {
          kind: "p",
          text: `We are holding an invoice for ${fullName(c)} because it does not match the contracted terms on our side.`,
        },
        {
          kind: "table",
          rows: [
            ["Invoice", disputed?.invoiceNumber || "See attached"],
            ["Period", disputed ? `${formatDate(disputed.periodStart)} to ${formatDate(disputed.periodEnd)}` : "—"],
            ["Amount invoiced", disputed ? money(disputed.amountExGst, ctx) : "—"],
            ["Contracted hours", `${c.hoursPerWeek} hours per week`],
            ["Contracted rate", rateLine(c, ctx)],
            ["Purchase order", c.poNumber || "Not recorded"],
          ],
        },
        {
          kind: "p",
          text: disputed?.disputeReason
            ? `The discrepancy is: ${disputed.disputeReason}`
            : "The discrepancy is set out below.",
        },
        {
          kind: "callout",
          text: "Please issue a credit note and a corrected invoice. We cannot part-approve, so the invoice stays on hold until the corrected version arrives. That delays your payment, not ours, which is why I would rather sort it quickly.",
        },
      ];
    },
  },
  {
    id: "weekly-position",
    name: "Weekly position update to the manager",
    blurb:
      "The regular reporting bullet, as an email. Numbers, decisions coming up, and what is stuck.",
    audience: "internal",
    needsContractor: false,
    needsVendor: false,
    subject: () => "Contractor position update",
    build: (ctx) => {
      const data = ctx.data;
      const s = data.settings;
      const engaged = data.contractors.filter((c) =>
        ["onboarding", "active", "notice"].includes(c.status)
      );
      const fte = engaged.reduce(
        (sum, c) => sum + (c.hoursPerWeek / s.standardWeekHours) * s.fteScale,
        0
      );
      const openApprovals = data.approvals.filter(isApprovalOpen);
      const openInvoices = data.invoices.filter(isInvoiceOpen);
      const overdue = data.invoices.filter(invoiceIsOverdue);
      const ending = engaged.filter((c) => {
        const dd = daysToEnd(c.endDate);
        return dd !== null && dd <= 60;
      });

      return [
        { kind: "p", text: "Weekly position on contractor resourcing." },
        {
          kind: "table",
          rows: [
            ["Contractors engaged", `${engaged.length} people, ${(fte / s.fteScale).toFixed(2)} FTE`],
            ["Capacity used", `${(((s.permanentFte * s.fteScale + fte) / (s.departmentFteBudget * s.fteScale)) * 100).toFixed(1)}% of the ${s.departmentFteBudget} FTE ceiling`],
            ["Contracts ending within 60 days", String(ending.length)],
            ["Approvals outstanding", `${openApprovals.length}, oldest ${Math.max(0, ...openApprovals.map((a) => daysWithApprover(a) ?? 0))} days`],
            ["Invoices open", `${openInvoices.length}, ${money(openInvoices.reduce((sum, i) => sum + i.amountExGst, 0), ctx)} ex GST`],
            ["Payments overdue", `${overdue.length}, ${money(overdue.reduce((sum, i) => sum + i.amountExGst, 0), ctx)} ex GST`],
          ],
        },
        {
          kind: "p",
          text: "Decisions needed from you or others this fortnight:",
        },
        {
          kind: "bullets",
          items: openApprovals.length
            ? openApprovals.map((a) => {
                const c = data.contractors.find((x) => x.id === a.contractorId);
                return `${a.reference || "No reference"} - ${APPROVAL_KIND_LABELS[a.kind]}${c ? ` for ${fullName(c)}` : ""}, with ${a.currentApprover || "no named approver"} for ${daysWithApprover(a) ?? 0} days${a.requiredBy ? `, needed by ${formatDate(a.requiredBy)}` : ""}`;
              })
            : ["Nothing outstanding."],
        },
        {
          kind: "p",
          text: "Full detail including project and cost centre splits is in the reporting pack if you want it.",
        },
      ];
    },
  },
];

export function templateById(id: string): EmailTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
