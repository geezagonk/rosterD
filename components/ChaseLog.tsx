"use client";

import { MessageSquarePlus, Trash2 } from "lucide-react";
import { Chase } from "@/lib/types";
import { days, formatDate, toISO, today } from "@/lib/calc";
import { daysSinceLastChase } from "@/lib/operations";

/**
 * The chase history on an approval or an invoice. In a manual process this is
 * the audit trail: it is what lets you say "this has been with you for eleven
 * days and I have asked twice" rather than "I think I emailed about this".
 */
export default function ChaseLog({
  chases,
  onChange,
  defaultWho,
}: {
  chases: Chase[];
  onChange: (next: Chase[]) => void;
  defaultWho?: string;
}) {
  const since = daysSinceLastChase(chases);

  const add = () =>
    onChange([
      ...chases,
      {
        date: toISO(today()),
        channel: "email",
        chasedWho: defaultWho ?? "",
        note: "",
        outcome: "",
      },
    ]);

  const set = (idx: number, patch: Partial<Chase>) =>
    onChange(chases.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>
          Chase history
          {chases.length ? (
            <span className="faint" style={{ textTransform: "none", letterSpacing: 0 }}>
              {" "}
              — {chases.length} recorded
              {since !== null ? `, last ${since} days ago` : ""}
            </span>
          ) : null}
        </h3>
        <button className="btn small" onClick={add}>
          <MessageSquarePlus size={14} /> Record a chase
        </button>
      </div>

      {chases.length ? (
        <div className="stack" style={{ gap: 8 }}>
          {[...chases]
            .map((c, i) => ({ c, i }))
            .sort((a, b) => b.c.date.localeCompare(a.c.date))
            .map(({ c, i }) => (
              <div key={i} className="chase">
                <div className="repeat-row" style={{ marginBottom: 6 }}>
                  <input
                    type="text"
                    value={c.chasedWho}
                    placeholder="Who did you chase"
                    onChange={(e) => set(i, { chasedWho: e.target.value })}
                  />
                  <input
                    type="date"
                    value={c.date}
                    onChange={(e) => set(i, { date: e.target.value })}
                  />
                  <select
                    value={c.channel}
                    onChange={(e) =>
                      set(i, { channel: e.target.value as Chase["channel"] })
                    }
                  >
                    <option value="email">Email</option>
                    <option value="call">Call</option>
                    <option value="teams">Teams</option>
                    <option value="in-person">In person</option>
                  </select>
                  <button
                    className="btn small danger"
                    onClick={() => onChange(chases.filter((_, x) => x !== i))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <input
                  type="text"
                  value={c.note}
                  placeholder="What you asked for"
                  onChange={(e) => set(i, { note: e.target.value })}
                  style={{ marginBottom: 6 }}
                />
                <input
                  type="text"
                  value={c.outcome}
                  placeholder="What they said"
                  onChange={(e) => set(i, { outcome: e.target.value })}
                />
                <div className="small faint" style={{ marginTop: 4 }}>
                  {formatDate(c.date)}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <p className="small faint" style={{ margin: 0 }}>
          Nothing recorded. If you have chased this and not logged it, you have no
          evidence of where the delay sits.
        </p>
      )}
    </div>
  );
}
