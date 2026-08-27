"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Download,
  FileWarning,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { formatDate, formatMoney, fullName, toISO, today } from "@/lib/calc";
import {
  AGEING_ORDER,
  INVOICE_STATUS_LABELS,
  ageingBucket,
  ageingSummary,
  daysAwaitingApproval,
  daysSinceLastChase,
  daysToPaymentDue,
  invoiceApprovalBreached,
  invoiceIsMissing,
  invoiceIsOverdue,
  invoicePosition,
  invoiceTotal,
  suggestedDueDate,
} from "@/lib/operations";
import { Invoice, InvoiceStatus } from "@/lib/types";
import { Bar, Card, Empty, Field, Stat } from "@/components/ui";
import ChaseLog from "@/components/ChaseLog";
import { download, invoiceRows, toCsv } from "@/lib/exporters";

function blankInvoice(contractorId: string, vendorId: string | null): Invoice {
  const iso = toISO(today());
  return {
    id: newId("inv"),
    contractorId,
    vendorId,
    invoiceNumber: "",
    poNumber: "",
    periodStart: iso,
    periodEnd: iso,
    hoursClaimed: null,
    amountExGst: 0,
    receivedOn: iso,
    dueDate: "",
    status: "received",
    approver: "",
    sentForApprovalOn: iso,
    approvedOn: "",
    paidOn: "",
    disputeReason: "",
    chases: [],
    notes: "",
  };
}

type Lens = "action" | "all" | "unpaid" | "paid";

export default function InvoicesPage() {
  const { data, ready, update } = useStore();
  const [lens, setLens] = useState<Lens>("action");
  const [openId, setOpenId] = useState<string | null>(null);
  const s = data.settings;

  const rows = useMemo(() => {
    const list = [...data.invoices];
    const needsAction = (i: Invoice) =>
      invoiceIsOverdue(i) ||
      invoiceApprovalBreached(i, s) ||
      invoiceIsMissing(i, s) ||
      i.status === "disputed" ||
      i.status === "on-hold";

    const filtered =
      lens === "action"
        ? list.filter(needsAction)
        : lens === "unpaid"
          ? list.filter((i) => i.status !== "paid")
          : lens === "paid"
            ? list.filter((i) => i.status === "paid")
            : list;

    return filtered.sort((a, b) => {
      const ad = daysToPaymentDue(a) ?? 9999;
      const bd = daysToPaymentDue(b) ?? 9999;
      return ad - bd;
    });
  }, [data.invoices, lens, s]);

  if (!ready) return <div className="empty">Loading…</div>;

  const money = (n: number) => formatMoney(n, s.currency);
  const pos = invoicePosition(data);
  const ageing = ageingSummary(data);
  const maxAgeing = Math.max(...ageing.map((a) => a.amountExGst), 1);

  const set = <K extends keyof Invoice>(id: string, key: K, value: Invoice[K]) =>
    update((draft) => {
      const i = draft.invoices.find((x) => x.id === id);
      if (!i) return draft;
      (i[key] as Invoice[K]) = value;
      // Stamp the dates that drive the ageing, so nobody has to remember to.
      if (key === "status") {
        const stamp = toISO(today());
        if (value === "with-approver" && !i.sentForApprovalOn)
          i.sentForApprovalOn = stamp;
        if (value === "approved" && !i.approvedOn) i.approvedOn = stamp;
        if (value === "paid" && !i.paidOn) i.paidOn = stamp;
        if (value === "received" && !i.receivedOn) i.receivedOn = stamp;
      }
      if (key === "receivedOn" && !i.dueDate) {
        const suggested = suggestedDueDate(draft, i);
        if (suggested) i.dueDate = suggested;
      }
      return draft;
    });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Invoices and payments</h1>
          <p>
            Received, approved, paid, disputed and the ones that never turned up.
            Ageing runs from the payment due date, and the approval clock runs
            from the day it went out for internal sign-off.
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              download(
                "rostered-invoices.csv",
                toCsv(invoiceRows(data)),
                "text/csv;charset=utf-8"
              )
            }
          >
            <Download size={15} /> Export CSV
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const c = data.contractors[0];
              const inv = blankInvoice(c?.id ?? "", c?.vendorId ?? null);
              update((draft) => {
                draft.invoices.unshift(inv);
                return draft;
              });
              setOpenId(inv.id);
            }}
          >
            <Plus size={15} /> Add invoice
          </button>
        </div>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Awaiting approval"
          value={money(pos.awaitingApprovalValue)}
          sub={`${pos.awaitingApprovalCount} invoices, ${pos.slaBreachCount} past the ${s.invoiceApprovalSlaDays} day service level`}
          icon={<Wallet size={18} />}
          tone={pos.slaBreachCount ? "peach" : "accent"}
        />
        <Stat
          label="Approved, not yet paid"
          value={money(pos.awaitingPaymentValue)}
          sub={`${pos.awaitingPaymentCount} invoices with Accounts Payable`}
          icon={<Banknote size={18} />}
          tone="blue"
        />
        <Stat
          label="Overdue"
          value={money(pos.overdueValue)}
          sub={`${pos.overdueCount} past their payment due date`}
          icon={<AlertTriangle size={18} />}
          tone={pos.overdueCount ? "red" : "green"}
        />
        <Stat
          label="Disputed or missing"
          value={money(pos.disputedValue + pos.missingValue)}
          sub={`${pos.disputedCount} in dispute, ${pos.missingCount} never received`}
          icon={<FileWarning size={18} />}
          tone={pos.disputedCount + pos.missingCount ? "peach" : "green"}
        />
      </div>

      <div className="grid cols-2">
        <Card title="Ageing from payment due date">
          {ageing.map((row) => (
            <Bar
              key={row.bucket}
              label={
                <span>
                  {row.bucket === "current" ? "Not yet due" : `${row.bucket} days`}
                  <span className="faint small"> · {row.count}</span>
                </span>
              }
              value={row.amountExGst}
              max={maxAgeing}
              display={money(row.amountExGst)}
              tone={
                row.bucket === "current"
                  ? undefined
                  : row.bucket === "1-30"
                    ? "warn"
                    : "alt"
              }
            />
          ))}
          <div className="note" style={{ marginTop: 10 }}>
            Values are exclusive of GST. Add {(s.gstRate * 100).toFixed(0)}% for
            the figure the supplier is actually chasing.
          </div>
        </Card>

        <Card title="This month">
          <dl className="kv">
            <dt>Paid</dt>
            <dd>{money(pos.paidThisMonthValue)}</dd>
            <dt>In the approval queue</dt>
            <dd>
              {money(pos.awaitingApprovalValue)} across{" "}
              {pos.awaitingApprovalCount} invoices
            </dd>
            <dt>Sitting with Accounts Payable</dt>
            <dd>{money(pos.awaitingPaymentValue)}</dd>
            <dt>Blocked</dt>
            <dd>
              {money(pos.disputedValue)} disputed or on hold,{" "}
              {money(pos.missingValue)} not received
            </dd>
          </dl>
          {pos.missingCount ? (
            <div className="note warn" style={{ marginTop: 12 }}>
              {pos.missingCount} expected invoice
              {pos.missingCount === 1 ? "" : "s"} did not arrive within{" "}
              {s.invoiceExpectedAfterDays} days of the period ending. Those are
              the ones that quietly land in the wrong month and wreck the
              accrual.
            </div>
          ) : null}
        </Card>
      </div>

      <div className="tabs">
        {(
          [
            ["action", "Needs action"],
            ["unpaid", "Unpaid"],
            ["paid", "Paid"],
            ["all", "Everything"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={lens === k ? "active" : ""}
            onClick={() => setLens(k)}
          >
            {label}
          </button>
        ))}
      </div>

      {rows.length ? (
        <section className="card">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Contractor</th>
                  <th>Period</th>
                  <th className="right">Ex GST</th>
                  <th className="right">Inc GST</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="right">Flags</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const c = data.contractors.find((x) => x.id === i.contractorId);
                  const v = data.vendors.find((x) => x.id === i.vendorId);
                  const dueIn = daysToPaymentDue(i);
                  const approvalDays = daysAwaitingApproval(i);
                  const chased = daysSinceLastChase(i.chases);
                  return (
                    <tr key={i.id}>
                      <td>
                        <b>{i.invoiceNumber || "—"}</b>
                        <div className="small faint">
                          {v ? v.name : "Direct"} · {i.poNumber || "no PO"}
                        </div>
                      </td>
                      <td>
                        {c ? (
                          <Link href={`/contractors/${c.id}`}>{fullName(c)}</Link>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td className="small">
                        {formatDate(i.periodStart)}
                        <br />
                        {formatDate(i.periodEnd)}
                      </td>
                      <td className="right num">{money(i.amountExGst)}</td>
                      <td className="right num faint">
                        {money(invoiceTotal(i, s))}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            i.status === "paid"
                              ? "good"
                              : i.status === "disputed" || i.status === "on-hold"
                                ? "risk"
                                : i.status === "expected"
                                  ? ""
                                  : "accent"
                          }`}
                        >
                          {INVOICE_STATUS_LABELS[i.status]}
                        </span>
                      </td>
                      <td className="small">
                        {i.dueDate ? formatDate(i.dueDate) : "—"}
                        {dueIn !== null ? (
                          <div>
                            <span
                              className={`badge ${dueIn < 0 ? "risk" : dueIn <= 7 ? "warn" : ""}`}
                            >
                              {dueIn < 0 ? `${Math.abs(dueIn)}d over` : `${dueIn}d`}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="right">
                        <span
                          className="row"
                          style={{ justifyContent: "flex-end", gap: 4 }}
                        >
                          {invoiceApprovalBreached(i, s) ? (
                            <span className="badge warn">
                              {approvalDays}d with {i.approver || "approver"}
                            </span>
                          ) : null}
                          {invoiceIsMissing(i, s) ? (
                            <span className="badge risk">Not received</span>
                          ) : null}
                          {chased !== null ? (
                            <span className="badge">chased {chased}d ago</span>
                          ) : null}
                          {ageingBucket(i) !== "current" && i.status !== "paid" ? (
                            <span className="badge risk">
                              {ageingBucket(i)}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="right">
                        <button
                          className="btn small"
                          onClick={() => setOpenId(openId === i.id ? null : i.id)}
                        >
                          {openId === i.id ? "Close" : "Open"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>{rows.length} shown</td>
                  <td className="right num">
                    {money(rows.reduce((sum, i) => sum + i.amountExGst, 0))}
                  </td>
                  <td className="right num">
                    {money(
                      rows.reduce((sum, i) => sum + invoiceTotal(i, s), 0)
                    )}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      ) : (
        <Card>
          <Empty>
            {lens === "action"
              ? "Nothing needs chasing. Rare, and probably temporary."
              : "No invoices match that view."}
          </Empty>
        </Card>
      )}

      {openId
        ? (() => {
            const i = data.invoices.find((x) => x.id === openId);
            if (!i) return null;
            return (
              <Card title={`Invoice ${i.invoiceNumber || "(unnumbered)"}`}>
                <div className="grid cols-3" style={{ gap: 0, columnGap: 14 }}>
                  <Field label="Contractor">
                    <select
                      value={i.contractorId}
                      onChange={(e) => {
                        const c = data.contractors.find(
                          (x) => x.id === e.target.value
                        );
                        set(i.id, "contractorId", e.target.value);
                        if (c) set(i.id, "vendorId", c.vendorId);
                      }}
                    >
                      {data.contractors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {fullName(c)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Invoice number">
                    <input
                      type="text"
                      value={i.invoiceNumber}
                      onChange={(e) =>
                        set(i.id, "invoiceNumber", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="PO number">
                    <input
                      type="text"
                      value={i.poNumber}
                      onChange={(e) => set(i.id, "poNumber", e.target.value)}
                    />
                  </Field>
                  <Field label="Period start">
                    <input
                      type="date"
                      value={i.periodStart}
                      onChange={(e) => set(i.id, "periodStart", e.target.value)}
                    />
                  </Field>
                  <Field label="Period end">
                    <input
                      type="date"
                      value={i.periodEnd}
                      onChange={(e) => set(i.id, "periodEnd", e.target.value)}
                    />
                  </Field>
                  <Field label="Hours claimed">
                    <input
                      type="number"
                      value={i.hoursClaimed ?? ""}
                      onChange={(e) =>
                        set(
                          i.id,
                          "hoursClaimed",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                  </Field>
                  <Field label={`Amount ex GST (${s.currency})`}>
                    <input
                      type="number"
                      value={i.amountExGst}
                      onChange={(e) =>
                        set(i.id, "amountExGst", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={i.status}
                      onChange={(e) =>
                        set(i.id, "status", e.target.value as InvoiceStatus)
                      }
                    >
                      {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Internal approver">
                    <input
                      type="text"
                      value={i.approver}
                      onChange={(e) => set(i.id, "approver", e.target.value)}
                    />
                  </Field>
                  <Field label="Received on">
                    <input
                      type="date"
                      value={i.receivedOn}
                      onChange={(e) => set(i.id, "receivedOn", e.target.value)}
                    />
                  </Field>
                  <Field label="Sent for approval">
                    <input
                      type="date"
                      value={i.sentForApprovalOn}
                      onChange={(e) =>
                        set(i.id, "sentForApprovalOn", e.target.value)
                      }
                    />
                  </Field>
                  <Field label="Approved on">
                    <input
                      type="date"
                      value={i.approvedOn}
                      onChange={(e) => set(i.id, "approvedOn", e.target.value)}
                    />
                  </Field>
                  <Field label="Payment due">
                    <input
                      type="date"
                      value={i.dueDate}
                      onChange={(e) => set(i.id, "dueDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Paid on">
                    <input
                      type="date"
                      value={i.paidOn}
                      onChange={(e) => set(i.id, "paidOn", e.target.value)}
                    />
                  </Field>
                </div>

                <Field label="Dispute or hold reason">
                  <textarea
                    value={i.disputeReason}
                    onChange={(e) =>
                      set(i.id, "disputeReason", e.target.value)
                    }
                  />
                </Field>
                <Field label="Notes">
                  <textarea
                    value={i.notes}
                    onChange={(e) => set(i.id, "notes", e.target.value)}
                  />
                </Field>

                <div className="note">
                  {money(i.amountExGst)} ex GST ·{" "}
                  {money(invoiceTotal(i, s))} inc GST at{" "}
                  {(s.gstRate * 100).toFixed(0)}%
                  {i.dueDate
                    ? ` · due ${formatDate(i.dueDate)}`
                    : " · no payment due date set"}
                </div>

                <div style={{ marginTop: 16 }}>
                  <ChaseLog
                    chases={i.chases}
                    defaultWho={i.approver}
                    onChange={(next) => set(i.id, "chases", next)}
                  />
                </div>

                <button
                  className="btn small danger"
                  style={{ marginTop: 14 }}
                  onClick={() => {
                    update((draft) => {
                      draft.invoices = draft.invoices.filter(
                        (x) => x.id !== i.id
                      );
                      return draft;
                    });
                    setOpenId(null);
                  }}
                >
                  <Trash2 size={13} /> Delete invoice
                </button>
              </Card>
            );
          })()
        : null}
    </div>
  );
}
