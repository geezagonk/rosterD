"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleDollarSign,
  Gauge,
  Receipt,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  annualisedCost,
  committedRemainingCost,
  contractorHeadroomUnits,
  formatDate,
  formatMoney,
  fteUnits,
  fullName,
  isConsuming,
  projectRollup,
  rollup,
  rollupBy,
  vendorConcentration,
} from "@/lib/calc";
import { openReminders } from "@/lib/reminders";
import {
  approvalPosition,
  daysWithApprover,
  invoicePosition,
  isApprovalOpen,
} from "@/lib/operations";
import { Avatar, Bar, Card, Empty, Ring, Stat, StatusBadge } from "@/components/ui";

export default function DashboardPage() {
  const { data, ready } = useStore();
  const s = data.settings;

  if (!ready) return <div className="empty">Loading register…</div>;

  const consuming = data.contractors.filter(isConsuming);
  const pipeline = data.contractors.filter((c) => c.status === "pipeline");
  const totals = rollup(consuming, s);
  const pipelineTotals = rollup(pipeline, s);

  const budgetUnits = s.departmentFteBudget * s.fteScale;
  const permanentUnits = s.permanentFte * s.fteScale;
  const headroom = contractorHeadroomUnits(s);
  const usedPct = headroom > 0 ? (totals.fteUnits / headroom) * 100 : 0;
  const deptPct = budgetUnits > 0 ? ((permanentUnits + totals.fteUnits) / budgetUnits) * 100 : 0;

  const money = (n: number) => formatMoney(n, s.currency);

  const teams = rollupBy(consuming, s, (c) => c.team);
  const maxTeamCost = Math.max(...teams.map((t) => t.annualisedCost), 1);
  const projects = projectRollup(data);
  const maxProjectCost = Math.max(...projects.map((p) => p.weeklyCost), 1);
  const vendors = vendorConcentration(data);
  const topVendor = vendors[0];

  const approvals = approvalPosition(data);
  const invoices = invoicePosition(data);
  const stalled = data.approvals
    .filter(isApprovalOpen)
    .filter((a) => (daysWithApprover(a) ?? 0) >= s.approvalChaseAfterDays)
    .sort((a, b) => (daysWithApprover(b) ?? 0) - (daysWithApprover(a) ?? 0));

  const reminders = openReminders(data);
  const urgent = reminders.filter(
    (r) => r.severity === "overdue" || r.severity === "due"
  );

  const ending = consuming
    .map((c) => ({
      c,
      days: Math.round(
        (new Date(c.endDate).getTime() - Date.now()) / 86_400_000
      ),
    }))
    .filter((x) => x.days <= s.endWarningDays)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Good day, Gavin</h1>
          <p>
            IT contingent workforce at a glance. FTE is on a {s.fteScale}-unit
            scale where {s.fteScale} equals one {s.standardWeekHours} hour week,
            against a departmental ceiling of {s.departmentFteBudget} FTE.
          </p>
        </div>
        <Link href="/contractors" className="btn primary">
          Open the register
        </Link>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Contractor FTE in use"
          value={(totals.fteUnits / s.fteScale).toFixed(2)}
          sub={`${totals.fteUnits.toFixed(0)} units of ${headroom.toFixed(0)} available`}
          icon={<Gauge size={18} />}
          tone="accent"
          meter={{
            pct: usedPct,
            tone: usedPct > 100 ? "over" : usedPct > 85 ? "warn" : "fill",
          }}
        />
        <Stat
          label="Annualised run rate"
          value={money(totals.annualisedCost)}
          sub={`${money(totals.weeklyCost)} per week across ${totals.headcount} people`}
          icon={<CircleDollarSign size={18} />}
          tone="green"
        />
        <Stat
          label="Committed to contract end"
          value={money(totals.committedRemaining)}
          sub="Charge cost already locked in by signed end dates"
          icon={<CalendarClock size={18} />}
          tone="blue"
        />
        <Stat
          label="Needs attention"
          value={urgent.length}
          sub={`${reminders.length} open reminders in total`}
          icon={<AlertTriangle size={18} />}
          tone={urgent.length ? "red" : "green"}
        />
      </div>

      <div className="grid cols-3">
        <div style={{ gridColumn: "span 2" }}>
          <Card title="Capacity against the department ceiling">
            <div className="row" style={{ gap: 24, alignItems: "center" }}>
              <Ring
                pct={deptPct}
                size={104}
                stroke={12}
                label={`${Math.round(deptPct)}%`}
                tone={deptPct > 100 ? "var(--red)" : "var(--accent)"}
              />
              <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                <Bar
                  label="Permanent establishment"
                  value={permanentUnits}
                  max={budgetUnits}
                  display={`${s.permanentFte.toFixed(1)} FTE`}
                />
                <Bar
                  label="Contractors, engaged"
                  value={totals.fteUnits}
                  max={budgetUnits}
                  display={`${(totals.fteUnits / s.fteScale).toFixed(2)} FTE`}
                  tone="alt"
                />
                <Bar
                  label="Contractors, pipeline"
                  value={pipelineTotals.fteUnits}
                  max={budgetUnits}
                  display={`${(pipelineTotals.fteUnits / s.fteScale).toFixed(2)} FTE`}
                  tone="warn"
                />
                <p className="small muted" style={{ margin: "8px 0 0" }}>
                  {deptPct > 100
                    ? "Over the ceiling once permanents and engaged contractors are combined."
                    : `${((budgetUnits - permanentUnits - totals.fteUnits) / s.fteScale).toFixed(2)} FTE of headroom left before the ceiling.`}
                  {pipelineTotals.fteUnits > 0
                    ? ` Approving everything in the pipeline would take it to ${(
                        ((permanentUnits + totals.fteUnits + pipelineTotals.fteUnits) /
                          budgetUnits) *
                        100
                      ).toFixed(0)}%.`
                    : ""}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Vendor concentration">
          {vendors.length ? (
            <>
              {vendors.map((v) => (
                <Bar
                  key={v.label}
                  label={
                    <span title={v.label}>
                      {v.label}
                      <span className="faint small"> · {v.headcount}</span>
                    </span>
                  }
                  value={v.share * 100}
                  max={100}
                  display={`${(v.share * 100).toFixed(0)}%`}
                  tone={
                    v.share > s.vendorConcentrationWarnRatio ? "alt" : undefined
                  }
                />
              ))}
              {topVendor && topVendor.share > s.vendorConcentrationWarnRatio ? (
                <div className="note warn" style={{ marginTop: 10 }}>
                  {topVendor.label} carries{" "}
                  {(topVendor.share * 100).toFixed(0)}% of contractor spend,
                  above the {(s.vendorConcentrationWarnRatio * 100).toFixed(0)}%
                  threshold. Worth a second panel supplier for that skill set.
                </div>
              ) : null}
            </>
          ) : (
            <Empty>No engaged contractors yet.</Empty>
          )}
        </Card>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Approvals outstanding"
          value={approvals.openCount}
          sub={
            approvals.stalledCount
              ? `${approvals.stalledCount} stalled, oldest ${approvals.oldestDays} days with ${approvals.byApprover[0]?.approver ?? "someone"}`
              : "Nothing sitting past the chase threshold"
          }
          icon={<UserCheck size={18} />}
          tone={approvals.stalledCount ? "peach" : "green"}
        />
        <Stat
          label="Invoices awaiting approval"
          value={money(invoices.awaitingApprovalValue)}
          sub={`${invoices.awaitingApprovalCount} invoices, ${invoices.slaBreachCount} past the service level`}
          icon={<Wallet size={18} />}
          tone={invoices.slaBreachCount ? "peach" : "accent"}
        />
        <Stat
          label="Payments overdue"
          value={money(invoices.overdueValue)}
          sub={`${invoices.overdueCount} invoices past their due date`}
          icon={<Receipt size={18} />}
          tone={invoices.overdueCount ? "red" : "green"}
        />
        <Stat
          label="Blocked value"
          value={money(invoices.disputedValue + invoices.missingValue)}
          sub={`${invoices.disputedCount} disputed or held, ${invoices.missingCount} never received`}
          icon={<AlertTriangle size={18} />}
          tone={invoices.disputedCount + invoices.missingCount ? "peach" : "green"}
        />
      </div>

      {stalled.length ? (
        <Card
          title="Sitting with somebody"
          action={<Link href="/approvals" className="btn small">Approvals</Link>}
        >
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>What</th>
                  <th>With</th>
                  <th className="right">Days waiting</th>
                  <th className="right">Times chased</th>
                  <th className="right">Value</th>
                </tr>
              </thead>
              <tbody>
                {stalled.map((a) => {
                  const person = data.contractors.find(
                    (x) => x.id === a.contractorId
                  );
                  return (
                    <tr key={a.id}>
                      <td>
                        {a.reference || "No reference"}
                        <div className="faint small">
                          {person ? fullName(person) : "—"}
                        </div>
                      </td>
                      <td>
                        {a.currentApprover || "Unassigned"}
                        {a.currentApproverRole ? (
                          <div className="faint small">
                            {a.currentApproverRole}
                          </div>
                        ) : null}
                      </td>
                      <td className="right">
                        <span className="badge warn">
                          {daysWithApprover(a) ?? 0}
                        </span>
                      </td>
                      <td className="right num">
                        {a.chases.length || (
                          <span className="badge risk">never</span>
                        )}
                      </td>
                      <td className="right num">
                        {a.value === null ? "—" : money(a.value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="grid cols-2">
        <Card
          title="Contracts ending soon"
          action={<Link href="/reminders" className="btn small">Reminders</Link>}
        >
          {ending.length ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Contractor</th>
                    <th>Ends</th>
                    <th className="right">Days</th>
                    <th className="right">Remaining cost</th>
                  </tr>
                </thead>
                <tbody>
                  {ending.map(({ c, days }, i) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/contractors/${c.id}`} className="person">
                          <Avatar name={fullName(c)} index={i} />
                          <span className="who">
                            <b>{fullName(c)}</b>
                            <span>
                              {c.role} · {c.team}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td>{formatDate(c.endDate)}</td>
                      <td className="right">
                        <span
                          className={`badge ${days < 0 ? "risk" : days <= 21 ? "warn" : ""}`}
                        >
                          {days < 0 ? `${Math.abs(days)} over` : days}
                        </span>
                      </td>
                      <td className="right">
                        {money(committedRemainingCost(c, s))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              Nothing ends inside the next {s.endWarningDays} days.
            </Empty>
          )}
        </Card>

        <Card title="Spend by team">
          {teams.length ? (
            teams.map((t) => (
              <Bar
                key={t.key}
                label={
                  <span>
                    {t.label}
                    <span className="faint small"> · {t.headcount}</span>
                  </span>
                }
                value={t.annualisedCost}
                max={maxTeamCost}
                display={money(t.annualisedCost)}
              />
            ))
          ) : (
            <Empty>No engaged contractors yet.</Empty>
          )}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card
          title="Allocation by project"
          action={<Link href="/projects" className="btn small">Detail</Link>}
        >
          {projects.length ? (
            projects.map((p) => (
              <Bar
                key={p.project?.id ?? "unallocated"}
                label={
                  <span>
                    {p.project?.name ?? "Unallocated"}
                    <span className="faint small">
                      {" "}
                      · {(p.fteUnits / s.fteScale).toFixed(2)} FTE
                    </span>
                  </span>
                }
                value={p.weeklyCost}
                max={maxProjectCost}
                display={money(p.weeklyCost * s.weeksPerYear)}
                tone={p.project ? undefined : "warn"}
              />
            ))
          ) : (
            <Empty>Nothing allocated.</Empty>
          )}
        </Card>

        <Card
          title="Next actions"
          action={<Link href="/reminders" className="btn small">All</Link>}
          padded={false}
        >
          {reminders.slice(0, 6).map((r) => (
            <div key={r.key} className={`reminder ${r.severity}`}>
              <span className="flag" />
              <span className="when muted">
                {r.daysOut !== null && r.daysOut < 0
                  ? `${Math.abs(r.daysOut)}d overdue`
                  : r.daysOut === 0
                    ? "Today"
                    : `in ${r.daysOut}d`}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="title">{r.title}</span>
                <span className="detail">{r.detail}</span>
              </span>
            </div>
          ))}
          {!reminders.length ? <Empty>Nothing outstanding.</Empty> : null}
        </Card>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Engaged headcount"
          value={totals.headcount}
          sub={`${pipeline.length} in pipeline, ${data.contractors.filter((c) => c.status === "ended").length} ended`}
          icon={<Users size={18} />}
          tone="pink"
        />
        <Stat
          label="Panel vendors"
          value={data.vendors.filter((v) => v.active).length}
          sub={`${data.contractors.filter((c) => c.engagementType === "direct" && isConsuming(c)).length} engaged directly`}
          icon={<Building2 size={18} />}
          tone="peach"
        />
        <Stat
          label="Average charge cost"
          value={
            totals.headcount
              ? money(totals.annualisedCost / totals.headcount)
              : money(0)
          }
          sub="Annualised, per engaged contractor"
          icon={<CircleDollarSign size={18} />}
          tone="blue"
        />
        <Stat
          label="Pipeline commitment"
          value={money(
            pipeline.reduce((sum, c) => sum + annualisedCost(c, s), 0)
          )}
          sub={`${(pipelineTotals.fteUnits / s.fteScale).toFixed(2)} FTE awaiting approval`}
          icon={<Gauge size={18} />}
          tone="accent"
        />
      </div>
    </div>
  );
}
