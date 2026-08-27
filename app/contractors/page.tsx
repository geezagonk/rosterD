"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Plus, Search } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import {
  annualisedCost,
  daysUntil,
  formatDate,
  formatMoney,
  fteUnits,
  fullName,
  isConsuming,
  poBurnRatio,
  rateVariance,
  tenureMonths,
  weeklyCost,
} from "@/lib/calc";
import { Contractor, ContractorStatus } from "@/lib/types";
import { Avatar, StatusBadge } from "@/components/ui";
import { download, registerRows, toCsv } from "@/lib/exporters";

type SortKey =
  | "name"
  | "team"
  | "vendor"
  | "fte"
  | "rate"
  | "annual"
  | "end"
  | "tenure";

function blankContractor(): Contractor {
  const iso = new Date().toISOString().slice(0, 10);
  return {
    id: newId("con"),
    firstName: "",
    lastName: "",
    preferredName: "",
    workerId: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    nationality: "",
    workRightsType: "",
    workRightsExpiry: "",
    location: "",
    emergencyContact: { name: "", relationship: "", phone: "" },
    engagementType: "intermediated",
    vendorId: null,
    role: "",
    team: "",
    hiringManager: "",
    status: "pipeline",
    startDate: iso,
    endDate: iso,
    originalEndDate: iso,
    hoursPerWeek: 40,
    rateBasis: "hourly",
    chargeRate: 0,
    payRate: null,
    contractRef: "",
    poNumber: "",
    poValue: null,
    poSpentToDate: 0,
    extensionCount: 0,
    noticePeriodDays: 20,
    statusTestCompleted: false,
    backgroundCheckCompleted: false,
    healthSafetyInducted: false,
    securityClearance: "Standard",
    approvalRef: "",
    rehireEligible: "unknown",
    performanceNote: "",
    allocations: [],
    accounts: [],
    assets: [],
    onboarding: [],
    offboarding: [],
    notes: "",
  };
}

export default function RegisterPage() {
  const { data, ready, update } = useStore();
  const router = useRouter();
  const s = data.settings;

  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [vendor, setVendor] = useState("all");
  const [status, setStatus] = useState<ContractorStatus | "all" | "engaged">(
    "engaged"
  );
  const [sort, setSort] = useState<SortKey>("end");
  const [asc, setAsc] = useState(true);

  const teams = useMemo(
    () => Array.from(new Set(data.contractors.map((c) => c.team))).sort(),
    [data.contractors]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = data.contractors.filter((c) => {
      if (status === "engaged" && !isConsuming(c)) return false;
      if (status !== "all" && status !== "engaged" && c.status !== status)
        return false;
      if (team !== "all" && c.team !== team) return false;
      if (vendor !== "all") {
        if (vendor === "direct" && c.vendorId) return false;
        if (vendor !== "direct" && c.vendorId !== vendor) return false;
      }
      if (!q) return true;
      return [
        fullName(c),
        c.role,
        c.team,
        c.contractRef,
        c.poNumber,
        c.hiringManager,
        c.email,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    const dir = asc ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return fullName(a).localeCompare(fullName(b)) * dir;
        case "team":
          return a.team.localeCompare(b.team) * dir;
        case "vendor":
          return (
            (data.vendors.find((v) => v.id === a.vendorId)?.name ?? "Direct")
              .localeCompare(
                data.vendors.find((v) => v.id === b.vendorId)?.name ?? "Direct"
              ) * dir
          );
        case "fte":
          return (fteUnits(a, s) - fteUnits(b, s)) * dir;
        case "rate":
          return (a.chargeRate - b.chargeRate) * dir;
        case "annual":
          return (annualisedCost(a, s) - annualisedCost(b, s)) * dir;
        case "tenure":
          return ((tenureMonths(a) ?? 0) - (tenureMonths(b) ?? 0)) * dir;
        default:
          return a.endDate.localeCompare(b.endDate) * dir;
      }
    });
    return list;
  }, [data.contractors, data.vendors, query, team, vendor, status, sort, asc, s]);

  if (!ready) return <div className="empty">Loading register…</div>;

  const totals = rows.reduce(
    (acc, c) => {
      acc.fte += fteUnits(c, s);
      acc.weekly += weeklyCost(c, s);
      acc.annual += annualisedCost(c, s);
      return acc;
    },
    { fte: 0, weekly: 0, annual: 0 }
  );

  const th = (key: SortKey, label: string, right = false) => (
    <th
      className={`sortable ${right ? "right" : ""}`}
      onClick={() => {
        if (sort === key) setAsc(!asc);
        else {
          setSort(key);
          setAsc(true);
        }
      }}
    >
      {label}
      {sort === key ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );

  const addContractor = () => {
    const c = blankContractor();
    update((draft) => {
      draft.contractors.push(c);
      return draft;
    });
    router.push(`/contractors/${c.id}`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Register</h1>
          <p>
            Every contingent worker, engaged or otherwise. FTE units are shown
            on the {s.fteScale}-point scale, so {s.fteScale} equals a full{" "}
            {s.standardWeekHours} hour week.
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              download(
                "rostered-register.csv",
                toCsv(registerRows(data)),
                "text/csv;charset=utf-8"
              )
            }
          >
            <Download size={15} /> Export CSV
          </button>
          <button className="btn primary" onClick={addContractor}>
            <Plus size={15} /> Add contractor
          </button>
        </div>
      </div>

      <div className="toolbar">
        <span style={{ position: "relative", display: "inline-flex" }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--ink-faint)",
            }}
          />
          <input
            type="text"
            value={query}
            placeholder="Name, role, contract, PO…"
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 32, minWidth: 260 }}
          />
        </span>
        <select
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as ContractorStatus | "all" | "engaged")
          }
        >
          <option value="engaged">Engaged now</option>
          <option value="all">All statuses</option>
          <option value="pipeline">Pipeline</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="notice">On notice</option>
          <option value="ended">Ended</option>
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="all">All vendors</option>
          <option value="direct">Direct engagement</option>
          {data.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="small muted">
          {rows.length} of {data.contractors.length}
        </span>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {th("name", "Contractor")}
                <th>Status</th>
                {th("team", "Team")}
                {th("vendor", "Vendor")}
                {th("fte", "FTE", true)}
                {th("rate", "Rate", true)}
                {th("annual", "Annualised", true)}
                {th("end", "Ends")}
                <th className="right">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => {
                const v = data.vendors.find((x) => x.id === c.vendorId);
                const days = daysUntil(c.endDate);
                const burn = poBurnRatio(c);
                const rv = rateVariance(c, data);
                const tenure = tenureMonths(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/contractors/${c.id}`} className="person">
                        <Avatar name={fullName(c)} index={i} />
                        <span className="who">
                          <b>{fullName(c)}</b>
                          <span>{c.role}</span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>{c.team}</td>
                    <td>
                      {v ? (
                        <Link href={`/vendors#${v.id}`}>{v.name}</Link>
                      ) : (
                        <span className="faint">Direct</span>
                      )}
                    </td>
                    <td className="right num">{fteUnits(c, s).toFixed(0)}</td>
                    <td className="right num">
                      {formatMoney(c.chargeRate, s.currency)}
                      <span className="faint small">
                        {c.rateBasis === "hourly" ? "/hr" : "/day"}
                      </span>
                    </td>
                    <td className="right num">
                      {formatMoney(annualisedCost(c, s), s.currency)}
                    </td>
                    <td>
                      {formatDate(c.endDate)}
                      {isConsuming(c) && days !== null && days <= s.endWarningDays ? (
                        <div className="small">
                          <span
                            className={`badge ${days < 0 ? "risk" : days <= 21 ? "warn" : ""}`}
                          >
                            {days < 0 ? `${Math.abs(days)}d over` : `${days}d`}
                          </span>
                        </div>
                      ) : null}
                    </td>
                    <td className="right">
                      <span className="row" style={{ justifyContent: "flex-end", gap: 4 }}>
                        {burn !== null && burn >= s.poBurnWarnRatio ? (
                          <span className="badge warn" title="Purchase order nearly consumed">
                            PO {Math.round(burn * 100)}%
                          </span>
                        ) : null}
                        {tenure !== null && tenure >= s.maxTenureMonths && isConsuming(c) ? (
                          <span className="badge risk" title="Past the tenure review threshold">
                            {tenure}m
                          </span>
                        ) : null}
                        {rv && rv.variance > s.rateVarianceWarnRatio ? (
                          <span className="badge pink" title="Charge rate above benchmark">
                            +{(rv.variance * 100).toFixed(0)}%
                          </span>
                        ) : null}
                        {!c.statusTestCompleted && isConsuming(c) ? (
                          <span className="badge risk" title="Employment status test not completed">
                            Status test
                          </span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="empty">
                    Nothing matches those filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {rows.length ? (
              <tfoot>
                <tr>
                  <td colSpan={4}>{rows.length} shown</td>
                  <td className="right num">{totals.fte.toFixed(0)}</td>
                  <td className="right faint small">
                    {(totals.fte / s.fteScale).toFixed(2)} FTE
                  </td>
                  <td className="right num">
                    {formatMoney(totals.annual, s.currency)}
                  </td>
                  <td colSpan={2} className="right faint small">
                    {formatMoney(totals.weekly, s.currency)} per week
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}
