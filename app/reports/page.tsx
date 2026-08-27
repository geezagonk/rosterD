"use client";

import { useMemo } from "react";
import { Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  annualisedCost,
  committedRemainingCost,
  contractorHeadroomUnits,
  daysUntil,
  formatDate,
  formatMoney,
  fteUnits,
  fullName,
  isConsuming,
  plural,
  poBurnRatio,
  projectRollup,
  rollup,
  rollupBy,
  tenureMonths,
  vendorConcentration,
} from "@/lib/calc";
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STATE_LABELS,
  INVOICE_STATUS_LABELS,
  ageingSummary,
  approvalDaysToDeadline,
  approvalPosition,
  daysWithApprover,
  invoiceIsMissing,
  invoiceIsOverdue,
  invoicePosition,
  isApprovalOpen,
} from "@/lib/operations";
import { Empty } from "@/components/ui";

/**
 * The reporting pack. Deliberately one long printable page rather than a
 * dashboard: it exists to be read in a portfolio meeting or pasted into a
 * status report, so it prints cleanly and carries its own commentary.
 */
export default function ReportsPage() {
  const { data, ready } = useStore();
  const s = data.settings;

  const model = useMemo(() => {
    const consuming = data.contractors.filter(isConsuming);
    const pipeline = data.contractors.filter((c) => c.status === "pipeline");
    return {
      consuming,
      pipeline,
      totals: rollup(consuming, s),
      pipelineTotals: rollup(pipeline, s),
      teams: rollupBy(consuming, s, (c) => c.team),
      projects: projectRollup(data),
      vendors: vendorConcentration(data),
      approvals: approvalPosition(data),
      invoices: invoicePosition(data),
      ageing: ageingSummary(data),
    };
  }, [data, s]);

  if (!ready) return <div className="empty">Loading…</div>;

  const money = (n: number) => formatMoney(n, s.currency);
  const budgetUnits = s.departmentFteBudget * s.fteScale;
  const permanentUnits = s.permanentFte * s.fteScale;
  const headroom = contractorHeadroomUnits(s);
  const deptPct =
    budgetUnits > 0
      ? ((permanentUnits + model.totals.fteUnits) / budgetUnits) * 100
      : 0;

  const decisions = model.consuming
    .map((c) => ({ c, days: daysUntil(c.endDate) ?? 9999 }))
    .filter((x) => x.days <= 90)
    .sort((a, b) => a.days - b.days);

  const openApprovals = data.approvals
    .filter(isApprovalOpen)
    .sort((a, b) => (daysWithApprover(b) ?? 0) - (daysWithApprover(a) ?? 0));

  const problemInvoices = data.invoices.filter(
    (i) =>
      invoiceIsOverdue(i) ||
      invoiceIsMissing(i, s) ||
      i.status === "disputed" ||
      i.status === "on-hold"
  );

  const issues: string[] = [];
  if (model.approvals.lateCount)
    issues.push(
      `${model.approvals.lateCount} approval${model.approvals.lateCount === 1 ? " is" : "s are"} past the date the decision was needed. Contract end dates do not move to accommodate an approval queue.`
    );
  if (model.approvals.stalledCount)
    issues.push(
      `${model.approvals.stalledCount} approval${model.approvals.stalledCount === 1 ? "" : "s"} have been with the same person for more than ${s.approvalChaseAfterDays} days.`
    );
  if (model.invoices.missingCount)
    issues.push(
      `${model.invoices.missingCount} expected invoice${model.invoices.missingCount === 1 ? " has" : "s have"} not arrived more than ${s.invoiceExpectedAfterDays} days after the period closed, so the accrual is understated by roughly ${money(model.invoices.missingValue)}.`
    );
  if (model.invoices.overdueCount)
    issues.push(
      `${money(model.invoices.overdueValue)} across ${model.invoices.overdueCount} invoice${model.invoices.overdueCount === 1 ? "" : "s"} is past its payment due date.`
    );
  if (model.invoices.disputedCount)
    issues.push(
      `${money(model.invoices.disputedValue)} is in dispute or on hold and cannot move until the underlying issue is resolved.`
    );
  const burnIssues = model.consuming.filter((c) => {
    const b = poBurnRatio(c);
    return b !== null && b >= s.poBurnWarnRatio;
  });
  if (burnIssues.length)
    issues.push(
      `${burnIssues.length} purchase order${burnIssues.length === 1 ? " is" : "s are"} more than ${(s.poBurnWarnRatio * 100).toFixed(0)}% consumed. Each one is a held invoice waiting to happen.`
    );
  const tenureIssues = model.consuming.filter(
    (c) => (tenureMonths(c) ?? 0) >= s.maxTenureMonths
  );
  if (tenureIssues.length)
    issues.push(
      `${tenureIssues.length} contractor${tenureIssues.length === 1 ? " has" : "s have"} passed ${s.maxTenureMonths} months of continuous engagement and need an employment status and permanence review.`
    );
  const topVendor = model.vendors[0];
  if (topVendor && topVendor.share > s.vendorConcentrationWarnRatio)
    issues.push(
      `${topVendor.label} carries ${(topVendor.share * 100).toFixed(0)}% of contractor spend, above the ${(s.vendorConcentrationWarnRatio * 100).toFixed(0)}% concentration threshold.`
    );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Reporting pack</h1>
          <p>
            Everything a portfolio or leadership meeting needs, on one page.
            Print it or save it as a PDF straight from the browser.
          </p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={15} /> Print or save as PDF
          </button>
        </div>
      </div>

      <div className="pack">
        <div className="pack-head">
          <h1>
            Contingent workforce report — {s.organisationName} {s.teamName}
          </h1>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Position as at {formatDate(new Date().toISOString().slice(0, 10))}.
            Figures are charge cost exclusive of GST unless stated. Committed
            cost is derived from contracted hours and signed end dates, not from
            timesheets.
          </p>
        </div>

        <h2>1. Position summary</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Contractors engaged</td>
              <td className="right num">
                {plural(model.totals.headcount, "person", "people")},{" "}
                {(model.totals.fteUnits / s.fteScale).toFixed(2)} FTE
              </td>
            </tr>
            <tr>
              <td>Capacity used against the {s.departmentFteBudget} FTE ceiling</td>
              <td className="right num">
                {deptPct.toFixed(1)}% ({s.permanentFte.toFixed(1)} FTE permanent
                plus {(model.totals.fteUnits / s.fteScale).toFixed(2)} FTE
                contractor)
              </td>
            </tr>
            <tr>
              <td>Contractor headroom remaining</td>
              <td className="right num">
                {((headroom - model.totals.fteUnits) / s.fteScale).toFixed(2)} FTE
              </td>
            </tr>
            <tr>
              <td>Annualised charge run rate</td>
              <td className="right num">{money(model.totals.annualisedCost)}</td>
            </tr>
            <tr>
              <td>Weekly charge cost</td>
              <td className="right num">{money(model.totals.weeklyCost)}</td>
            </tr>
            <tr>
              <td>Committed to signed contract end dates</td>
              <td className="right num">
                {money(model.totals.committedRemaining)}
              </td>
            </tr>
            <tr>
              <td>In pipeline, not yet approved</td>
              <td className="right num">
                {plural(model.pipeline.length, "person", "people")},{" "}
                {(model.pipelineTotals.fteUnits / s.fteScale).toFixed(2)} FTE,{" "}
                {money(model.pipelineTotals.annualisedCost)} annualised
              </td>
            </tr>
          </tbody>
        </table>

        <h2>2. Commitment by team</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Team</th>
              <th className="right">People</th>
              <th className="right">FTE</th>
              <th className="right">Annualised</th>
              <th className="right">Committed to end</th>
            </tr>
          </thead>
          <tbody>
            {model.teams.map((t) => (
              <tr key={t.key}>
                <td>{t.label}</td>
                <td className="right num">{t.headcount}</td>
                <td className="right num">
                  {(t.fteUnits / s.fteScale).toFixed(2)}
                </td>
                <td className="right num">{money(t.annualisedCost)}</td>
                <td className="right num">{money(t.committedRemaining)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="right num">{model.totals.headcount}</td>
              <td className="right num">
                {(model.totals.fteUnits / s.fteScale).toFixed(2)}
              </td>
              <td className="right num">{money(model.totals.annualisedCost)}</td>
              <td className="right num">
                {money(model.totals.committedRemaining)}
              </td>
            </tr>
          </tfoot>
        </table>

        <h2>3. Commitment by project and cost centre</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Project</th>
              <th>Cost centre</th>
              <th className="right">FTE</th>
              <th className="right">Annualised</th>
            </tr>
          </thead>
          <tbody>
            {model.projects.map((p) => (
              <tr key={p.project?.id ?? "unallocated"}>
                <td>{p.project?.name ?? "Unallocated"}</td>
                <td>{p.project?.costCentre ?? "—"}</td>
                <td className="right num">
                  {(p.fteUnits / s.fteScale).toFixed(2)}
                </td>
                <td className="right num">
                  {money(p.weeklyCost * s.weeksPerYear)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>4. Upcoming decisions, next 90 days</h2>
        {decisions.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>Contractor</th>
                <th>Role and team</th>
                <th>Contract ends</th>
                <th className="right">Decision by</th>
                <th className="right">Cost of a 3 month extension</th>
              </tr>
            </thead>
            <tbody>
              {decisions.map(({ c, days }) => (
                <tr key={c.id}>
                  <td>{fullName(c)}</td>
                  <td>
                    {c.role}, {c.team}
                  </td>
                  <td>
                    {formatDate(c.endDate)}
                    <span className="faint small">
                      {" "}
                      ({days < 0 ? `${Math.abs(days)}d over` : `${days}d`})
                    </span>
                  </td>
                  <td className="right">
                    {formatDate(
                      new Date(
                        new Date(c.endDate).getTime() -
                          c.noticePeriodDays * 86400000
                      )
                        .toISOString()
                        .slice(0, 10)
                    )}
                  </td>
                  <td className="right num">
                    {money((annualisedCost(c, s) / 12) * 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted small">No contracts end within 90 days.</p>
        )}

        <h2>5. Approvals outstanding</h2>
        {openApprovals.length ? (
          <table className="data">
            <thead>
              <tr>
                <th>Reference</th>
                <th>What</th>
                <th>With</th>
                <th className="right">Days waiting</th>
                <th className="right">Needed by</th>
                <th className="right">Value</th>
              </tr>
            </thead>
            <tbody>
              {openApprovals.map((a) => {
                const c = data.contractors.find((x) => x.id === a.contractorId);
                const deadline = approvalDaysToDeadline(a);
                return (
                  <tr key={a.id}>
                    <td>{a.reference || "—"}</td>
                    <td>
                      {APPROVAL_KIND_LABELS[a.kind]}
                      {c ? `, ${fullName(c)}` : ""}
                      <div className="faint small">
                        {APPROVAL_STATE_LABELS[a.state]}
                        {a.chases.length
                          ? ` · chased ${a.chases.length} time${a.chases.length === 1 ? "" : "s"}`
                          : " · never chased"}
                      </div>
                    </td>
                    <td>
                      {a.currentApprover || "—"}
                      {a.currentApproverRole ? (
                        <div className="faint small">{a.currentApproverRole}</div>
                      ) : null}
                    </td>
                    <td className="right num">{daysWithApprover(a) ?? "—"}</td>
                    <td className="right">
                      {a.requiredBy ? formatDate(a.requiredBy) : "—"}
                      {deadline !== null && deadline < 0 ? (
                        <div className="faint small">
                          {Math.abs(deadline)}d late
                        </div>
                      ) : null}
                    </td>
                    <td className="right num">
                      {a.value === null ? "—" : money(a.value)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted small">Nothing awaiting a decision.</p>
        )}

        <h2>6. Invoices and payments</h2>
        <table className="data">
          <tbody>
            <tr>
              <td>Awaiting internal approval</td>
              <td className="right num">
                {money(model.invoices.awaitingApprovalValue)} across{" "}
                {plural(model.invoices.awaitingApprovalCount, "invoice")}
                {model.invoices.slaBreachCount
                  ? `, ${model.invoices.slaBreachCount} past the ${s.invoiceApprovalSlaDays} day service level`
                  : ""}
              </td>
            </tr>
            <tr>
              <td>Approved, awaiting payment</td>
              <td className="right num">
                {money(model.invoices.awaitingPaymentValue)} across{" "}
                {plural(model.invoices.awaitingPaymentCount, "invoice")}
              </td>
            </tr>
            <tr>
              <td>Overdue</td>
              <td className="right num">
                {money(model.invoices.overdueValue)} across{" "}
                {plural(model.invoices.overdueCount, "invoice")}
              </td>
            </tr>
            <tr>
              <td>Disputed or on hold</td>
              <td className="right num">
                {money(model.invoices.disputedValue)} across{" "}
                {plural(model.invoices.disputedCount, "invoice")}
              </td>
            </tr>
            <tr>
              <td>Expected but not received</td>
              <td className="right num">
                {money(model.invoices.missingValue)} across{" "}
                {plural(model.invoices.missingCount, "invoice")}
              </td>
            </tr>
            <tr>
              <td>Paid this month</td>
              <td className="right num">
                {money(model.invoices.paidThisMonthValue)}
              </td>
            </tr>
          </tbody>
        </table>

        {problemInvoices.length ? (
          <>
            <h2>6a. Invoices needing intervention</h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Contractor</th>
                  <th>Status</th>
                  <th className="right">Ex GST</th>
                  <th>Why it is stuck</th>
                </tr>
              </thead>
              <tbody>
                {problemInvoices.map((i) => {
                  const c = data.contractors.find(
                    (x) => x.id === i.contractorId
                  );
                  return (
                    <tr key={i.id}>
                      <td>{i.invoiceNumber || "not issued"}</td>
                      <td>{c ? fullName(c) : "—"}</td>
                      <td>{INVOICE_STATUS_LABELS[i.status]}</td>
                      <td className="right num">{money(i.amountExGst)}</td>
                      <td className="small">
                        {i.disputeReason ||
                          (invoiceIsMissing(i, s)
                            ? `Period ended ${formatDate(i.periodEnd)} and nothing has arrived.`
                            : invoiceIsOverdue(i)
                              ? `Payment due ${formatDate(i.dueDate)}.`
                              : "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        ) : null}

        <h2>7. Supplier position</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Supplier</th>
              <th className="right">People</th>
              <th className="right">Annualised</th>
              <th className="right">Share of spend</th>
            </tr>
          </thead>
          <tbody>
            {model.vendors.map((v) => (
              <tr key={v.label}>
                <td>{v.label}</td>
                <td className="right num">{v.headcount}</td>
                <td className="right num">{money(v.annualisedCost)}</td>
                <td className="right num">{(v.share * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>8. Issues and risks</h2>
        {issues.length ? (
          <ul>
            {issues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        ) : (
          <p className="muted small">
            Nothing outstanding against the current thresholds.
          </p>
        )}

        <h2>9. Basis of preparation</h2>
        <ul>
          <li>
            FTE is expressed on a {s.fteScale} unit scale where {s.fteScale}{" "}
            units equal 1.0 FTE and one {s.standardWeekHours} hour week.
          </li>
          <li>
            The capacity ceiling is {s.departmentFteBudget} FTE, of which{" "}
            {s.permanentFte} FTE is treated as permanent establishment, leaving{" "}
            {(s.departmentFteBudget - s.permanentFte).toFixed(1)} FTE of
            contractor headroom.
          </li>
          <li>
            Cost is charge cost derived from contracted hours and rates, not from
            submitted timesheets. Actual cost will differ where hours worked
            differ from hours contracted.
          </li>
          <li>
            Annualised figures use {s.weeksPerYear} weeks. Daily rates convert at{" "}
            {(s.standardWeekHours / s.workingDaysPerWeek).toFixed(1)} hours a
            day.
          </li>
          <li>
            Invoice values are exclusive of GST. GST is applied at{" "}
            {(s.gstRate * 100).toFixed(0)}% where an inclusive figure is shown.
          </li>
          <li>
            Pipeline contractors are excluded from committed cost and capacity
            until approved.
          </li>
        </ul>
      </div>

      {!data.contractors.length ? <Empty>No data to report on.</Empty> : null}
    </div>
  );
}
