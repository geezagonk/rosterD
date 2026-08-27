"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import {
  formatMoney,
  fteUnits,
  fullName,
  isConsuming,
  projectRollup,
  weeklyCost,
} from "@/lib/calc";
import { Project } from "@/lib/types";
import { Bar, Card, Empty, Field } from "@/components/ui";

function blankProject(): Project {
  return {
    id: newId("prj"),
    name: "New project",
    code: "",
    costCentre: "",
    sponsor: "",
    budget: null,
    active: true,
  };
}

export default function ProjectsPage() {
  const { data, ready, update } = useStore();
  const s = data.settings;

  if (!ready) return <div className="empty">Loading…</div>;

  const rollups = projectRollup(data);
  const maxCost = Math.max(...rollups.map((r) => r.weeklyCost), 1);

  const set = <K extends keyof Project>(
    id: string,
    key: K,
    value: Project[K]
  ) =>
    update((draft) => {
      const p = draft.projects.find((x) => x.id === id);
      if (p) (p[key] as Project[K]) = value;
      return draft;
    });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Projects and cost centres</h1>
          <p>
            Where contractor FTE and spend actually lands once allocations are
            applied. Anything unallocated is shown separately rather than being
            quietly absorbed.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            update((draft) => {
              draft.projects.push(blankProject());
              return draft;
            })
          }
        >
          <Plus size={15} /> Add project
        </button>
      </div>

      <Card title="Allocated cost by project">
        {rollups.length ? (
          rollups.map((r) => (
            <Bar
              key={r.project?.id ?? "unallocated"}
              label={
                <span>
                  {r.project?.name ?? "Unallocated"}
                  <span className="faint small">
                    {" "}
                    · {(r.fteUnits / s.fteScale).toFixed(2)} FTE
                  </span>
                </span>
              }
              value={r.weeklyCost}
              max={maxCost}
              display={formatMoney(r.weeklyCost * s.weeksPerYear, s.currency)}
              tone={r.project ? undefined : "warn"}
            />
          ))
        ) : (
          <Empty>Nothing allocated yet.</Empty>
        )}
      </Card>

      <div className="grid cols-2">
        {data.projects.map((p) => {
          const members = data.contractors.filter(
            (c) => isConsuming(c) && c.allocations.some((a) => a.projectId === p.id)
          );
          const annual = members.reduce((sum, c) => {
            const share =
              (c.allocations.find((a) => a.projectId === p.id)?.sharePct ?? 0) /
              100;
            return sum + weeklyCost(c, s) * share * s.weeksPerYear;
          }, 0);
          const fte = members.reduce((sum, c) => {
            const share =
              (c.allocations.find((a) => a.projectId === p.id)?.sharePct ?? 0) /
              100;
            return sum + fteUnits(c, s) * share;
          }, 0);
          const budgetPct = p.budget ? (annual / p.budget) * 100 : null;

          return (
            <section className="card" key={p.id}>
              <header>
                <div>
                  <h2>{p.name}</h2>
                  <div className="small muted">
                    {p.code || "no code"} · {p.costCentre || "no cost centre"}
                  </div>
                </div>
                <span className="badge accent">
                  {(fte / s.fteScale).toFixed(2)} FTE
                </span>
              </header>
              <div className="body">
                <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
                  <Field label="Name">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => set(p.id, "name", e.target.value)}
                    />
                  </Field>
                  <Field label="Code">
                    <input
                      type="text"
                      value={p.code}
                      onChange={(e) => set(p.id, "code", e.target.value)}
                    />
                  </Field>
                  <Field label="Cost centre">
                    <input
                      type="text"
                      value={p.costCentre}
                      onChange={(e) => set(p.id, "costCentre", e.target.value)}
                    />
                  </Field>
                  <Field label="Sponsor">
                    <input
                      type="text"
                      value={p.sponsor}
                      onChange={(e) => set(p.id, "sponsor", e.target.value)}
                    />
                  </Field>
                  <Field label={`Contractor budget (${s.currency})`}>
                    <input
                      type="number"
                      value={p.budget ?? ""}
                      onChange={(e) =>
                        set(
                          p.id,
                          "budget",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                  </Field>
                  <Field label="Active">
                    <select
                      value={p.active ? "yes" : "no"}
                      onChange={(e) =>
                        set(p.id, "active", e.target.value === "yes")
                      }
                    >
                      <option value="yes">Active</option>
                      <option value="no">Closed</option>
                    </select>
                  </Field>
                </div>

                <div
                  className={`note ${budgetPct !== null && budgetPct > 100 ? "warn" : ""}`}
                >
                  {formatMoney(annual, s.currency)} annualised contractor cost
                  {budgetPct !== null
                    ? ` against a budget of ${formatMoney(p.budget ?? 0, s.currency)} (${budgetPct.toFixed(0)}%)`
                    : ", no budget recorded"}
                  .
                </div>

                {members.length ? (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
                    {members.map((c) => (
                      <li key={c.id}>
                        <Link href={`/contractors/${c.id}`}>{fullName(c)}</Link>{" "}
                        <span className="faint small">
                          {c.allocations.find((a) => a.projectId === p.id)
                            ?.sharePct ?? 0}
                          % · {c.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="faint small" style={{ marginBottom: 0 }}>
                    Nobody allocated.
                  </p>
                )}

                <button
                  className="btn small danger"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    update((draft) => {
                      draft.projects = draft.projects.filter(
                        (x) => x.id !== p.id
                      );
                      draft.contractors.forEach((c) => {
                        c.allocations = c.allocations.filter(
                          (a) => a.projectId !== p.id
                        );
                      });
                      return draft;
                    })
                  }
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
