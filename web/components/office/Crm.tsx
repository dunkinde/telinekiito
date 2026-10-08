"use client";
// CRM (owner and sales): corporate clients and partners – property managers, housing companies, contractors,
// developers, public owners. The lead sources add housing companies and their managers from PRH; people, emails,
// phones and notes are added here by hand and are never overwritten by a scan.
import { useMemo, useState } from "react";
import { addOrgActivity, getOrg, getOrgs, removeOrg, removeOrgContact, saveOrg, saveOrgContact, type Org, type OrgContact, type OrgStage, type OrgType } from "@/lib/sales";
import { IconPlus } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, telHref } from "./format";
import { useST } from "./salesText";
import { ICustomers } from "./icons";
import { Async, Badge, Btn, Card, Check, Chips, Confirm, Dialog, Drawer, Empty, Field, Input, Select, TextArea, Toolbar, cx, type Tone } from "./ui";

const TYPES: OrgType[] = ["property_manager", "housing_company", "contractor", "developer", "public_owner", "client", "partner", "other"];
const STAGES: OrgStage[] = ["none", "prospect", "contacted", "active", "partner", "inactive"];
const STAGE_TONE: Record<OrgStage, Tone> = { none: "neutral", prospect: "blue", contacted: "sun", active: "green", partner: "violet", inactive: "gray" };

type Draft = { name: string; type: OrgType; stage: OrgStage; businessId: string; website: string; email: string; phone: string; address: string; notes: string; tags: string; accountId: string };
const blank: Draft = { name: "", type: "property_manager", stage: "none", businessId: "", website: "", email: "", phone: "", address: "", notes: "", tags: "", accountId: "" };

function OrgDialog({ open, org, onClose, onSaved, accounts }: { open: boolean; org: Org | null; onClose: () => void; onSaved: (o: Org) => void; accounts: { id: string; name: string }[] }) {
  const st = useST();
  const { owner } = useOffice();
  const { run, busy } = useAct();
  const [d, setD] = useState<Draft>(blank);
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? org?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open) setD(org ? { name: org.name, type: org.type, stage: org.stage || "none", businessId: org.businessId, website: org.website, email: org.email, phone: org.phone, address: org.address, notes: org.notes, tags: (org.tags || []).join(", "), accountId: org.accountId || "" } : blank);
  }
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  async function save() {
    if (!d.name.trim()) return;
    const body: Partial<Org> = { name: d.name.trim(), type: d.type, stage: d.stage, businessId: d.businessId, website: d.website, email: d.email, phone: d.phone, address: d.address, notes: d.notes, tags: d.tags.split(",").map((x) => x.trim()).filter(Boolean), ...(owner ? { accountId: d.accountId || null } : {}) };
    const r = await run("org", () => saveOrg(body, org?.id), org ? st("c.saved") : st("c.created"), { refresh: false });
    if (r) { onSaved(r.org); onClose(); }
  }
  return (
    <Dialog open={open} onClose={onClose} title={org ? st("c.edit") : st("c.new")} footer={<><Btn variant="quiet" onClick={onClose}>{st("c.cancel")}</Btn><Btn variant="primary" busy={busy === "org"} disabled={!d.name.trim()} onClick={save}>{st("c.save")}</Btn></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={st("c.name")} className="sm:col-span-2">{(id) => <Input id={id} value={d.name} onChange={(v) => up({ name: v })} maxLength={160} />}</Field>
        <Field label={st("c.type")}>{(id) => <Select id={id} value={d.type} onChange={(v) => up({ type: v as OrgType })} options={TYPES.map((t) => ({ value: t, label: st(`c.type.${t}`) }))} />}</Field>
        <Field label={st("c.stage")}>{(id) => <Select id={id} value={d.stage} onChange={(v) => up({ stage: v as OrgStage })} options={STAGES.map((t) => ({ value: t, label: st(`c.stage.${t}`) }))} />}</Field>
        <Field label={st("c.businessId")} optional>{(id) => <Input id={id} value={d.businessId} onChange={(v) => up({ businessId: v })} maxLength={20} />}</Field>
        <Field label={st("c.website")} optional>{(id) => <Input id={id} value={d.website} onChange={(v) => up({ website: v })} inputMode="url" />}</Field>
        <Field label={st("c.email")} optional>{(id) => <Input id={id} type="email" value={d.email} onChange={(v) => up({ email: v })} inputMode="email" />}</Field>
        <Field label={st("c.phone")} optional>{(id) => <Input id={id} value={d.phone} onChange={(v) => up({ phone: v })} inputMode="tel" />}</Field>
        <Field label={st("c.address")} optional className="sm:col-span-2">{(id) => <Input id={id} value={d.address} onChange={(v) => up({ address: v })} />}</Field>
        <Field label={st("c.tags")} optional className="sm:col-span-2">{(id) => <Input id={id} value={d.tags} onChange={(v) => up({ tags: v })} />}</Field>
        {owner && accounts.length ? (
          <Field label={st("c.account")} optional className="sm:col-span-2">{(id) => <Select id={id} value={d.accountId} onChange={(v) => up({ accountId: v })} options={[{ value: "", label: st("c.accountNone") }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />}</Field>
        ) : null}
        <Field label={st("c.notes")} optional className="sm:col-span-2">{(id) => <TextArea id={id} value={d.notes} onChange={(v) => up({ notes: v })} rows={3} />}</Field>
      </div>
    </Dialog>
  );
}

function PersonDialog({ org, person, open, onClose, onSaved }: { org: Org; person: OrgContact | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const st = useST();
  const { run, busy } = useAct();
  const [d, setD] = useState({ name: "", role: "", email: "", phone: "", note: "", primary: false });
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? person?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open) setD(person ? { name: person.name, role: person.role, email: person.email, phone: person.phone, note: person.note, primary: person.primary } : { name: "", role: "", email: "", phone: "", note: "", primary: !(org.contacts || []).length });
  }
  async function save() {
    const r = await run("person", () => saveOrgContact(org.id, d, person?.id), st("c.saved"), { refresh: false });
    if (r) { onSaved(); onClose(); }
  }
  return (
    <Dialog open={open} onClose={onClose} title={person ? st("c.editPerson") : st("c.addPerson")} footer={<><Btn variant="quiet" onClick={onClose}>{st("c.cancel")}</Btn><Btn variant="primary" busy={busy === "person"} onClick={save}>{st("c.save")}</Btn></>}>
      <p className="mb-3 text-[12.5px] text-muted">{st("c.privacy")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={st("c.p.name")}>{(id) => <Input id={id} value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={120} />}</Field>
        <Field label={st("c.p.role")} optional>{(id) => <Input id={id} value={d.role} onChange={(v) => setD({ ...d, role: v })} maxLength={120} />}</Field>
        <Field label={st("c.p.email")} optional>{(id) => <Input id={id} type="email" value={d.email} onChange={(v) => setD({ ...d, email: v })} inputMode="email" />}</Field>
        <Field label={st("c.p.phone")} optional>{(id) => <Input id={id} value={d.phone} onChange={(v) => setD({ ...d, phone: v })} inputMode="tel" />}</Field>
        <Field label={st("c.p.note")} optional className="sm:col-span-2">{(id) => <TextArea id={id} value={d.note} onChange={(v) => setD({ ...d, note: v })} rows={2} />}</Field>
        <div className="sm:col-span-2"><Check checked={d.primary} onChange={(v) => setD({ ...d, primary: v })} label={st("c.p.primary")} /></div>
      </div>
    </Dialog>
  );
}

function OrgDetail({ id, onClose, onChanged, accounts }: { id: string; onClose: () => void; onChanged: () => void; accounts: { id: string; name: string }[] }) {
  const st = useST();
  const { lang } = useT();
  const { owner, nav, setParams } = useOffice();
  const { run, busy } = useAct();
  const d = useLoad(() => getOrg(id), [id]);
  const [edit, setEdit] = useState(false);
  const [person, setPerson] = useState<OrgContact | null | "new">(null);
  const [del, setDel] = useState(false);
  const [text, setText] = useState("");
  const reload = () => { d.reload(); onChanged(); };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Async state={d}>
        {({ org, related, prospects }) => (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-bold text-ink">{org.name}</h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="neutral">{st(`c.type.${org.type}`)}</Badge>
                  {org.stage && org.stage !== "none" ? <Badge tone={STAGE_TONE[org.stage]}>{st(`c.stage.${org.stage}`)}</Badge> : null}
                  {org.source.startsWith("registry") ? <Badge tone="gray">{st("c.fromRegistry")}</Badge> : null}
                  {(org.tags || []).map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Btn size="sm" onClick={() => setEdit(true)}>{st("c.edit")}</Btn>
                <Btn size="sm" variant="quiet" onClick={onClose}>{st("l.close")}</Btn>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-5">
                  <Card className="p-4">
                    <dl className="grid gap-2 text-[13.5px] sm:grid-cols-2">
                      {org.businessId ? <div><dt className="text-[12px] text-muted">{st("c.businessId")}</dt><dd>{org.businessId}</dd></div> : null}
                      {org.phone ? <div><dt className="text-[12px] text-muted">{st("c.phone")}</dt><dd><a className="hover:underline" href={telHref(org.phone)}>{org.phone}</a></dd></div> : null}
                      {org.email ? <div><dt className="text-[12px] text-muted">{st("c.email")}</dt><dd><a className="hover:underline" href={`mailto:${org.email}`}>{org.email}</a></dd></div> : null}
                      {org.website ? <div><dt className="text-[12px] text-muted">{st("c.website")}</dt><dd><a className="underline" target="_blank" rel="noopener noreferrer" href={/^https?:/.test(org.website) ? org.website : `https://${org.website}`}>{org.website}</a></dd></div> : null}
                      {org.address ? <div className="sm:col-span-2"><dt className="text-[12px] text-muted">{st("c.address")}</dt><dd>{org.address}</dd></div> : null}
                    </dl>
                    {!org.businessId && !org.phone && !org.email && !org.website && !org.address ? <p className="text-[13.5px] text-muted">{st("c.noDetails")}</p> : null}
                    {org.notes ? <p className="mt-3 rounded-xl bg-mist px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">{org.notes}</p> : null}
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-ink">{st("c.people")}</h3>
                      <Btn size="xs" icon={<IconPlus className="h-3.5 w-3.5" />} onClick={() => setPerson("new")}>{st("c.addPerson")}</Btn>
                    </div>
                    {(org.contacts || []).length ? (
                      <ul className="mt-2 divide-y divide-line">
                        {org.contacts.map((c) => (
                          <li key={c.id} className="flex items-start justify-between gap-2 py-2 text-[13.5px]">
                            <div className="min-w-0">
                              <p className="font-semibold text-ink">{c.name || "–"}{c.primary ? <Badge tone="green" className="ml-2">{st("c.p.primary")}</Badge> : null}</p>
                              {c.role ? <p className="text-muted">{c.role}</p> : null}
                              <p className="text-ink-soft">
                                {c.phone ? <a className="hover:underline" href={telHref(c.phone)}>{c.phone}</a> : null}
                                {c.phone && c.email ? " · " : ""}
                                {c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : null}
                              </p>
                              {c.note ? <p className="text-[12.5px] text-muted">{c.note}</p> : null}
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Btn size="xs" variant="quiet" onClick={() => setPerson(c)}>{st("c.edit")}</Btn>
                              <Btn size="xs" variant="quiet" onClick={async () => { if (await run("rm", () => removeOrgContact(org.id, c.id), st("c.p.removed"), { refresh: false })) reload(); }}>{st("c.p.remove")}</Btn>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-[13.5px] text-muted">{st("c.peopleNone")}</p>}
                  </Card>
                  {related.length ? (
                    <Card className="p-4">
                      <h3 className="font-display font-bold text-ink">{st("c.related")}</h3>
                      <ul className="mt-2 space-y-1 text-[13.5px]">
                        {related.map((r) => <li key={r.id}><button type="button" className="font-medium text-ink underline" onClick={() => setParams({ org: r.id })}>{r.name}</button> <span className="text-muted">· {st(`c.type.${r.type}`)}</span></li>)}
                      </ul>
                    </Card>
                  ) : null}
                  {owner ? <Btn variant="danger" size="sm" onClick={() => setDel(true)}>{st("c.delete")}</Btn> : null}
                </div>
                <div className="space-y-5">
                  <Card className="p-4">
                    <h3 className="font-display font-bold text-ink">{st("c.linked")}</h3>
                    {prospects.length ? (
                      <ul className="mt-2 space-y-1.5 text-[13.5px]">
                        {prospects.map((p) => (
                          <li key={p.id}>
                            <button type="button" className="text-left font-medium text-ink underline" onClick={() => nav("leads", { id: p.id })}>{p.addresses[0] || p.id}</button>
                            <span className="text-muted"> · {st(`l.prio.${p.priority}`)} · {st(`l.st.${p.status}`)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 text-[13.5px] text-muted">{st("c.linkedNone")}</p>}
                  </Card>
                  <Card className="p-4">
                    <h3 className="font-display font-bold text-ink">{st("c.activity")}</h3>
                    <TextArea aria-label={st("c.activity")} value={text} onChange={setText} rows={2} placeholder={st("c.activityPh")} className="mt-2" />
                    <Btn size="sm" className="mt-2" busy={busy === "act"} disabled={!text.trim()} onClick={async () => { if (await run("act", () => addOrgActivity(org.id, text), undefined, { refresh: false })) { setText(""); reload(); } }}>{st("c.addActivity")}</Btn>
                    <ul className="mt-3 space-y-2">
                      {(org.activity || []).map((a) => <li key={a.id} className="text-[13px]"><span className="text-muted">{ago(a.at, lang)} · {a.by}</span><p className="whitespace-pre-line text-ink">{a.text}</p></li>)}
                    </ul>
                  </Card>
                </div>
              </div>
            </div>
            <OrgDialog open={edit} org={org} onClose={() => setEdit(false)} onSaved={reload} accounts={accounts} />
            <PersonDialog org={org} person={person === "new" ? null : person} open={person !== null} onClose={() => setPerson(null)} onSaved={reload} />
            <Confirm open={del} onClose={() => setDel(false)} danger title={st("c.deleteTitle", { name: org.name })} confirmLabel={st("c.delete")} text={<p>{st("c.deleteText")}</p>}
              onConfirm={async () => { const r = await run("del", () => removeOrg(org.id), st("c.deleted"), { refresh: false }); if (r) { onChanged(); onClose(); } return !!r; }} />
          </>
        )}
      </Async>
    </div>
  );
}

export function Crm() {
  const st = useST();
  const { route, setParams } = useOffice();
  const data = useLoad(getOrgs, [], { poll: true });
  const [type, setType] = useState<OrgType | "all">("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const openId = route.params.org || null;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.orgs || [])
      .filter((o) => type === "all" || o.type === type)
      .filter((o) => !needle || [o.name, o.businessId, o.email, o.phone, (o.tags || []).join(" ")].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.prospects - a.prospects || a.name.localeCompare(b.name, "fi"));
  }, [data.data, type, q]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.data?.orgs.length || 0 };
    for (const o of data.data?.orgs || []) c[o.type] = (c[o.type] || 0) + 1;
    return c;
  }, [data.data]);
  return (
    <div>
      <Toolbar className="flex-wrap gap-3">
        <Chips label={st("c.type")} value={type} onChange={setType} options={(["all", ...TYPES] as const).filter((k) => k === "all" || counts[k]).map((k) => ({ key: k, label: k === "all" ? st("c.all") : st(`c.type.${k}`), count: counts[k] || 0 }))} />
        <Input aria-label={st("c.search")} value={q} onChange={setQ} placeholder={st("c.search")} className="min-w-[14rem] flex-1" />
        <Btn variant="primary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>{st("c.new")}</Btn>
      </Toolbar>
      <Async state={data}>
        {(d) =>
          d.orgs.length === 0 ? (
            <Card as="div"><Empty icon={<ICustomers className="h-6 w-6" />} title={st("c.none")} text={st("c.noneText")} action={<Btn variant="primary" size="sm" onClick={() => setCreating(true)}>{st("c.new")}</Btn>} /></Card>
          ) : rows.length === 0 ? (
            <Card as="div"><Empty title={st("c.noMatch")} /></Card>
          ) : (
            <ul className="space-y-2">
              {rows.slice(0, 400).map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setParams({ org: o.id })} className="flex w-full flex-col gap-1 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line hover:ring-ink/30 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{o.name}</p>
                      <p className="text-[13px] text-muted">{st(`c.type.${o.type}`)}{o.businessId ? ` · ${o.businessId}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                      {o.stage !== "none" ? <Badge tone={STAGE_TONE[o.stage]}>{st(`c.stage.${o.stage}`)}</Badge> : null}
                      {o.source.startsWith("registry") ? <Badge tone="gray">{st("c.fromRegistry")}</Badge> : null}
                      <span className={cx("text-muted", o.contacts || o.email || o.phone ? "text-[#17663a]" : "")}>{st("c.contacts", { n: o.contacts })}</span>
                      <span className="text-muted">· {st("c.prospects", { n: o.prospects })}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <OrgDialog open={creating} org={null} onClose={() => setCreating(false)} onSaved={(o) => { data.reload(); setParams({ org: o.id }); }} accounts={data.data?.accounts || []} />
      <Drawer open={!!openId} onClose={() => setParams({ org: null })} label={st("c.edit")}>
        {openId ? <OrgDetail id={openId} onClose={() => setParams({ org: null })} onChanged={() => data.reload()} accounts={data.data?.accounts || []} /> : null}
      </Drawer>
    </div>
  );
}
