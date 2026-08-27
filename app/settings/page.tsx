"use client";

import { useRef } from "react";
import { Database, Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { Settings } from "@/lib/types";
import { Card, Field } from "@/components/ui";
import {
  allocationRows,
  approvalRows,
  chaseRows,
  commsRows,
  download,
  invoiceRows,
  projectRows,
  registerRows,
  reminderRows,
  spendRows,
  toCsv,
  toSqlInserts,
  variationRows,
  vendorRows,
} from "@/lib/exporters";

export default function SettingsPage() {
  const { data, ready, update, replace, resetToSeed, resetToEmpty } = useStore();
  const fileInput = useRef<HTMLInputElement>(null);
  const s = data.settings;

  if (!ready) return <div className="empty">Loading…</div>;

  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    update((draft) => {
      (draft.settings[key] as Settings[K]) = value;
      return draft;
    });

  const num = (key: keyof Settings, label: string, step = "1") => (
    <Field label={label}>
      <input
        type="number"
        step={step}
        value={String(s[key])}
        onChange={(e) => setSetting(key, Number(e.target.value) as never)}
      />
    </Field>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>
            The FTE model, thresholds and rate card. Change these and every
            calculation, flag and reminder in the app follows.
          </p>
        </div>
      </div>

      <div className="grid cols-2">
        <Card title="FTE model">
          <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
            {num("standardWeekHours", "Standard week (hours)", "0.5")}
            {num("fteScale", "FTE scale (units per 1.0 FTE)")}
            {num("departmentFteBudget", "Department FTE ceiling", "0.1")}
            {num("permanentFte", "Permanent establishment (FTE)", "0.1")}
            {num("workingDaysPerWeek", "Working days per week", "0.5")}
            {num("weeksPerYear", "Weeks per year")}
          </div>
          <div className="note">
            {s.fteScale} units = 1.0 FTE = {s.standardWeekHours} hours a week.
            The department ceiling of {s.departmentFteBudget} FTE is{" "}
            {(s.departmentFteBudget * s.fteScale).toLocaleString()} units, of
            which {(s.permanentFte * s.fteScale).toLocaleString()} is assumed
            permanent, leaving{" "}
            {((s.departmentFteBudget - s.permanentFte) * s.fteScale).toLocaleString()}{" "}
            units of contractor headroom.
          </div>
        </Card>

        <Card title="Thresholds">
          <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
            <Field label="Currency">
              <input
                type="text"
                value={s.currency}
                onChange={(e) => setSetting("currency", e.target.value)}
              />
            </Field>
            {num("endWarningDays", "Contract end warning (days)")}
            {num("maxTenureMonths", "Tenure review threshold (months)")}
            {num("poBurnWarnRatio", "PO burn warning (0-1)", "0.05")}
            {num(
              "vendorConcentrationWarnRatio",
              "Vendor concentration warning (0-1)",
              "0.05"
            )}
            {num("rateVarianceWarnRatio", "Rate variance warning (0-1)", "0.01")}
            {num("approvalThreshold", "Approval threshold", "1000")}
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Invoice and approval handling">
          <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
            {num("gstRate", "GST rate (0-1)", "0.01")}
            {num("invoiceApprovalSlaDays", "Invoice approval service level (days)")}
            {num("defaultPaymentTermsDays", "Default payment terms (days)")}
            {num("approvalChaseAfterDays", "Chase an approval after (days)")}
            {num("invoiceExpectedAfterDays", "Flag a missing invoice after (days)")}
          </div>
          <div className="note">
            These drive the chase queue. An invoice sitting with an approver for
            more than {s.invoiceApprovalSlaDays} days, or an approval sitting
            with the same person for more than {s.approvalChaseAfterDays} days,
            generates a reminder automatically.
          </div>
        </Card>

        <Card title="Organisation">
          <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
            <Field label="Organisation name">
              <input
                type="text"
                value={s.organisationName}
                onChange={(e) => setSetting("organisationName", e.target.value)}
              />
            </Field>
            <Field label="Team">
              <input
                type="text"
                value={s.teamName}
                onChange={(e) => setSetting("teamName", e.target.value)}
              />
            </Field>
          </div>
          <div className="note">
            Used on the reporting pack header and in generated emails. The demo
            data set is illustrative only: the people, suppliers, references and
            figures in it are invented.
          </div>
        </Card>
      </div>

      <Card
        title="Rate card benchmarks"
        action={
          <button
            className="btn small"
            onClick={() =>
              update((draft) => {
                draft.rateCard.push({
                  id: newId("rc"),
                  role: "",
                  level: "",
                  benchmarkHourly: 0,
                  source: "",
                  reviewedOn: "",
                });
                return draft;
              })
            }
          >
            <Plus size={14} /> Add
          </button>
        }
      >
        <p className="small muted" style={{ marginTop: 0 }}>
          Matched to contractors by role name, case insensitive. Anything above
          the benchmark by more than{" "}
          {(s.rateVarianceWarnRatio * 100).toFixed(0)}% gets flagged on the
          register.
        </p>
        {data.rateCard.map((r, idx) => (
          <div className="repeat-row" key={r.id}>
            <input
              type="text"
              value={r.role}
              placeholder="Role"
              onChange={(e) =>
                update((draft) => {
                  draft.rateCard[idx].role = e.target.value;
                  return draft;
                })
              }
            />
            <input
              type="number"
              value={r.benchmarkHourly}
              onChange={(e) =>
                update((draft) => {
                  draft.rateCard[idx].benchmarkHourly = Number(e.target.value);
                  return draft;
                })
              }
            />
            <input
              type="text"
              value={r.level}
              placeholder="Level"
              onChange={(e) =>
                update((draft) => {
                  draft.rateCard[idx].level = e.target.value;
                  return draft;
                })
              }
            />
            <button
              className="btn small danger"
              onClick={() =>
                update((draft) => {
                  draft.rateCard.splice(idx, 1);
                  return draft;
                })
              }
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </Card>

      <Card title="Data">
        <p className="small muted" style={{ marginTop: 0 }}>
          Everything lives in this browser&apos;s local storage. Export
          regularly, and use the SQL script when you want the register in a
          database that Power BI can reach.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              download(
                "rostered-backup.json",
                JSON.stringify(data, null, 2),
                "application/json"
              )
            }
          >
            <Download size={15} /> Export JSON backup
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            <Upload size={15} /> Import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                replace(JSON.parse(await file.text()));
              } catch {
                window.alert("That file could not be read as Rostered JSON.");
              }
              e.target.value = "";
            }}
          />
          <button
            className="btn"
            onClick={() =>
              download(
                "rostered-insert.sql",
                toSqlInserts(data),
                "application/sql"
              )
            }
          >
            <Database size={15} /> Export T-SQL inserts
          </button>
        </div>

        <h3 style={{ margin: "18px 0 8px" }}>Table exports for Power BI</h3>
        <div className="row">
          {(
            [
              ["Register", "register", registerRows],
              ["Allocations", "allocations", allocationRows],
              ["Vendors", "vendors", vendorRows],
              ["Projects", "projects", projectRows],
              ["Comms", "comms", commsRows],
              ["Reminders", "reminders", reminderRows],
              ["Invoices", "invoices", invoiceRows],
              ["Approvals", "approvals", approvalRows],
              ["Variations", "variations", variationRows],
              ["Chases", "chases", chaseRows],
              ["Spend", "spend", spendRows],
            ] as const
          ).map(([label, slug, fn]) => (
            <button
              key={slug}
              className="btn small"
              onClick={() =>
                download(
                  `rostered-${slug}.csv`,
                  toCsv(fn(data) as Array<Record<string, unknown>>),
                  "text/csv;charset=utf-8"
                )
              }
            >
              {label}.csv
            </button>
          ))}
        </div>

        <h3 style={{ margin: "18px 0 8px" }}>Reset</h3>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              if (window.confirm("Replace everything with the demo data set?"))
                resetToSeed();
            }}
          >
            <RotateCcw size={15} /> Reload demo data
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (
                window.confirm(
                  "Delete every record and start from an empty register?"
                )
              )
                resetToEmpty();
            }}
          >
            <Trash2 size={15} /> Clear everything
          </button>
        </div>
      </Card>
    </div>
  );
}
