"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  allocationTotal,
  annualisedCost,
  committedRemainingCost,
  effectiveHourlyRate,
  formatDate,
  formatMoney,
  fteUnits,
  fullName,
  monthlyCost,
  poBurnRatio,
  rateVariance,
  tenureMonths,
  totalContractValue,
  weeklyCost,
  weeklyMargin,
} from "@/lib/calc";
import { Contractor, ContractorStatus, RateBasis } from "@/lib/types";
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STATE_LABELS,
  INVOICE_STATUS_LABELS,
  VARIATION_TYPE_LABELS,
  approvalsFor,
  daysWithApprover,
  invoicesFor,
  invoiceTotal,
  isApprovalOpen,
  paidTotal,
  variationsFor,
} from "@/lib/operations";
import { Avatar, Card, Empty, Field, Ring, StatusBadge } from "@/components/ui";

const TABS = [
  "Engagement",
  "Commercials",
  "Contract history",
  "Governance",
  "Allocation",
  "Access & lifecycle",
  "Personal",
] as const;
type Tab = (typeof TABS)[number];

export default function ContractorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, ready, update } = useStore();
  const [tab, setTab] = useState<Tab>("Engagement");
  const s = data.settings;

  const contractor = data.contractors.find((c) => c.id === params.id);

  if (!ready) return <div className="empty">Loading…</div>;
  if (!contractor)
    return (
      <div className="stack">
        <Link href="/contractors" className="btn">
          <ArrowLeft size={15} /> Back to register
        </Link>
        <Empty>That record does not exist. It may have been deleted.</Empty>
      </div>
    );

  const c = contractor;
  const vendor = data.vendors.find((v) => v.id === c.vendorId) ?? null;
  const money = (n: number) => formatMoney(n, s.currency);

  const set = <K extends keyof Contractor>(key: K, value: Contractor[K]) => {
    update((draft) => {
      const target = draft.contractors.find((x) => x.id === c.id);
      if (target) (target[key] as Contractor[K]) = value;
      return draft;
    });
  };

  const mutate = (fn: (target: Contractor) => void) => {
    update((draft) => {
      const target = draft.contractors.find((x) => x.id === c.id);
      if (target) fn(target);
      return draft;
    });
  };

  const remove = () => {
    update((draft) => {
      draft.contractors = draft.contractors.filter((x) => x.id !== c.id);
      draft.comms = draft.comms.filter((e) => e.contractorId !== c.id);
      draft.reminders = draft.reminders.filter((r) => r.contractorId !== c.id);
      return draft;
    });
    router.push("/contractors");
  };

  const burn = poBurnRatio(c);
  const rv = rateVariance(c, data);
  const allocTotal = allocationTotal(c);
  const margin = weeklyMargin(c, s);

  return (
    <div className="stack">
      <div className="page-head">
        <div className="row">
          <Link href="/contractors" className="btn small">
            <ArrowLeft size={14} /> Register
          </Link>
        </div>
      </div>

      <section className="card">
        <div className="body">
          <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
            <Avatar name={fullName(c)} index={2} />
            <div style={{ flex: "1 1 240px", minWidth: 200 }}>
              <h1 style={{ fontSize: 21 }}>{fullName(c)}</h1>
              <p className="muted small" style={{ margin: "2px 0 8px" }}>
                {c.role || "Role not set"} · {c.team || "Team not set"} ·{" "}
                {vendor ? vendor.name : "Direct engagement"}
              </p>
              <div className="row" style={{ gap: 6 }}>
                <StatusBadge status={c.status} />
                <span className="badge accent">
                  {fteUnits(c, s).toFixed(0)} FTE units
                </span>
                <span className="badge">
                  {c.hoursPerWeek}h / {s.standardWeekHours}h week
                </span>
                {tenureMonths(c) !== null ? (
                  <span
                    className={`badge ${(tenureMonths(c) ?? 0) >= s.maxTenureMonths ? "risk" : ""}`}
                  >
                    {tenureMonths(c)} months tenure
                  </span>
                ) : null}
              </div>
            </div>
            <div className="row" style={{ gap: 20, marginLeft: "auto" }}>
              <div style={{ textAlign: "center" }}>
                <Ring
                  pct={burn === null ? 0 : burn * 100}
                  size={64}
                  stroke={8}
                  label={burn === null ? "—" : `${Math.round(burn * 100)}%`}
                  tone={
                    burn !== null && burn >= s.poBurnWarnRatio
                      ? "var(--peach)"
                      : "var(--accent)"
                  }
                />
                <div className="small faint" style={{ marginTop: 4 }}>
                  PO consumed
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <Ring
                  pct={allocTotal}
                  size={64}
                  stroke={8}
                  label={`${allocTotal}%`}
                  tone={allocTotal === 100 ? "var(--green)" : "var(--peach)"}
                />
                <div className="small faint" style={{ marginTop: 4 }}>
                  Allocated
                </div>
              </div>
            </div>
          </div>

          <div className="grid cols-4" style={{ marginTop: 16 }}>
            <div className="note">
              <b>{money(weeklyCost(c, s))}</b> per week
              <div className="small">{money(monthlyCost(c, s))} per month</div>
            </div>
            <div className="note">
              <b>{money(annualisedCost(c, s))}</b> annualised
              <div className="small">
                {money(effectiveHourlyRate(c, s))} effective hourly
              </div>
            </div>
            <div className="note">
              <b>{money(committedRemainingCost(c, s))}</b> still committed
              <div className="small">
                to {formatDate(c.endDate)}
              </div>
            </div>
            <div className={`note ${rv && rv.variance > s.rateVarianceWarnRatio ? "warn" : ""}`}>
              {rv ? (
                <>
                  <b>
                    {rv.variance >= 0 ? "+" : ""}
                    {(rv.variance * 100).toFixed(1)}%
                  </b>{" "}
                  vs benchmark
                  <div className="small">
                    Benchmark {money(rv.benchmark)}/hr
                  </div>
                </>
              ) : (
                <>
                  <b>No benchmark</b>
                  <div className="small">Add one in Settings → rate card</div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Engagement" ? (
        <div className="grid cols-2">
          <Card title="Engagement">
            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="First name">
                <input
                  type="text"
                  value={c.firstName}
                  onChange={(e) => set("firstName", e.target.value)}
                />
              </Field>
              <Field label="Last name">
                <input
                  type="text"
                  value={c.lastName}
                  onChange={(e) => set("lastName", e.target.value)}
                />
              </Field>
              <Field label="Preferred name">
                <input
                  type="text"
                  value={c.preferredName}
                  onChange={(e) => set("preferredName", e.target.value)}
                />
              </Field>
              <Field label="Worker ID (HRIS)">
                <input
                  type="text"
                  value={c.workerId}
                  onChange={(e) => set("workerId", e.target.value)}
                />
              </Field>
              <Field label="Role">
                <input
                  type="text"
                  value={c.role}
                  onChange={(e) => set("role", e.target.value)}
                />
              </Field>
              <Field label="Team">
                <input
                  type="text"
                  value={c.team}
                  onChange={(e) => set("team", e.target.value)}
                />
              </Field>
              <Field label="Hiring manager">
                <input
                  type="text"
                  value={c.hiringManager}
                  onChange={(e) => set("hiringManager", e.target.value)}
                />
              </Field>
              <Field label="Status">
                <select
                  value={c.status}
                  onChange={(e) =>
                    set("status", e.target.value as ContractorStatus)
                  }
                >
                  <option value="pipeline">Pipeline</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="notice">On notice</option>
                  <option value="ended">Ended</option>
                </select>
              </Field>
              <Field label="Engagement type">
                <select
                  value={c.engagementType}
                  onChange={(e) => {
                    const v = e.target.value as Contractor["engagementType"];
                    mutate((t) => {
                      t.engagementType = v;
                      if (v === "direct") t.vendorId = null;
                    });
                  }}
                >
                  <option value="intermediated">Via agency / vendor</option>
                  <option value="direct">Direct</option>
                </select>
              </Field>
              <Field label="Vendor">
                <select
                  value={c.vendorId ?? ""}
                  disabled={c.engagementType === "direct"}
                  onChange={(e) => set("vendorId", e.target.value || null)}
                >
                  <option value="">None</option>
                  {data.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Dates and hours">
            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="Start date">
                <input
                  type="date"
                  value={c.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={c.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </Field>
              <Field label="Original end date">
                <input
                  type="date"
                  value={c.originalEndDate}
                  onChange={(e) => set("originalEndDate", e.target.value)}
                />
              </Field>
              <Field label="Notice period (days)">
                <input
                  type="number"
                  value={c.noticePeriodDays}
                  onChange={(e) =>
                    set("noticePeriodDays", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Hours per week">
                <input
                  type="number"
                  step="0.5"
                  value={c.hoursPerWeek}
                  onChange={(e) => set("hoursPerWeek", Number(e.target.value))}
                />
              </Field>
              <Field label="Extensions to date">
                <input
                  type="number"
                  value={c.extensionCount}
                  onChange={(e) =>
                    set("extensionCount", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <div className="note">
              {c.hoursPerWeek} hours on a {s.standardWeekHours} hour week is{" "}
              <b>{fteUnits(c, s).toFixed(0)} FTE units</b> (
              {(fteUnits(c, s) / s.fteScale).toFixed(2)} FTE). Whole-of-contract
              charge value is <b>{money(totalContractValue(c, s))}</b>.
            </div>
            <Field label="Notes">
              <textarea
                value={c.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </Card>
        </div>
      ) : null}

      {tab === "Commercials" ? (
        <div className="grid cols-2">
          <Card title="Rates">
            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="Rate basis">
                <select
                  value={c.rateBasis}
                  onChange={(e) => set("rateBasis", e.target.value as RateBasis)}
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                </select>
              </Field>
              <Field label={`Charge rate (${s.currency})`}>
                <input
                  type="number"
                  step="0.01"
                  value={c.chargeRate}
                  onChange={(e) => set("chargeRate", Number(e.target.value))}
                />
              </Field>
              <Field label={`Worker pay rate (${s.currency}, if known)`}>
                <input
                  type="number"
                  step="0.01"
                  value={c.payRate ?? ""}
                  onChange={(e) =>
                    set(
                      "payRate",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </Field>
              <Field label="Approval reference">
                <input
                  type="text"
                  value={c.approvalRef}
                  onChange={(e) => set("approvalRef", e.target.value)}
                />
              </Field>
            </div>
            <dl className="kv">
              <dt>Effective hourly</dt>
              <dd>{money(effectiveHourlyRate(c, s))}</dd>
              <dt>Weekly charge</dt>
              <dd>{money(weeklyCost(c, s))}</dd>
              <dt>Annualised</dt>
              <dd>{money(annualisedCost(c, s))}</dd>
              <dt>Agency margin</dt>
              <dd>
                {margin === null
                  ? "Not calculable (pay rate not held)"
                  : `${money(margin)} per week`}
              </dd>
              <dt>Benchmark variance</dt>
              <dd>
                {rv
                  ? `${rv.variance >= 0 ? "+" : ""}${(rv.variance * 100).toFixed(1)}% against ${money(rv.benchmark)}/hr`
                  : "No benchmark held for this role"}
              </dd>
            </dl>
          </Card>

          <Card title="Purchase order">
            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="PO number">
                <input
                  type="text"
                  value={c.poNumber}
                  onChange={(e) => set("poNumber", e.target.value)}
                />
              </Field>
              <Field label="Contract reference">
                <input
                  type="text"
                  value={c.contractRef}
                  onChange={(e) => set("contractRef", e.target.value)}
                />
              </Field>
              <Field label={`PO value (${s.currency})`}>
                <input
                  type="number"
                  value={c.poValue ?? ""}
                  onChange={(e) =>
                    set(
                      "poValue",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </Field>
              <Field label={`Invoiced to date (${s.currency})`}>
                <input
                  type="number"
                  value={c.poSpentToDate}
                  onChange={(e) =>
                    set("poSpentToDate", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            {burn !== null ? (
              <div className={`note ${burn >= s.poBurnWarnRatio ? "warn" : ""}`}>
                {Math.round(burn * 100)}% of the PO is consumed.{" "}
                {money((c.poValue ?? 0) - c.poSpentToDate)} remains against{" "}
                {money(committedRemainingCost(c, s))} of committed charge cost to
                the end date.
                {burn >= s.poBurnWarnRatio
                  ? " Raise a variation before the next invoice."
                  : ""}
              </div>
            ) : (
              <div className="note warn">
                No PO value recorded, so burn cannot be tracked. Invoices will
                not be payable without one.
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Contract history" ? (
        <div className="stack">
          <Card title="Variations">
            {variationsFor(data, c.id).length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Effective</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Change</th>
                      <th className="right">Value impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variationsFor(data, c.id).map((v) => (
                      <tr key={v.id}>
                        <td>{formatDate(v.effectiveFrom)}</td>
                        <td>
                          <span className="badge accent">
                            {VARIATION_TYPE_LABELS[v.type]}
                          </span>
                        </td>
                        <td className="small">{v.reference || "—"}</td>
                        <td className="small">
                          {v.previousEndDate !== v.newEndDate ? (
                            <div>
                              End date {formatDate(v.previousEndDate)} to{" "}
                              {formatDate(v.newEndDate)}
                            </div>
                          ) : null}
                          {v.previousRate !== v.newRate ? (
                            <div>
                              Rate {money(v.previousRate ?? 0)} to{" "}
                              {money(v.newRate ?? 0)}
                            </div>
                          ) : null}
                          {v.previousHoursPerWeek !== v.newHoursPerWeek ? (
                            <div>
                              Hours {v.previousHoursPerWeek} to{" "}
                              {v.newHoursPerWeek} per week
                            </div>
                          ) : null}
                          {v.notes ? (
                            <div className="faint">{v.notes}</div>
                          ) : null}
                        </td>
                        <td className="right num">
                          {v.valueImpact === null ? "—" : money(v.valueImpact)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>
                        Cumulative impact of {variationsFor(data, c.id).length}{" "}
                        variation
                        {variationsFor(data, c.id).length === 1 ? "" : "s"}
                      </td>
                      <td className="right num">
                        {money(
                          variationsFor(data, c.id).reduce(
                            (sum, v) => sum + (v.valueImpact ?? 0),
                            0
                          )
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Empty>
                No variations recorded. The original contract still stands as
                signed.
              </Empty>
            )}
          </Card>

          <Card
            title="Approvals"
            action={
              <Link href="/approvals" className="btn small">
                All approvals
              </Link>
            }
          >
            {approvalsFor(data, c.id).length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Type</th>
                      <th>State</th>
                      <th>With</th>
                      <th className="right">Waiting</th>
                      <th className="right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalsFor(data, c.id).map((a) => (
                      <tr key={a.id}>
                        <td className="small">{a.reference || "—"}</td>
                        <td>{APPROVAL_KIND_LABELS[a.kind]}</td>
                        <td>
                          <span
                            className={`badge ${
                              a.state === "approved"
                                ? "good"
                                : a.state === "rejected"
                                  ? "risk"
                                  : "accent"
                            }`}
                          >
                            {APPROVAL_STATE_LABELS[a.state]}
                          </span>
                        </td>
                        <td className="small">{a.currentApprover || "—"}</td>
                        <td className="right num">
                          {isApprovalOpen(a)
                            ? `${daysWithApprover(a) ?? 0}d`
                            : "—"}
                        </td>
                        <td className="right num">
                          {a.value === null ? "—" : money(a.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No approvals recorded against this engagement.</Empty>
            )}
          </Card>

          <Card
            title="Invoices"
            action={
              <Link href="/invoices" className="btn small">
                All invoices
              </Link>
            }
          >
            {invoicesFor(data, c.id).length ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th className="right">Ex GST</th>
                      <th className="right">Inc GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesFor(data, c.id).map((i) => (
                      <tr key={i.id}>
                        <td className="small">
                          {i.invoiceNumber || "not issued"}
                        </td>
                        <td className="small">
                          {formatDate(i.periodStart)} to{" "}
                          {formatDate(i.periodEnd)}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              i.status === "paid"
                                ? "good"
                                : i.status === "disputed" ||
                                    i.status === "on-hold"
                                  ? "risk"
                                  : "accent"
                            }`}
                          >
                            {INVOICE_STATUS_LABELS[i.status]}
                          </span>
                        </td>
                        <td className="right num">{money(i.amountExGst)}</td>
                        <td className="right num faint">
                          {money(invoiceTotal(i, s))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>Nothing invoiced yet.</Empty>
            )}
            <div className="note" style={{ marginTop: 12 }}>
              Paid to date {money(paidTotal(data, c.id))}
              {c.poValue
                ? ` against a purchase order of ${money(c.poValue)}`
                : ", with no purchase order recorded"}
              . Committed cost still to run is{" "}
              {money(committedRemainingCost(c, s))}.
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "Governance" ? (
        <div className="grid cols-2">
          <Card title="Compliance">
            <label className="row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={c.statusTestCompleted}
                onChange={(e) => set("statusTestCompleted", e.target.checked)}
              />
              Employment status test completed
            </label>
            <label className="row" style={{ marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={c.backgroundCheckCompleted}
                onChange={(e) =>
                  set("backgroundCheckCompleted", e.target.checked)
                }
              />
              Background check cleared
            </label>
            <label className="row" style={{ marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={c.healthSafetyInducted}
                onChange={(e) => set("healthSafetyInducted", e.target.checked)}
              />
              Health and safety induction completed
            </label>
            <Field label="Security clearance">
              <input
                type="text"
                value={c.securityClearance}
                onChange={(e) => set("securityClearance", e.target.value)}
              />
            </Field>
            <Field label="Work rights type">
              <input
                type="text"
                value={c.workRightsType}
                onChange={(e) => set("workRightsType", e.target.value)}
              />
            </Field>
            <Field label="Work rights expiry (blank if not time limited)">
              <input
                type="date"
                value={c.workRightsExpiry}
                onChange={(e) => set("workRightsExpiry", e.target.value)}
              />
            </Field>
            {c.workRightsExpiry && c.workRightsExpiry < c.endDate ? (
              <div className="note warn">
                Work rights expire before the contract ends. Renewed evidence is
                needed by {formatDate(c.workRightsExpiry)}.
              </div>
            ) : null}
          </Card>

          <Card title="Tenure and rehire">
            <dl className="kv">
              <dt>Continuous tenure</dt>
              <dd>
                {tenureMonths(c) ?? "—"} months
                {(tenureMonths(c) ?? 0) >= s.maxTenureMonths ? (
                  <span className="badge risk" style={{ marginLeft: 8 }}>
                    Past threshold
                  </span>
                ) : null}
              </dd>
              <dt>Extensions</dt>
              <dd>{c.extensionCount}</dd>
              <dt>Original end</dt>
              <dd>{formatDate(c.originalEndDate)}</dd>
              <dt>Current end</dt>
              <dd>{formatDate(c.endDate)}</dd>
            </dl>
            <Field label="Rehire eligibility">
              <select
                value={c.rehireEligible}
                onChange={(e) =>
                  set(
                    "rehireEligible",
                    e.target.value as Contractor["rehireEligible"]
                  )
                }
              >
                <option value="unknown">Not assessed</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Performance note">
              <textarea
                value={c.performanceNote}
                onChange={(e) => set("performanceNote", e.target.value)}
              />
            </Field>
            <div className="note">
              Keep this factual and role-related. It is a record the person can
              ask to see.
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "Allocation" ? (
        <Card
          title="Project and cost centre allocation"
          action={
            <button
              className="btn small"
              onClick={() =>
                mutate((t) =>
                  t.allocations.push({
                    projectId: data.projects[0]?.id ?? "",
                    sharePct: 0,
                  })
                )
              }
            >
              <Plus size={14} /> Add split
            </button>
          }
        >
          {c.allocations.length ? (
            c.allocations.map((a, idx) => {
              const project = data.projects.find((p) => p.id === a.projectId);
              return (
                <div className="repeat-row" key={idx}>
                  <select
                    value={a.projectId}
                    onChange={(e) =>
                      mutate((t) => {
                        t.allocations[idx].projectId = e.target.value;
                      })
                    }
                  >
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={a.sharePct}
                    min={0}
                    max={100}
                    onChange={(e) =>
                      mutate((t) => {
                        t.allocations[idx].sharePct = Number(e.target.value);
                      })
                    }
                  />
                  <span className="small muted num">
                    {((fteUnits(c, s) * a.sharePct) / 100).toFixed(0)} units
                  </span>
                  <button
                    className="btn small danger"
                    onClick={() =>
                      mutate((t) => {
                        t.allocations.splice(idx, 1);
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                  {project ? null : (
                    <span className="badge risk">Project missing</span>
                  )}
                </div>
              );
            })
          ) : (
            <Empty>No allocation recorded. The cost lands in Unallocated.</Empty>
          )}
          <div className={`note ${allocTotal === 100 ? "" : "warn"}`}>
            Allocated {allocTotal}% of this person&apos;s time.{" "}
            {allocTotal === 100
              ? "Fully allocated."
              : allocTotal > 100
                ? "Over 100%, which will double count cost. Fix the split."
                : `${100 - allocTotal}% will show as unallocated on the project view.`}
          </div>
        </Card>
      ) : null}

      {tab === "Access & lifecycle" ? (
        <div className="stack">
          <div className="grid cols-2">
            <Card
              title="System access"
              action={
                <button
                  className="btn small"
                  onClick={() =>
                    mutate((t) =>
                      t.accounts.push({
                        system: "",
                        status: "not-requested",
                        requestedOn: "",
                        revokedOn: "",
                      })
                    )
                  }
                >
                  <Plus size={14} /> Add
                </button>
              }
            >
              {c.accounts.length ? (
                c.accounts.map((a, idx) => (
                  <div className="repeat-row" key={idx}>
                    <input
                      type="text"
                      value={a.system}
                      placeholder="System"
                      onChange={(e) =>
                        mutate((t) => {
                          t.accounts[idx].system = e.target.value;
                        })
                      }
                    />
                    <select
                      value={a.status}
                      onChange={(e) =>
                        mutate((t) => {
                          t.accounts[idx].status = e.target
                            .value as (typeof t.accounts)[number]["status"];
                        })
                      }
                    >
                      <option value="not-requested">Not requested</option>
                      <option value="requested">Requested</option>
                      <option value="active">Active</option>
                      <option value="revoked">Revoked</option>
                    </select>
                    <span className="small faint">
                      {a.revokedOn ? formatDate(a.revokedOn) : ""}
                    </span>
                    <button
                      className="btn small danger"
                      onClick={() =>
                        mutate((t) => {
                          t.accounts.splice(idx, 1);
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <Empty>No accounts recorded.</Empty>
              )}
            </Card>

            <Card
              title="Assets"
              action={
                <button
                  className="btn small"
                  onClick={() =>
                    mutate((t) =>
                      t.assets.push({
                        item: "",
                        assetTag: "",
                        issuedOn: "",
                        returnedOn: "",
                      })
                    )
                  }
                >
                  <Plus size={14} /> Add
                </button>
              }
            >
              {c.assets.length ? (
                c.assets.map((a, idx) => (
                  <div className="repeat-row" key={idx}>
                    <input
                      type="text"
                      value={a.item}
                      placeholder="Item"
                      onChange={(e) =>
                        mutate((t) => {
                          t.assets[idx].item = e.target.value;
                        })
                      }
                    />
                    <input
                      type="text"
                      value={a.assetTag}
                      placeholder="Tag"
                      onChange={(e) =>
                        mutate((t) => {
                          t.assets[idx].assetTag = e.target.value;
                        })
                      }
                    />
                    <input
                      type="date"
                      value={a.returnedOn}
                      onChange={(e) =>
                        mutate((t) => {
                          t.assets[idx].returnedOn = e.target.value;
                        })
                      }
                    />
                    <button
                      className="btn small danger"
                      onClick={() =>
                        mutate((t) => {
                          t.assets.splice(idx, 1);
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <Empty>No assets issued.</Empty>
              )}
            </Card>
          </div>

          <div className="grid cols-2">
            {(["onboarding", "offboarding"] as const).map((phase) => (
              <Card
                key={phase}
                title={phase === "onboarding" ? "Onboarding" : "Offboarding"}
                action={
                  <button
                    className="btn small"
                    onClick={() =>
                      mutate((t) =>
                        t[phase].push({
                          task: "",
                          done: false,
                          dueDate: "",
                          owner: "",
                        })
                      )
                    }
                  >
                    <Plus size={14} /> Add
                  </button>
                }
              >
                {c[phase].length ? (
                  c[phase].map((item, idx) => (
                    <div className="repeat-row" key={idx}>
                      <label className="row" style={{ gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={(e) =>
                            mutate((t) => {
                              t[phase][idx].done = e.target.checked;
                            })
                          }
                        />
                        <input
                          type="text"
                          value={item.task}
                          onChange={(e) =>
                            mutate((t) => {
                              t[phase][idx].task = e.target.value;
                            })
                          }
                        />
                      </label>
                      <input
                        type="date"
                        value={item.dueDate}
                        onChange={(e) =>
                          mutate((t) => {
                            t[phase][idx].dueDate = e.target.value;
                          })
                        }
                      />
                      <input
                        type="text"
                        value={item.owner}
                        placeholder="Owner"
                        onChange={(e) =>
                          mutate((t) => {
                            t[phase][idx].owner = e.target.value;
                          })
                        }
                      />
                      <button
                        className="btn small danger"
                        onClick={() =>
                          mutate((t) => {
                            t[phase].splice(idx, 1);
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty>Nothing on the checklist.</Empty>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "Personal" ? (
        <div className="grid cols-2">
          <Card title="Contact and biographical">
            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="Email">
                <input
                  type="email"
                  value={c.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={c.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
              <Field label="Date of birth">
                <input
                  type="date"
                  value={c.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                />
              </Field>
              <Field label="Gender">
                <input
                  type="text"
                  value={c.gender}
                  onChange={(e) => set("gender", e.target.value)}
                />
              </Field>
              <Field label="Nationality">
                <input
                  type="text"
                  value={c.nationality}
                  onChange={(e) => set("nationality", e.target.value)}
                />
              </Field>
              <Field label="Location">
                <input
                  type="text"
                  value={c.location}
                  onChange={(e) => set("location", e.target.value)}
                />
              </Field>
            </div>
            <div className="note">
              Collect only what the engagement actually needs, and keep it in
              step with your privacy statement. If Cornerstone is the system of
              record for this person, treat that as master and this as a working
              copy.
            </div>
          </Card>

          <Card title="Emergency contact">
            <Field label="Name">
              <input
                type="text"
                value={c.emergencyContact.name}
                onChange={(e) =>
                  mutate((t) => {
                    t.emergencyContact.name = e.target.value;
                  })
                }
              />
            </Field>
            <Field label="Relationship">
              <input
                type="text"
                value={c.emergencyContact.relationship}
                onChange={(e) =>
                  mutate((t) => {
                    t.emergencyContact.relationship = e.target.value;
                  })
                }
              />
            </Field>
            <Field label="Phone">
              <input
                type="tel"
                value={c.emergencyContact.phone}
                onChange={(e) =>
                  mutate((t) => {
                    t.emergencyContact.phone = e.target.value;
                  })
                }
              />
            </Field>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />
            <div className="row">
              <Link href={`/comms?contractor=${c.id}`} className="btn">
                <Mail size={15} /> Comms and templates
              </Link>
              <button className="btn danger" onClick={remove}>
                <Trash2 size={15} /> Delete record
              </button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
