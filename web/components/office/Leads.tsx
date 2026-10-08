"use client";
// Leads (owner and sales): building and renovation projects found in public sources, ranked for sales, with the
// sales workflow (status, owner, next step, notes) and links to the CRM organisations that buy.
import { useMemo, useState } from "react";
import {
  getOrgs, getProspect, getProspects, prospectSettings, runProspectSync, saveOrg, updateProspect,
  type Links, type Org, type OrgRow, type Priority, type Prospect, type ProspectRow, type ProspectStatus, type SalesPerson, type SyncStatus
} from "@/lib/sales";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, day, telHref } from "./format";
import { useST } from "./salesText";
import { IRefresh } from "./icons";
import { Async, Badge, Btn, Card, Chips, Drawer, Empty, Field, Input, Select, Switch, TextArea, Toolbar, cx, useCopy, type Tone } from "./ui";

const PRIO_TONE: Record<Priority, Tone> = { high: "red", medium: "sun", low: "gray", hold: "neutral" };
const STATUS_TONE: Record<ProspectStatus, Tone> = { new: "blue", researching: "violet", contacted: "sun", meeting: "orange", quoted: "orange", won: "green", lost: "gray", not_relevant: "neutral" };
const CLOSED: ProspectStatus[] = ["won", "lost", "not_relevant"];

function SourcesCard({ sync, onRun, busy }: { sync: SyncStatus; onRun: () => void; busy: boolean }) {
  const st = useST();
  const { lang } = useT();
  const { owner } = useOffice();
  const { run } = useAct();
  const [open, setOpen] = useState(false);
  const bad = sync.sources.some((s) => !s.ok);
  return (
    <Card className="mb-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 items-center gap-3 text-left">
          <span className="font-display text-[15px] font-bold text-ink">{st("l.sources")}</span>
          {bad ? <Badge tone="red" dot>{st("l.failed", { e: "" }).replace(/:\s*$/, "")}</Badge> : null}
          {sync.lastBuild ? <span className="truncate text-[13px] text-muted">{st("l.lastBuild", { total: sync.lastBuild.total, added: sync.lastBuild.added })} · {ago(sync.lastBuild.at, lang)}</span> : null}
          <span className="text-muted">{open ? "−" : "+"}</span>
        </button>
        <div className="flex items-center gap-3">
          {owner ? (
            <Switch checked={sync.enabled} onChange={(v) => run("auto", () => prospectSettings({ enabled: v }))} label={sync.enabled ? st("l.autoOn") : st("l.autoOff")} />
          ) : null}
          <Btn size="sm" icon={<IRefresh className="h-4 w-4" />} busy={busy || sync.running} onClick={onRun}>
            {sync.running ? st("l.running") : st("l.updateNow")}
          </Btn>
        </div>
      </div>
      {open ? (
        <>
          <p className="mt-2 text-[13px] text-ink-soft">{st("l.sourcesHow")}</p>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {sync.sources.map((s) => (
              <li key={s.key} className="rounded-xl bg-mist px-3 py-2 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{st(`l.src.${s.key}`)}</span>
                  <span className="text-muted">{st("l.every", { h: s.everyHours })}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-muted">
                  <span>{s.lastRun ? st("l.lastRun", { t: ago(s.lastRun, lang) }) : st("l.never")}</span>
                  {s.count != null ? <span>{st("l.found", { n: s.count })}</span> : null}
                  {s.next ? <span>{st("l.nextRun", { t: day(s.next.slice(0, 10), lang) + " " + s.next.slice(11, 16) })}</span> : null}
                </div>
                {!s.ok && s.error ? <p className="mt-1 text-[12.5px] font-medium text-[#b42318]">{st("l.failed", { e: s.error })}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

function timingText(st: ReturnType<typeof useST>, p: { timing: string; start: string | null; end: string | null; date: string }, lang: "fi" | "en" | "ru") {
  const d = (x: string | null) => (x ? day(x, lang, { year: true }) : "");
  if (p.timing === "upcoming") return st("l.timing.upcoming", { d: d(p.start) });
  if (p.timing === "active") return st("l.timing.active", { d: d(p.end) });
  if (p.timing === "ending") return st("l.timing.ending", { d: d(p.end) });
  if (p.timing === "ended") return st("l.timing.ended");
  return st(p.timing === "started" ? "l.timing.started" : "l.timing.permit", { d: d(p.date) });
}

function Row({ p, staff, onOpen }: { p: ProspectRow; staff: SalesPerson[]; onOpen: () => void }) {
  const st = useST();
  const { lang } = useT();
  const { today } = useOffice();
  const who = staff.find((x) => x.id === p.assigneeId);
  const fresh = p.firstSeen && today && Date.parse(today) - Date.parse(p.firstSeen) <= 7 * 864e5;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line transition hover:ring-ink/30 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex shrink-0 items-center gap-2 sm:w-28 sm:flex-col sm:items-start">
          <Badge tone={PRIO_TONE[p.priority]} dot>{st(`l.prio.${p.priority}`)}</Badge>
          <Badge tone={STATUS_TONE[p.status]}>{st(`l.st.${p.status}`)}</Badge>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">
            {p.addresses[0] || st(`l.tier.${p.tier}`)}
            {p.addresses.length > 1 || p.moreAddresses ? <span className="font-normal text-muted"> +{p.addresses.length - 1 + p.moreAddresses}</span> : null}
            {fresh ? <Badge tone="blue" className="ml-2">{st("l.newBadge")}</Badge> : null}
            {p.gone ? <Badge tone="gray" className="ml-2">{st("l.gone")}</Badge> : null}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {st(`l.tier.${p.tier}`)}
            {p.built ? ` · ${p.built}` : ""}
            {p.apartments ? ` · ${p.apartments} as.` : ""} · {timingText(st, p, lang)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={p.relevance === "confirmed" ? "green" : p.relevance === "unlikely" ? "gray" : "neutral"}>{st(`l.rel.${p.relevance}`)}</Badge>
            {p.scope.slice(0, 4).map((s) => <Badge key={s} tone="neutral">{st(`l.scope.${s}`)}</Badge>)}
          </div>
        </div>
        <div className="min-w-0 text-[13px] sm:w-64">
          <p className="truncate text-ink">{p.managerName || p.housingName || <span className="text-muted">{st("l.contact.missing")}</span>}</p>
          <p className={cx("truncate", p.contact === "ready" ? "text-[#17663a]" : "text-muted")}>{p.contact === "ready" ? p.managerPhone || p.managerEmail || st("l.contact.ready") : st(`l.contact.${p.contact}`)}</p>
          <p className="mt-1 truncate text-muted">
            {who ? who.name : st("l.unassigned")}
            {p.nextAction ? ` · ${st("l.next", { a: p.nextAction })}` : ""}
            {p.nextDate ? ` ${day(p.nextDate, lang)}` : ""}
          </p>
        </div>
      </button>
    </li>
  );
}

export function Leads() {
  const st = useST();
  const { user, route, setParams } = useOffice();
  const { run, busy } = useAct();
  const data = useLoad(getProspects, [], { poll: true });
  const prio = (route.params.p as Priority | "all") || "high";
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const [closed, setClosed] = useState(false);
  const [tier, setTier] = useState<string>("all");
  const openId = route.params.id || null;

  const rows = useMemo(() => {
    const all = data.data?.prospects || [];
    const needle = q.trim().toLowerCase();
    return all
      .filter((p) => (closed ? true : !CLOSED.includes(p.status) && !p.gone))
      .filter((p) => tier === "all" || p.tier === tier)
      .filter((p) => !mine || p.assigneeId === user.id)
      .filter((p) => !needle || [p.addresses.join(" "), p.managerName, p.housingName, p.nextAction].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => b.score - a.score);
  }, [data.data, q, mine, closed, tier, user.id]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, high: 0, medium: 0, low: 0, hold: 0 };
    for (const p of rows) c[p.priority]++;
    return c;
  }, [rows]);
  const shown = rows.filter((p) => prio === "all" || p.priority === prio);

  return (
    <div>
      <Async state={data}>
        {(d) => (
          <>
            <SourcesCard sync={d.sync} busy={busy === "sync"} onRun={() => run("sync", () => runProspectSync("all"), st("l.updateStarted"), { refresh: false }).then(() => window.setTimeout(() => data.reload(), 4000))} />
            {d.prospects.length === 0 ? (
              <Card as="div">
                <Empty title={st("l.empty")} text={st("l.emptyText")} action={<Btn variant="primary" size="sm" onClick={() => run("sync", () => runProspectSync("all"), st("l.updateStarted"), { refresh: false })}>{st("l.updateNow")}</Btn>} />
              </Card>
            ) : (
              <>
                <Toolbar className="flex-wrap gap-3">
                  <Chips
                    label={st("l.priority")}
                    value={prio}
                    onChange={(k) => setParams({ p: k === "high" ? null : k })}
                    options={(["high", "medium", "low", "hold", "all"] as const).map((k) => ({ key: k, label: st(`l.prio.${k}`), count: counts[k] }))}
                  />
                  <Select aria-label="tier" value={tier} onChange={setTier} className="w-auto min-w-[12rem]" options={[{ value: "all", label: st("l.prio.all") }, ...["A", "S", "L", "B", "C"].map((t) => ({ value: t, label: st(`l.tier.${t}`) }))]} />
                  <Input aria-label={st("l.search")} value={q} onChange={setQ} placeholder={st("l.search")} className="min-w-[14rem] flex-1" />
                  <Switch checked={mine} onChange={setMine} label={st("l.mine")} />
                  <Switch checked={closed} onChange={setClosed} label={st("l.showDone")} />
                </Toolbar>
                <p className="mb-2 text-[13px] text-muted">{st("l.count", { n: shown.length })}</p>
                {shown.length ? (
                  <ul className="space-y-2">
                    {shown.slice(0, 300).map((p) => <Row key={p.id} p={p} staff={d.staff} onOpen={() => setParams({ id: p.id })} />)}
                  </ul>
                ) : (
                  <Card as="div"><Empty title={st("l.none")} text={st("l.noneText")} /></Card>
                )}
              </>
            )}
          </>
        )}
      </Async>
      <Drawer open={!!openId} onClose={() => setParams({ id: null })} label={st("l.facts")}>
        {openId ? <ProspectDetail id={openId} onClose={() => setParams({ id: null })} onChanged={() => data.reload()} /> : null}
      </Drawer>
    </div>
  );
}

/* ---------------- Detail ---------------- */
function OrgSlot({ label, org, onLink, orgs, role }: { label: string; org: Org | null; onLink: (id: string | null) => void; orgs: OrgRow[]; role: "property_manager" | "housing_company" | "contractor" | "developer" }) {
  const st = useST();
  const { nav } = useOffice();
  const { run } = useAct();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const hits = q.trim().length >= 2 ? orgs.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];
  const people = org?.contacts || [];
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{label}</p>
          <p className="truncate font-semibold text-ink">{org ? org.name : <span className="font-normal text-muted">{st("l.org.none")}</span>}</p>
          {org?.businessId ? <p className="text-[12.5px] text-muted">{org.businessId}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {org ? <Btn size="xs" variant="quiet" onClick={() => nav("crm", { org: org.id })}>{st("l.org.open")}</Btn> : null}
          <Btn size="xs" variant="light" onClick={() => setPicking(!picking)}>{org ? st("l.org.change") : st("l.org.link")}</Btn>
          {org ? <Btn size="xs" variant="quiet" onClick={() => onLink(null)}>{st("l.org.unlink")}</Btn> : null}
        </div>
      </div>
      {org ? (
        <ul className="mt-2 space-y-1 text-[13px]">
          {org.phone ? <li><a className="text-ink hover:underline" href={telHref(org.phone)}>{org.phone}</a></li> : null}
          {org.email ? <li><a className="text-ink hover:underline" href={`mailto:${org.email}`}>{org.email}</a></li> : null}
          {people.map((c) => (
            <li key={c.id} className="text-ink-soft">
              <span className="font-medium text-ink">{c.name}</span>{c.role ? ` · ${c.role}` : ""}
              {c.phone ? <> · <a className="hover:underline" href={telHref(c.phone)}>{c.phone}</a></> : null}
              {c.email ? <> · <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a></> : null}
            </li>
          ))}
          {!org.phone && !org.email && !people.length ? <li className="text-muted">{st("l.org.noContact")}</li> : null}
        </ul>
      ) : null}
      {picking ? (
        <div className="mt-2">
          <Input aria-label={st("l.org.pick")} value={q} onChange={setQ} placeholder={st("l.org.pick")} />
          <ul className="mt-1 space-y-1">
            {hits.map((o) => (
              <li key={o.id}><button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-mist" onClick={() => (onLink(o.id), setPicking(false), setQ(""))}>{o.name}</button></li>
            ))}
            {q.trim().length >= 2 && !hits.some((o) => o.name.toLowerCase() === q.trim().toLowerCase()) ? (
              <li>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-[13.5px] font-semibold text-ink hover:bg-mist"
                  onClick={async () => {
                    const r = await run("neworg", () => saveOrg({ name: q.trim(), type: role }), undefined, { refresh: false });
                    if (r) { onLink(r.org.id); setPicking(false); setQ(""); }
                  }}
                >
                  {st("l.org.create", { name: q.trim() })}
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function drafts(p: Prospect, managerName: string) {
  const addr = p.addresses.slice(0, 2).join(", ");
  const manager = `Hei${managerName ? ` (${managerName})` : ""},

olen [nimi] [yritys] -yrityksestä. Teemme telinevuokrausta ja -asennusta [palvelualue]. Huomasimme, että kohteeseen ${addr} on myönnetty lupa korjaustyölle.

Onko hankkeen aikataulu jo tiedossa, ja onko urakoitsija valittu? Jos telineitä tarvitaan, voimme antaa tarjouksen pelkistä telineistä tai erillisenä rivinä urakan tarjouspyyntöön.

Kenen kanssa telineasioista kannattaa olla yhteydessä?

Ystävällisin terveisin
[nimi]
[puhelin] · [sähköposti]`;
  const contractor = `Hei,

olen [nimi] [yritys] -yrityksestä. Näimme, että kohteessa ${addr} on työmaa${p.start ? ` alkamassa ${p.start}` : " käynnissä"}.

Onko telineet tähän kohteeseen jo sovittu kaikkiin vaiheisiin? Tarjoamme [telinejärjestelmä] -telineet asennettuna ja tarkastettuna, myös lisäkapasiteettina tai varalle.

Voinko lähettää tarjouksen? Tarvitsisin julkisivun mitat tai piirustukset.

Ystävällisin terveisin
[nimi]
[puhelin] · [sähköposti]`;
  return { manager, contractor };
}

function ProspectDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const st = useST();
  const { lang } = useT();
  const { run, busy } = useAct();
  const { copy, copied } = useCopy();
  const d = useLoad(() => getProspect(id), [id]);
  const orgs = useLoad(getOrgs, []);
  const [form, setForm] = useState<{ key: string; status: ProspectStatus; assigneeId: string; nextAction: string; nextDate: string; priorityOverride: string } | null>(null);
  const [note, setNote] = useState("");
  const p = d.data?.prospect;
  if (p && (!form || form.key !== p.id + p.status + (p.assigneeId || "") + p.nextAction + (p.nextDate || "") + (p.priorityOverride || ""))) {
    setForm({ key: p.id + p.status + (p.assigneeId || "") + p.nextAction + (p.nextDate || "") + (p.priorityOverride || ""), status: p.status, assigneeId: p.assigneeId || "", nextAction: p.nextAction, nextDate: p.nextDate || "", priorityOverride: p.priorityOverride || "" });
  }
  async function save(body: Parameters<typeof updateProspect>[1], ok?: string) {
    const r = await run("save", () => updateProspect(id, body), ok, { refresh: false });
    if (r) { d.reload(); onChanged(); }
    return r;
  }
  const link = (f: keyof Links) => (orgId: string | null) => save({ links: { [f]: orgId } }, st("l.saved"));
  const ask = !p ? "" : p.tier === "C" ? "l.ask.house" : p.tier === "B" ? "l.ask.newbuild" : ["upcoming", "active", "ending"].includes(p.timing) ? "l.ask.site" : p.relevance === "confirmed" ? "l.ask.permit" : "l.ask.unknown";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-bold text-ink">{p ? p.addresses[0] || st(`l.tier.${p.tier}`) : "…"}</h2>
          {p ? <p className="truncate text-[13px] text-muted">{p.addresses.slice(1).join(", ")}</p> : null}
        </div>
        <Btn variant="quiet" onClick={onClose}>{st("l.close")}</Btn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <Async state={d}>
          {({ prospect: p, orgs: o, staff, statuses }) => (
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              <div className="space-y-5">
                <Card className="p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={PRIO_TONE[p.priority]} dot>{st(`l.prio.${p.priority}`)}</Badge>
                    <Badge tone={p.relevance === "confirmed" ? "green" : "neutral"}>{st(`l.rel.${p.relevance}`)}</Badge>
                    <Badge tone="neutral">{timingText(st, p, lang)}</Badge>
                    {p.scope.map((s) => <Badge key={s} tone="neutral">{st(`l.scope.${s}`)}</Badge>)}
                  </div>
                  <p className="mt-3 text-[12px] font-semibold tracking-wide text-muted uppercase">{st("l.whyTitle")}</p>
                  <ul className="mt-1 list-disc pl-5 text-[13.5px] text-ink-soft">{p.reasons.map((r) => <li key={r}>{st(`l.why.${r}`)}</li>)}</ul>
                  <p className="mt-3 text-[12px] font-semibold tracking-wide text-muted uppercase">{st("l.ask")}</p>
                  <p className="mt-1 text-[13.5px] text-ink">{p.research?.question || st(ask)}</p>
                </Card>

                {p.research ? (
                  <Card className="p-4">
                    <h3 className="font-display font-bold text-ink">{st("l.research")}{p.research.checked ? <span className="ml-2 text-[12px] font-normal text-muted">{st("l.r.checked", { d: day(p.research.checked, lang, { year: true }) })}</span> : null}</h3>
                    <p className="mt-2 text-[13.5px] whitespace-pre-line text-ink">{p.research.summary}</p>
                    <dl className="mt-3 grid gap-2 text-[13.5px] sm:grid-cols-2">
                      {(["scope", "timing", "buyer", "contactRoute"] as const).map((k) => (p.research?.[k] ? <div key={k}><dt className="text-[12px] text-muted">{st(`l.r.${k === "contactRoute" ? "route" : k}`)}</dt><dd className="text-ink">{p.research[k]}</dd></div> : null))}
                    </dl>
                    {p.research.gaps?.length ? (<><p className="mt-3 text-[12px] font-semibold text-muted uppercase">{st("l.r.gaps")}</p><ul className="list-disc pl-5 text-[13px] text-ink-soft">{p.research.gaps.map((g) => <li key={g}>{g}</li>)}</ul></>) : null}
                    {p.research.evidence?.length ? (
                      <>
                        <p className="mt-3 text-[12px] font-semibold text-muted uppercase">{st("l.r.evidence")}</p>
                        <ul className="space-y-1 text-[13px]">
                          {p.research.evidence.map((e) => (
                            <li key={e.url + e.note}><a href={e.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">{e.title || new URL(e.url).hostname}</a> <span className="text-ink-soft">– {e.note}</span> <span className="text-muted">({e.checked})</span></li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </Card>
                ) : null}

                <Card className="p-4">
                  <h3 className="font-display font-bold text-ink">{st("l.street")}</h3>
                  {p.street.length ? (
                    <ul className="mt-2 space-y-2">
                      {p.street.map((s) => (
                        <li key={s.id} className="rounded-xl bg-mist px-3 py-2 text-[13.5px]">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">{day(s.start, lang, { year: true })} – {day(s.end, lang, { year: true })}</span>
                            <Badge tone={s.timing === "upcoming" ? "blue" : s.timing === "active" ? "green" : s.timing === "ending" ? "sun" : "gray"}>{timingText(st, { timing: s.timing, start: s.start, end: s.end, date: s.start }, lang)}</Badge>
                            <span className="text-muted">{s.address} · {s.id}</span>
                          </div>
                          <p className="mt-1 text-ink-soft">{s.text}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-[13.5px] text-muted">{st("l.streetNone")}</p>}
                  {p.notices.length ? (
                    <>
                      <h3 className="mt-4 font-display font-bold text-ink">{st("l.notices")}</h3>
                      <ul className="mt-2 space-y-2">
                        {p.notices.map((n) => (
                          <li key={n.id} className="rounded-xl bg-mist px-3 py-2 text-[13.5px]"><span className="font-semibold text-ink">{n.id}</span> · {n.description}{n.verdictAt ? <span className="text-muted"> · {day(n.verdictAt, lang, { year: true })}</span> : null}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <h3 className="font-display font-bold text-ink">{st("l.facts")}</h3>
                  <dl className="mt-2 grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-2">
                    <div><dt className="text-[12px] text-muted">{st("l.f.type")}</dt><dd>{[p.op, p.use].filter(Boolean).join(" / ") || st(`l.tier.${p.tier}`)}</dd></div>
                    {p.date ? <div><dt className="text-[12px] text-muted">{st("l.f.decided")}</dt><dd>{day(p.date, lang, { year: true })}</dd></div> : null}
                    {p.built ? <div><dt className="text-[12px] text-muted">{st("l.f.built")}</dt><dd>{p.built}</dd></div> : null}
                    {p.apartments ? <div><dt className="text-[12px] text-muted">{st("l.f.apartments")}</dt><dd>{p.apartments}</dd></div> : null}
                    {p.buildings ? <div><dt className="text-[12px] text-muted">{st("l.f.buildings")}</dt><dd>{p.buildings}</dd></div> : null}
                    {p.floors ? <div><dt className="text-[12px] text-muted">{st("l.f.floors")}</dt><dd>{p.floors}</dd></div> : null}
                    {p.permitIds.length ? <div><dt className="text-[12px] text-muted">{st("l.f.permits")}</dt><dd className="break-all">{p.permitIds.join(", ")}</dd></div> : null}
                    {p.property ? <div><dt className="text-[12px] text-muted">{st("l.f.property")}</dt><dd>{p.property}</dd></div> : null}
                    {p.protected ? <div><dd><Badge tone="orange">{st("l.f.protected")}</Badge></dd></div> : null}
                    {p.coords ? <div><dd><a className="font-medium text-ink underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${p.coords[1]},${p.coords[0]}`}>{st("l.f.map")}</a></dd></div> : null}
                  </dl>
                  {p.prh && !p.prh.none ? (
                    <p className="mt-3 text-[13px] text-ink-soft">{st("l.prh")}: {p.prh.name} ({p.prh.businessId}){p.prh.manager ? ` · c/o ${p.prh.manager}` : ""}{p.prh.certain === false ? <span className="block font-medium text-[#b42318]">{st("l.prhUncertain")}</span> : null}</p>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <h3 className="font-display font-bold text-ink">{st("l.drafts")}</h3>
                  {(["manager", "contractor"] as const).map((k) => {
                    const text = drafts(p, o.manager?.name || "")[k];
                    return (
                      <div key={k} className="mt-3">
                        <div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-ink">{st(`l.draft.${k}`)}</p><Btn size="xs" variant="light" onClick={() => copy(text)}>{copied === text ? st("l.copied") : st("l.copy")}</Btn></div>
                        <pre className="mt-1 rounded-xl bg-mist px-3 py-2 font-sans text-[13px] whitespace-pre-wrap text-ink-soft">{text}</pre>
                      </div>
                    );
                  })}
                </Card>
              </div>

              <div className="space-y-5">
                {form ? (
                  <Card className="space-y-3 p-4">
                    <Field label={st("l.status")}>{(fid) => <Select id={fid} value={form.status} onChange={(v) => setForm({ ...form, status: v as ProspectStatus })} options={statuses.map((s) => ({ value: s, label: st(`l.st.${s}`) }))} />}</Field>
                    <Field label={st("l.assignee")}>{(fid) => <Select id={fid} value={form.assigneeId} onChange={(v) => setForm({ ...form, assigneeId: v })} options={[{ value: "", label: st("l.unassigned") }, ...staff.map((x) => ({ value: x.id, label: x.name }))]} />}</Field>
                    <Field label={st("l.priority")}>{(fid) => <Select id={fid} value={form.priorityOverride} onChange={(v) => setForm({ ...form, priorityOverride: v })} options={[{ value: "", label: st("l.priorityAuto", { p: st(`l.prio.${p.priorityAuto}`) }) }, ...(["high", "medium", "low", "hold"] as const).map((x) => ({ value: x, label: st(`l.prio.${x}`) }))]} />}</Field>
                    <Field label={st("l.nextAction")}>{(fid) => <Input id={fid} value={form.nextAction} onChange={(v) => setForm({ ...form, nextAction: v })} maxLength={300} />}</Field>
                    <Field label={st("l.nextDate")}>{(fid) => <Input id={fid} type="date" value={form.nextDate} onChange={(v) => setForm({ ...form, nextDate: v })} />}</Field>
                    <Btn variant="primary" busy={busy === "save"} onClick={() => save({ status: form.status, assigneeId: form.assigneeId || null, nextAction: form.nextAction, nextDate: form.nextDate || null, priorityOverride: (form.priorityOverride || null) as Priority | null }, st("l.saved"))}>{st("l.save")}</Btn>
                  </Card>
                ) : null}

                <div className="space-y-2">
                  <h3 className="font-display font-bold text-ink">{st("l.orgs")}</h3>
                  <OrgSlot label={st("l.org.manager")} org={o.manager} onLink={link("managerId")} orgs={orgs.data?.orgs || []} role="property_manager" />
                  <OrgSlot label={st("l.org.housing")} org={o.housing} onLink={link("housingId")} orgs={orgs.data?.orgs || []} role="housing_company" />
                  <OrgSlot label={st("l.org.contractor")} org={o.contractor} onLink={link("contractorId")} orgs={orgs.data?.orgs || []} role="contractor" />
                  <OrgSlot label={st("l.org.owner")} org={o.owner} onLink={link("ownerId")} orgs={orgs.data?.orgs || []} role="developer" />
                </div>

                <Card className="p-4">
                  <h3 className="font-display font-bold text-ink">{st("l.notes")}</h3>
                  <TextArea aria-label={st("l.notes")} value={note} onChange={setNote} rows={3} placeholder={st("l.notePh")} className="mt-2" />
                  <Btn size="sm" className="mt-2" busy={busy === "save"} disabled={!note.trim()} onClick={async () => { if (await save({ note })) setNote(""); }}>{st("l.addNote")}</Btn>
                  <ul className="mt-3 space-y-2">
                    {p.notes.map((n) => (
                      <li key={n.id} className="text-[13px]">
                        <span className="text-muted">{ago(n.at, lang)} · {n.by}</span>
                        <p className="whitespace-pre-line text-ink">{n.status ? st("l.statusChanged", { s: st(`l.st.${n.status}`) }) : n.text}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
          )}
        </Async>
      </div>
    </div>
  );
}
