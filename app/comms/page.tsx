"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Copy, Download, ExternalLink, Plus, Trash2 } from "lucide-react";
import { newId, useStore } from "@/lib/store";
import { formatDate, fullName, toISO, today } from "@/lib/calc";
import { CommsChannel, CommsDirection, CommsEntry } from "@/lib/types";
import { Card, Empty, Field } from "@/components/ui";
import {
  TEMPLATES,
  renderEmailHtml,
  renderPlainText,
} from "@/lib/templates";
import { download } from "@/lib/exporters";

function blankEntry(contractorId: string | null): CommsEntry {
  return {
    id: newId("com"),
    date: toISO(today()),
    channel: "email",
    direction: "outbound",
    contractorId,
    vendorId: null,
    subject: "",
    summary: "",
    participants: "",
    followUpDate: "",
    topic: "",
  };
}

export default function CommsPage() {
  return (
    <Suspense fallback={<div className="empty">Loading…</div>}>
      <CommsInner />
    </Suspense>
  );
}

function CommsInner() {
  const search = useSearchParams();
  const { data, ready, update } = useStore();
  const [tab, setTab] = useState<"log" | "templates">("log");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterId, setFilterId] = useState<string>(
    search.get("contractor") ?? "all"
  );

  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [contractorId, setContractorId] = useState<string>(
    search.get("contractor") ?? ""
  );
  const [vendorId, setVendorId] = useState<string>("");
  const [senderName, setSenderName] = useState("Gavin Buchanan");
  const [senderRole, setSenderRole] = useState("Resource Manager");
  const [senderOrg, setSenderOrg] = useState(data.settings.organisationName);

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];

  const contractor =
    data.contractors.find((c) => c.id === contractorId) ??
    data.contractors[0] ??
    null;
  const vendor =
    data.vendors.find((v) => v.id === vendorId) ??
    data.vendors.find((v) => v.id === contractor?.vendorId) ??
    null;

  const ctx = useMemo(
    () => ({
      data,
      contractor,
      vendor,
      senderName,
      senderRole,
      senderOrg,
    }),
    [data, contractor, vendor, senderName, senderRole, senderOrg]
  );

  const canRender =
    (!template.needsContractor || !!contractor) &&
    (!template.needsVendor || !!vendor);

  const html = canRender ? renderEmailHtml(template, ctx) : "";
  const text = canRender ? renderPlainText(template, ctx) : "";
  const subject = canRender ? template.subject(ctx) : "";

  const recipientEmail =
    template.audience === "vendor"
      ? vendor?.accountManagerEmail ?? ""
      : template.audience === "contractor"
        ? contractor?.email ?? ""
        : "";

  if (!ready) return <div className="empty">Loading…</div>;

  const entries = data.comms
    .filter((e) =>
      filterId === "all"
        ? true
        : e.contractorId === filterId || e.vendorId === filterId
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  const setEntry = <K extends keyof CommsEntry>(
    id: string,
    key: K,
    value: CommsEntry[K]
  ) =>
    update((draft) => {
      const e = draft.comms.find((x) => x.id === id);
      if (e) (e[key] as CommsEntry[K]) = value;
      return draft;
    });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Comms</h1>
          <p>
            A record of who said what to which agency, and a set of email
            templates that pull the real numbers out of the register so you are
            not retyping rates into Outlook.
          </p>
        </div>
        {tab === "log" ? (
          <button
            className="btn primary"
            onClick={() => {
              const entry = blankEntry(filterId === "all" ? null : filterId);
              update((draft) => {
                draft.comms.unshift(entry);
                return draft;
              });
              setEditingId(entry.id);
            }}
          >
            <Plus size={15} /> Log an interaction
          </button>
        ) : null}
      </div>

      <div className="tabs">
        <button
          className={tab === "log" ? "active" : ""}
          onClick={() => setTab("log")}
        >
          Interaction log
        </button>
        <button
          className={tab === "templates" ? "active" : ""}
          onClick={() => setTab("templates")}
        >
          Email templates
        </button>
      </div>

      {tab === "log" ? (
        <div className="stack">
          <div className="toolbar">
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
            >
              <option value="all">Everything</option>
              <optgroup label="Contractors">
                {data.contractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {fullName(c)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Vendors">
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="spacer" />
            <span className="small muted">{entries.length} entries</span>
          </div>

          {entries.length ? (
            entries.map((e) => {
              const c = data.contractors.find((x) => x.id === e.contractorId);
              const v = data.vendors.find((x) => x.id === e.vendorId);
              return (
                <section className="card" key={e.id}>
                  <header>
                    <div>
                      <h2>{e.subject || "Untitled entry"}</h2>
                      <div className="row small muted" style={{ gap: 8, marginTop: 3 }}>
                        <span className="badge">{e.channel}</span>
                        <span className="badge accent">{e.direction}</span>
                        <span>{formatDate(e.date)}</span>
                        {c ? (
                          <Link href={`/contractors/${c.id}`}>{fullName(c)}</Link>
                        ) : null}
                        {v ? <span>{v.name}</span> : null}
                        {e.followUpDate ? (
                          <span className="badge warn">
                            Follow up {formatDate(e.followUpDate)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="row">
                      <button
                        className="btn small"
                        onClick={() =>
                          setEditingId(editingId === e.id ? null : e.id)
                        }
                      >
                        {editingId === e.id ? "Close" : "Edit"}
                      </button>
                      <button
                        className="btn small danger"
                        onClick={() =>
                          update((draft) => {
                            draft.comms = draft.comms.filter(
                              (x) => x.id !== e.id
                            );
                            return draft;
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </header>
                  <div className="body">
                    {editingId !== e.id ? (
                      <div className="muted" style={{ fontSize: 13 }}>
                        {e.summary || "No summary recorded."}
                        {e.participants ? (
                          <div className="small faint" style={{ marginTop: 6 }}>
                            With {e.participants}
                            {e.topic ? ` · ${e.topic}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                    <>
                    <div className="grid cols-4" style={{ gap: 0, columnGap: 14 }}>
                      <Field label="Date">
                        <input
                          type="date"
                          value={e.date}
                          onChange={(ev) =>
                            setEntry(e.id, "date", ev.target.value)
                          }
                        />
                      </Field>
                      <Field label="Channel">
                        <select
                          value={e.channel}
                          onChange={(ev) =>
                            setEntry(
                              e.id,
                              "channel",
                              ev.target.value as CommsChannel
                            )
                          }
                        >
                          <option value="email">Email</option>
                          <option value="call">Call</option>
                          <option value="meeting">Meeting</option>
                          <option value="teams">Teams</option>
                          <option value="note">Note</option>
                        </select>
                      </Field>
                      <Field label="Direction">
                        <select
                          value={e.direction}
                          onChange={(ev) =>
                            setEntry(
                              e.id,
                              "direction",
                              ev.target.value as CommsDirection
                            )
                          }
                        >
                          <option value="outbound">Outbound</option>
                          <option value="inbound">Inbound</option>
                          <option value="internal">Internal</option>
                        </select>
                      </Field>
                      <Field label="Follow up on">
                        <input
                          type="date"
                          value={e.followUpDate}
                          onChange={(ev) =>
                            setEntry(e.id, "followUpDate", ev.target.value)
                          }
                        />
                      </Field>
                      <Field label="Contractor">
                        <select
                          value={e.contractorId ?? ""}
                          onChange={(ev) =>
                            setEntry(
                              e.id,
                              "contractorId",
                              ev.target.value || null
                            )
                          }
                        >
                          <option value="">None</option>
                          {data.contractors.map((x) => (
                            <option key={x.id} value={x.id}>
                              {fullName(x)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Vendor">
                        <select
                          value={e.vendorId ?? ""}
                          onChange={(ev) =>
                            setEntry(e.id, "vendorId", ev.target.value || null)
                          }
                        >
                          <option value="">None</option>
                          {data.vendors.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Topic">
                        <input
                          type="text"
                          value={e.topic}
                          onChange={(ev) =>
                            setEntry(e.id, "topic", ev.target.value)
                          }
                        />
                      </Field>
                      <Field label="Participants">
                        <input
                          type="text"
                          value={e.participants}
                          onChange={(ev) =>
                            setEntry(e.id, "participants", ev.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Subject">
                      <input
                        type="text"
                        value={e.subject}
                        onChange={(ev) =>
                          setEntry(e.id, "subject", ev.target.value)
                        }
                      />
                    </Field>
                    <Field label="What was said">
                      <textarea
                        value={e.summary}
                        onChange={(ev) =>
                          setEntry(e.id, "summary", ev.target.value)
                        }
                      />
                    </Field>
                    </>
                    )}
                  </div>
                </section>
              );
            })
          ) : (
            <Card>
              <Empty>Nothing logged against that filter.</Empty>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid cols-2">
          <Card title="Build the email">
            <Field label="Template">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="note" style={{ marginBottom: 14 }}>
              {template.blurb}
            </div>

            <div className="grid cols-2" style={{ gap: 0, columnGap: 14 }}>
              <Field label="Contractor">
                <select
                  value={contractor?.id ?? ""}
                  onChange={(e) => setContractorId(e.target.value)}
                  disabled={!template.needsContractor}
                >
                  <option value="">None</option>
                  {data.contractors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {fullName(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Vendor">
                <select
                  value={vendor?.id ?? ""}
                  onChange={(e) => setVendorId(e.target.value)}
                >
                  <option value="">None</option>
                  {data.vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Your name">
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
              </Field>
              <Field label="Your role">
                <input
                  type="text"
                  value={senderRole}
                  onChange={(e) => setSenderRole(e.target.value)}
                />
              </Field>
              <Field label="Organisation">
                <input
                  type="text"
                  value={senderOrg}
                  onChange={(e) => setSenderOrg(e.target.value)}
                />
              </Field>
            </div>

            {!canRender ? (
              <div className="note warn">
                This template needs
                {template.needsContractor ? " a contractor" : ""}
                {template.needsContractor && template.needsVendor ? " and" : ""}
                {template.needsVendor ? " a vendor" : ""} selected before it can
                be built.
              </div>
            ) : (
              <>
                <Field label="Subject line">
                  <input type="text" value={subject} readOnly />
                </Field>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={() =>
                      navigator.clipboard?.writeText(html).catch(() => {})
                    }
                  >
                    <Copy size={15} /> Copy HTML
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      navigator.clipboard?.writeText(text).catch(() => {})
                    }
                  >
                    <Copy size={15} /> Copy plain text
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      download(
                        `${template.id}-${contractor ? contractor.lastName.toLowerCase() : "vendor"}.html`,
                        html,
                        "text/html;charset=utf-8"
                      )
                    }
                  >
                    <Download size={15} /> Download .html
                  </button>
                  <a
                    className="btn"
                    href={`mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}
                  >
                    <ExternalLink size={15} /> Open in mail
                  </a>
                </div>
                <div className="note" style={{ marginTop: 12 }}>
                  Copy HTML pastes as formatted mail into Outlook on the web.
                  The mailto link uses the plain text version, because most
                  clients strip markup from a mailto body.
                </div>
                <button
                  className="btn small"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    update((draft) => {
                      draft.comms.unshift({
                        ...blankEntry(contractor?.id ?? null),
                        vendorId: vendor?.id ?? null,
                        subject,
                        summary: `Sent the "${template.name}" template.`,
                        topic: template.name,
                        participants:
                          template.audience === "vendor"
                            ? vendor?.accountManagerName ?? ""
                            : template.audience === "contractor"
                              ? contractor
                                ? fullName(contractor)
                                : ""
                              : "Internal",
                      });
                      return draft;
                    })
                  }
                >
                  <Plus size={14} /> Log this as sent
                </button>
              </>
            )}
          </Card>

          <Card title="Preview" padded={false}>
            {canRender ? (
              <iframe
                title="Email preview"
                srcDoc={html}
                style={{
                  width: "100%",
                  height: 720,
                  border: 0,
                  borderRadius: "0 0 var(--radius) var(--radius)",
                }}
              />
            ) : (
              <Empty>Select the records this template needs.</Empty>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
