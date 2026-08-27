"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, Plus, Undo2, X } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { formatDate, toISO, today } from "@/lib/calc";
import { REMINDER_LABELS, allReminders } from "@/lib/reminders";
import { Card, Empty, Field } from "@/components/ui";
import { download, remindersToIcs } from "@/lib/exporters";

export default function RemindersPage() {
  const { data, ready, update, setDerivedState } = useStore();
  const [show, setShow] = useState<"open" | "all">("open");
  const [type, setType] = useState<string>("all");

  if (!ready) return <div className="empty">Loading…</div>;

  const all = allReminders(data);
  const list = all.filter((r) => {
    if (show === "open" && r.status !== "open") return false;
    if (type !== "all" && r.type !== type) return false;
    return true;
  });

  const counts = {
    overdue: all.filter((r) => r.status === "open" && r.severity === "overdue")
      .length,
    due: all.filter((r) => r.status === "open" && r.severity === "due").length,
    soon: all.filter((r) => r.status === "open" && r.severity === "soon").length,
  };

  const resolve = (key: string, derived: boolean, status: "done" | "dismissed" | "open") => {
    if (derived) setDerivedState(key, status);
    else
      update((draft) => {
        const r = draft.reminders.find((x) => x.id === key);
        if (r) r.status = status;
        return draft;
      });
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Reminders</h1>
          <p>
            Most of these are derived from the register itself, so they cannot
            drift out of step with the data. Notice dates, PO burn, work rights,
            tenure, insurance and agreement expiry are all computed, not typed.
          </p>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              download(
                "rostered-reminders.ics",
                remindersToIcs(data),
                "text/calendar;charset=utf-8"
              )
            }
          >
            <CalendarPlus size={15} /> Export to calendar
          </button>
          <button
            className="btn primary"
            onClick={() =>
              update((draft) => {
                draft.reminders.unshift({
                  id: newId("rem"),
                  type: "custom",
                  title: "New reminder",
                  detail: "",
                  dueDate: toISO(today()),
                  contractorId: null,
                  vendorId: null,
                  status: "open",
                  derived: false,
                  owner: "",
                });
                return draft;
              })
            }
          >
            <Plus size={15} /> Add reminder
          </button>
        </div>
      </div>

      <div className="grid cols-3">
        <div className="stat">
          <span className="icon red">{counts.overdue}</span>
          <div className="stat-body">
            <div className="label">Overdue</div>
            <div className="sub">Past their date and still open</div>
          </div>
        </div>
        <div className="stat">
          <span className="icon peach">{counts.due}</span>
          <div className="stat-body">
            <div className="label">Due this week</div>
            <div className="sub">Inside seven days</div>
          </div>
        </div>
        <div className="stat">
          <span className="icon accent">{counts.soon}</span>
          <div className="stat-body">
            <div className="label">Coming up</div>
            <div className="sub">Inside thirty days</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <select value={show} onChange={(e) => setShow(e.target.value as "open" | "all")}>
          <option value="open">Open only</option>
          <option value="all">Everything</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(REMINDER_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="small muted">{list.length} shown</span>
      </div>

      <Card padded={false}>
        {list.length ? (
          list.map((r) => (
            <div
              key={r.key}
              className={`reminder ${r.severity} ${r.status !== "open" ? "done" : ""}`}
            >
              <span className="flag" />
              <span className="when muted">
                <div>{formatDate(r.dueDate)}</div>
                <div className="faint">
                  {r.daysOut === null
                    ? ""
                    : r.daysOut < 0
                      ? `${Math.abs(r.daysOut)}d overdue`
                      : r.daysOut === 0
                        ? "today"
                        : `in ${r.daysOut}d`}
                </div>
              </span>
              <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                <span className="title">{r.title}</span>
                <span className="detail">{r.detail}</span>
                <span className="row small" style={{ gap: 6, marginTop: 6 }}>
                  <span className="badge">{REMINDER_LABELS[r.type]}</span>
                  {r.derived ? (
                    <span className="badge accent">Derived</span>
                  ) : (
                    <span className="badge pink">Manual</span>
                  )}
                  {r.contractorId ? (
                    <Link
                      href={`/contractors/${r.contractorId}`}
                      className="badge blue"
                    >
                      {r.subjectLabel}
                    </Link>
                  ) : r.vendorId ? (
                    <Link href={`/vendors#${r.vendorId}`} className="badge blue">
                      {r.subjectLabel}
                    </Link>
                  ) : null}
                  {r.owner ? <span className="badge">{r.owner}</span> : null}
                </span>
              </span>
              <span className="actions">
                {r.status === "open" ? (
                  <>
                    <button
                      className="btn small"
                      title="Mark done"
                      onClick={() => resolve(r.key, r.derived, "done")}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="btn small"
                      title="Dismiss"
                      onClick={() => resolve(r.key, r.derived, "dismissed")}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    className="btn small"
                    title="Reopen"
                    onClick={() => resolve(r.key, r.derived, "open")}
                  >
                    <Undo2 size={14} />
                  </button>
                )}
              </span>
            </div>
          ))
        ) : (
          <Empty>Nothing to action. Enjoy it while it lasts.</Empty>
        )}
      </Card>

      {data.reminders.length ? (
        <Card title="Edit manual reminders">
          {data.reminders.map((r) => (
            <div key={r.id} className="grid cols-4" style={{ gap: 0, columnGap: 14 }}>
              <Field label="Title">
                <input
                  type="text"
                  value={r.title}
                  onChange={(e) =>
                    update((draft) => {
                      const t = draft.reminders.find((x) => x.id === r.id);
                      if (t) t.title = e.target.value;
                      return draft;
                    })
                  }
                />
              </Field>
              <Field label="Due">
                <input
                  type="date"
                  value={r.dueDate}
                  onChange={(e) =>
                    update((draft) => {
                      const t = draft.reminders.find((x) => x.id === r.id);
                      if (t) t.dueDate = e.target.value;
                      return draft;
                    })
                  }
                />
              </Field>
              <Field label="Owner">
                <input
                  type="text"
                  value={r.owner}
                  onChange={(e) =>
                    update((draft) => {
                      const t = draft.reminders.find((x) => x.id === r.id);
                      if (t) t.owner = e.target.value;
                      return draft;
                    })
                  }
                />
              </Field>
              <Field label="Linked contractor">
                <select
                  value={r.contractorId ?? ""}
                  onChange={(e) =>
                    update((draft) => {
                      const t = draft.reminders.find((x) => x.id === r.id);
                      if (t) t.contractorId = e.target.value || null;
                      return draft;
                    })
                  }
                >
                  <option value="">None</option>
                  {data.contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label="Detail">
                  <textarea
                    value={r.detail}
                    onChange={(e) =>
                      update((draft) => {
                        const t = draft.reminders.find((x) => x.id === r.id);
                        if (t) t.detail = e.target.value;
                        return draft;
                      })
                    }
                  />
                </Field>
                <button
                  className="btn small danger"
                  onClick={() =>
                    update((draft) => {
                      draft.reminders = draft.reminders.filter(
                        (x) => x.id !== r.id
                      );
                      return draft;
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
