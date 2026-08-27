"use client";

import { useState } from "react";
import Link from "next/link";
import { AlarmClock, Clock, Plus, Trash2, UserCheck } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { days, formatDate, formatMoney, fullName, toISO, today } from "@/lib/calc";
import {
  APPROVAL_KIND_LABELS,
  APPROVAL_STATE_LABELS,
  approvalAge,
  approvalDaysToDeadline,
  approvalIsStalled,
  approvalPosition,
  daysSinceLastChase,
  daysWithApprover,
  isApprovalOpen,
} from "@/lib/operations";
import { Approval, ApprovalKind, ApprovalState } from "@/lib/types";
import { Card, Empty, Field, Stat } from "@/components/ui";
import ChaseLog from "@/components/ChaseLog";

function blankApproval(contractorId: string): Approval {
  const iso = toISO(today());
  return {
    id: newId("apr"),
    contractorId,
    kind: "extension",
    reference: "",
    description: "",
    value: null,
    raisedOn: iso,
    requiredBy: "",
    state: "draft",
    currentApprover: "",
    currentApproverRole: "",
    withApproverSince: iso,
    decidedOn: "",
    chases: [],
    notes: "",
  };
}

export default function ApprovalsPage() {
  const { data, ready, update } = useStore();
  const [show, setShow] = useState<"open" | "all">("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const s = data.settings;

  if (!ready) return <div className="empty">Loading…</div>;

  const money = (n: number) => formatMoney(n, s.currency);
  const pos = approvalPosition(data);

  const list = data.approvals
    .filter((a) => (show === "open" ? isApprovalOpen(a) : true))
    .sort((a, b) => {
      const av = daysWithApprover(a) ?? -1;
      const bv = daysWithApprover(b) ?? -1;
      return bv - av;
    });

  const set = <K extends keyof Approval>(
    id: string,
    key: K,
    value: Approval[K]
  ) =>
    update((draft) => {
      const a = draft.approvals.find((x) => x.id === id);
      if (!a) return draft;
      // Moving to a different approver restarts the ageing clock, which is the
      // whole point of tracking it separately from the raised date.
      if (key === "currentApprover" && a.currentApprover !== value) {
        a.withApproverSince = toISO(today());
      }
      if (key === "state" && (value === "approved" || value === "rejected")) {
        a.decidedOn = a.decidedOn || toISO(today());
      }
      (a[key] as Approval[K]) = value;
      return draft;
    });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p>
            Every contract, variation and purchase order change waiting on a
            decision, ordered by how long it has been sitting with somebody.
            That ordering is deliberate: the oldest item is almost always the
            one about to cause a problem.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            const a = blankApproval(data.contractors[0]?.id ?? "");
            update((draft) => {
              draft.approvals.unshift(a);
              return draft;
            });
            setOpenId(a.id);
          }}
        >
          <Plus size={15} /> Raise approval
        </button>
      </div>

      <div className="grid cols-4">
        <Stat
          label="Open approvals"
          value={pos.openCount}
          sub={`${money(pos.openValue)} of value awaiting a decision`}
          icon={<UserCheck size={18} />}
          tone="accent"
        />
        <Stat
          label="Stalled"
          value={pos.stalledCount}
          sub={`Sitting longer than ${s.approvalChaseAfterDays} days`}
          icon={<Clock size={18} />}
          tone={pos.stalledCount ? "peach" : "green"}
        />
        <Stat
          label="Past required-by date"
          value={pos.lateCount}
          sub="Decision date already gone"
          icon={<AlarmClock size={18} />}
          tone={pos.lateCount ? "red" : "green"}
        />
        <Stat
          label="Longest wait"
          value={`${pos.oldestDays}d`}
          sub={
            pos.byApprover[0]
              ? `Oldest is with ${pos.byApprover[0].approver}`
              : "Nothing outstanding"
          }
          icon={<Clock size={18} />}
          tone={pos.oldestDays > s.approvalChaseAfterDays * 2 ? "red" : "blue"}
        />
      </div>

      {pos.byApprover.length ? (
        <Card title="Who is holding what">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Approver</th>
                  <th className="right">Items</th>
                  <th className="right">Value</th>
                  <th className="right">Longest wait</th>
                </tr>
              </thead>
              <tbody>
                {pos.byApprover.map((row) => (
                  <tr key={row.approver}>
                    <td>{row.approver}</td>
                    <td className="right num">{row.count}</td>
                    <td className="right num">{money(row.value)}</td>
                    <td className="right">
                      <span
                        className={`badge ${
                          row.oldestDays >= s.approvalChaseAfterDays * 2
                            ? "risk"
                            : row.oldestDays >= s.approvalChaseAfterDays
                              ? "warn"
                              : "good"
                        }`}
                      >
                        {days(row.oldestDays)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <div className="toolbar">
        <select value={show} onChange={(e) => setShow(e.target.value as "open" | "all")}>
          <option value="open">Open only</option>
          <option value="all">Everything</option>
        </select>
        <span className="spacer" />
        <span className="small muted">{list.length} shown</span>
      </div>

      {list.length ? (
        list.map((a) => {
          const c = data.contractors.find((x) => x.id === a.contractorId);
          const waiting = daysWithApprover(a);
          const deadline = approvalDaysToDeadline(a);
          const chased = daysSinceLastChase(a.chases);
          const open = openId === a.id;
          const stalled = approvalIsStalled(a, s);

          return (
            <section className="card" key={a.id}>
              <header>
                <div style={{ minWidth: 0 }}>
                  <h2>
                    {APPROVAL_KIND_LABELS[a.kind]}
                    {c ? ` — ${fullName(c)}` : ""}
                  </h2>
                  <div className="row small muted" style={{ gap: 8, marginTop: 3 }}>
                    <span className="badge">{a.reference || "No reference"}</span>
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
                    {a.value !== null ? <span>{money(a.value)}</span> : null}
                    {c ? (
                      <Link href={`/contractors/${c.id}`}>{c.role}</Link>
                    ) : null}
                  </div>
                </div>
                <div className="row">
                  {isApprovalOpen(a) && waiting !== null ? (
                    <span className={`badge ${stalled ? "warn" : ""}`}>
                      {waiting}d with {a.currentApprover || "nobody"}
                    </span>
                  ) : null}
                  {deadline !== null ? (
                    <span
                      className={`badge ${deadline < 0 ? "risk" : deadline <= 7 ? "warn" : ""}`}
                    >
                      {deadline < 0
                        ? `${Math.abs(deadline)}d late`
                        : `needed in ${deadline}d`}
                    </span>
                  ) : null}
                  <button
                    className="btn small"
                    onClick={() => setOpenId(open ? null : a.id)}
                  >
                    {open ? "Close" : "Open"}
                  </button>
                </div>
              </header>

              <div className="body">
                {!open ? (
                  <div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {a.description || "No description recorded."}
                    </div>
                    <div className="small faint" style={{ marginTop: 6 }}>
                      Raised {formatDate(a.raisedOn)} ({approvalAge(a)} days ago)
                      {chased !== null
                        ? ` · last chased ${days(chased)} ago`
                        : isApprovalOpen(a)
                          ? " · never chased"
                          : ""}
                    </div>
                    {stalled ? (
                      <div className="note warn" style={{ marginTop: 10 }}>
                        Sitting with {a.currentApprover || "no named approver"} for{" "}
                        {days(waiting ?? 0)}.{" "}
                        {chased === null
                          ? "It has never been chased, which makes it hard to escalate."
                          : `Last chased ${days(chased)} ago.`}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="grid cols-3" style={{ gap: 0, columnGap: 14 }}>
                      <Field label="Contractor">
                        <select
                          value={a.contractorId}
                          onChange={(e) =>
                            set(a.id, "contractorId", e.target.value)
                          }
                        >
                          {data.contractors.map((x) => (
                            <option key={x.id} value={x.id}>
                              {fullName(x)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Type">
                        <select
                          value={a.kind}
                          onChange={(e) =>
                            set(a.id, "kind", e.target.value as ApprovalKind)
                          }
                        >
                          {Object.entries(APPROVAL_KIND_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Reference">
                        <input
                          type="text"
                          value={a.reference}
                          onChange={(e) =>
                            set(a.id, "reference", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="State">
                        <select
                          value={a.state}
                          onChange={(e) =>
                            set(a.id, "state", e.target.value as ApprovalState)
                          }
                        >
                          {Object.entries(APPROVAL_STATE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Currently with">
                        <input
                          type="text"
                          value={a.currentApprover}
                          onChange={(e) =>
                            set(a.id, "currentApprover", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Their role">
                        <input
                          type="text"
                          value={a.currentApproverRole}
                          onChange={(e) =>
                            set(a.id, "currentApproverRole", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Raised on">
                        <input
                          type="date"
                          value={a.raisedOn}
                          onChange={(e) => set(a.id, "raisedOn", e.target.value)}
                        />
                      </Field>
                      <Field label="With them since">
                        <input
                          type="date"
                          value={a.withApproverSince}
                          onChange={(e) =>
                            set(a.id, "withApproverSince", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Decision needed by">
                        <input
                          type="date"
                          value={a.requiredBy}
                          onChange={(e) =>
                            set(a.id, "requiredBy", e.target.value)
                          }
                        />
                      </Field>
                      <Field label={`Value (${s.currency})`}>
                        <input
                          type="number"
                          value={a.value ?? ""}
                          onChange={(e) =>
                            set(
                              a.id,
                              "value",
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </Field>
                      <Field label="Decided on">
                        <input
                          type="date"
                          value={a.decidedOn}
                          onChange={(e) =>
                            set(a.id, "decidedOn", e.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <Field label="What is being approved">
                      <textarea
                        value={a.description}
                        onChange={(e) =>
                          set(a.id, "description", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Notes">
                      <textarea
                        value={a.notes}
                        onChange={(e) => set(a.id, "notes", e.target.value)}
                      />
                    </Field>

                    <ChaseLog
                      chases={a.chases}
                      defaultWho={a.currentApprover}
                      onChange={(next) => set(a.id, "chases", next)}
                    />

                    <button
                      className="btn small danger"
                      style={{ marginTop: 14 }}
                      onClick={() => {
                        update((draft) => {
                          draft.approvals = draft.approvals.filter(
                            (x) => x.id !== a.id
                          );
                          return draft;
                        });
                        setOpenId(null);
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </>
                )}
              </div>
            </section>
          );
        })
      ) : (
        <Card>
          <Empty>Nothing outstanding.</Empty>
        </Card>
      )}
    </div>
  );
}
