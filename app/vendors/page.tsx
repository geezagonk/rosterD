"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import {
  annualisedCost,
  daysUntil,
  formatDate,
  formatMoney,
  fullName,
  isConsuming,
  vendorConcentration,
} from "@/lib/calc";
import { Vendor, VendorType } from "@/lib/types";
import { Card, Empty, Field } from "@/components/ui";

function blankVendor(): Vendor {
  return {
    id: newId("ven"),
    name: "New vendor",
    type: "agency",
    accountManagerName: "",
    accountManagerEmail: "",
    accountManagerPhone: "",
    msaRef: "",
    msaExpiry: "",
    marginPct: null,
    paymentTermsDays: 30,
    piInsuranceExpiry: "",
    plInsuranceExpiry: "",
    active: true,
    notes: "",
  };
}

export default function VendorsPage() {
  const { data, ready, update } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const s = data.settings;

  if (!ready) return <div className="empty">Loading…</div>;

  const concentration = vendorConcentration(data);
  const shareFor = (id: string) =>
    concentration.find((c) => c.vendor?.id === id)?.share ?? 0;

  const set = <K extends keyof Vendor>(id: string, key: K, value: Vendor[K]) =>
    update((draft) => {
      const v = draft.vendors.find((x) => x.id === id);
      if (v) (v[key] as Vendor[K]) = value;
      return draft;
    });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Vendors</h1>
          <p>
            Agencies, consultancies and managed service providers, with the
            agreement and insurance dates that quietly expire on you.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            const v = blankVendor();
            update((draft) => {
              draft.vendors.push(v);
              return draft;
            });
            setOpenId(v.id);
          }}
        >
          <Plus size={15} /> Add vendor
        </button>
      </div>

      {data.vendors.length ? (
        <div className="stack">
          {data.vendors.map((v) => {
            const engaged = data.contractors.filter(
              (c) => c.vendorId === v.id && isConsuming(c)
            );
            const spend = engaged.reduce(
              (sum, c) => sum + annualisedCost(c, s),
              0
            );
            const msaDays = daysUntil(v.msaExpiry);
            const piDays = daysUntil(v.piInsuranceExpiry);
            const plDays = daysUntil(v.plInsuranceExpiry);
            const share = shareFor(v.id);
            const open = openId === v.id;

            return (
              <section className="card" key={v.id} id={v.id}>
                <header>
                  <div>
                    <h2>{v.name}</h2>
                    <div className="row small muted" style={{ gap: 8, marginTop: 3 }}>
                      <span className="badge">{v.type}</span>
                      <span>{engaged.length} engaged</span>
                      <span>{formatMoney(spend, s.currency)} annualised</span>
                      <span
                        className={`badge ${share > s.vendorConcentrationWarnRatio ? "warn" : ""}`}
                      >
                        {(share * 100).toFixed(0)}% of spend
                      </span>
                      {!v.active ? <span className="badge">Inactive</span> : null}
                    </div>
                  </div>
                  <div className="row">
                    {msaDays !== null && msaDays <= 90 ? (
                      <span className={`badge ${msaDays < 0 ? "risk" : "warn"}`}>
                        MSA {msaDays < 0 ? "expired" : `in ${msaDays}d`}
                      </span>
                    ) : null}
                    {piDays !== null && piDays <= 30 ? (
                      <span className={`badge ${piDays < 0 ? "risk" : "warn"}`}>
                        PI {piDays < 0 ? "expired" : `in ${piDays}d`}
                      </span>
                    ) : null}
                    {plDays !== null && plDays <= 30 ? (
                      <span className={`badge ${plDays < 0 ? "risk" : "warn"}`}>
                        PL {plDays < 0 ? "expired" : `in ${plDays}d`}
                      </span>
                    ) : null}
                    <button
                      className="btn small"
                      onClick={() => setOpenId(open ? null : v.id)}
                    >
                      {open ? "Close" : "Edit"}
                    </button>
                  </div>
                </header>

                <div className="body">
                  {open ? (
                    <>
                      <div className="grid cols-3" style={{ gap: 0, columnGap: 14 }}>
                        <Field label="Vendor name">
                          <input
                            type="text"
                            value={v.name}
                            onChange={(e) => set(v.id, "name", e.target.value)}
                          />
                        </Field>
                        <Field label="Type">
                          <select
                            value={v.type}
                            onChange={(e) =>
                              set(v.id, "type", e.target.value as VendorType)
                            }
                          >
                            <option value="agency">Agency</option>
                            <option value="consultancy">Consultancy</option>
                            <option value="msp">Managed service provider</option>
                            <option value="direct">Direct</option>
                            <option value="other">Other</option>
                          </select>
                        </Field>
                        <Field label="Active">
                          <select
                            value={v.active ? "yes" : "no"}
                            onChange={(e) =>
                              set(v.id, "active", e.target.value === "yes")
                            }
                          >
                            <option value="yes">Active</option>
                            <option value="no">Inactive</option>
                          </select>
                        </Field>
                        <Field label="Account manager">
                          <input
                            type="text"
                            value={v.accountManagerName}
                            onChange={(e) =>
                              set(v.id, "accountManagerName", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Email">
                          <input
                            type="email"
                            value={v.accountManagerEmail}
                            onChange={(e) =>
                              set(v.id, "accountManagerEmail", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Phone">
                          <input
                            type="tel"
                            value={v.accountManagerPhone}
                            onChange={(e) =>
                              set(v.id, "accountManagerPhone", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="MSA reference">
                          <input
                            type="text"
                            value={v.msaRef}
                            onChange={(e) => set(v.id, "msaRef", e.target.value)}
                          />
                        </Field>
                        <Field label="MSA expiry">
                          <input
                            type="date"
                            value={v.msaExpiry}
                            onChange={(e) =>
                              set(v.id, "msaExpiry", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="Margin %">
                          <input
                            type="number"
                            value={v.marginPct ?? ""}
                            onChange={(e) =>
                              set(
                                v.id,
                                "marginPct",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value)
                              )
                            }
                          />
                        </Field>
                        <Field label="Payment terms (days)">
                          <input
                            type="number"
                            value={v.paymentTermsDays ?? ""}
                            onChange={(e) =>
                              set(
                                v.id,
                                "paymentTermsDays",
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value)
                              )
                            }
                          />
                        </Field>
                        <Field label="PI cover expiry">
                          <input
                            type="date"
                            value={v.piInsuranceExpiry}
                            onChange={(e) =>
                              set(v.id, "piInsuranceExpiry", e.target.value)
                            }
                          />
                        </Field>
                        <Field label="PL cover expiry">
                          <input
                            type="date"
                            value={v.plInsuranceExpiry}
                            onChange={(e) =>
                              set(v.id, "plInsuranceExpiry", e.target.value)
                            }
                          />
                        </Field>
                      </div>
                      <Field label="Notes">
                        <textarea
                          value={v.notes}
                          onChange={(e) => set(v.id, "notes", e.target.value)}
                        />
                      </Field>
                      <button
                        className="btn danger"
                        onClick={() => {
                          update((draft) => {
                            draft.vendors = draft.vendors.filter(
                              (x) => x.id !== v.id
                            );
                            draft.contractors.forEach((c) => {
                              if (c.vendorId === v.id) c.vendorId = null;
                            });
                            return draft;
                          });
                          setOpenId(null);
                        }}
                      >
                        <Trash2 size={15} /> Delete vendor
                      </button>
                    </>
                  ) : (
                    <div className="grid cols-2">
                      <dl className="kv">
                        <dt>Account manager</dt>
                        <dd>
                          {v.accountManagerName || "—"}
                          {v.accountManagerEmail ? (
                            <>
                              {" · "}
                              <a href={`mailto:${v.accountManagerEmail}`}>
                                {v.accountManagerEmail}
                              </a>
                            </>
                          ) : null}
                        </dd>
                        <dt>Agreement</dt>
                        <dd>
                          {v.msaRef || "—"} expiring {formatDate(v.msaExpiry)}
                        </dd>
                        <dt>Insurance</dt>
                        <dd>
                          PI {formatDate(v.piInsuranceExpiry)} · PL{" "}
                          {formatDate(v.plInsuranceExpiry)}
                        </dd>
                        <dt>Commercials</dt>
                        <dd>
                          {v.marginPct === null
                            ? "Margin not recorded"
                            : `${v.marginPct}% margin`}
                          {v.paymentTermsDays
                            ? ` · ${v.paymentTermsDays} day terms`
                            : ""}
                        </dd>
                      </dl>
                      <div>
                        <h3 style={{ marginBottom: 6 }}>Engaged workers</h3>
                        {engaged.length ? (
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {engaged.map((c) => (
                              <li key={c.id}>
                                <Link href={`/contractors/${c.id}`}>
                                  {fullName(c)}
                                </Link>{" "}
                                <span className="faint small">
                                  {c.role} · ends {formatDate(c.endDate)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="faint small">None currently engaged.</p>
                        )}
                        {v.notes ? (
                          <div className="note" style={{ marginTop: 10 }}>
                            {v.notes}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty>No vendors yet. Add one to start tracking agreements.</Empty>
        </Card>
      )}
    </div>
  );
}
