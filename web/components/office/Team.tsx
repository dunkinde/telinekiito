"use client";
// Team: crews (trucks and colours) and the people who log in (phone + PIN).
import { useState } from "react";
import { addCrew, addStaff, getStaff, removeCrew, removeStaff, updateCrew, updateStaff, type Crew, type Role, type StaffLang, type StaffUser } from "@/lib/platform";
import { IconPhone, IconPlus } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, telHref } from "./format";
import { roleLabel } from "./i18n";
import { IEdit, IHelmet, ITeam, ITrash } from "./icons";
import { CrewDot } from "./bits";
import { Async, Badge, Btn, Callout, Card, CardHead, Confirm, Dialog, Empty, Field, IconBtn, Input, Select, Switch, TableWrap, cx, td, th } from "./ui";

const COLORS = ["#e0a800", "#2f6fde", "#16a34a", "#e5484d", "#8b5cf6", "#0e9aa7", "#f97316", "#64748b"];
const LANGS: StaffLang[] = ["fi", "en", "ru"];
const LANG_NAMES: Record<StaffLang, string> = { fi: "Suomi", en: "English", ru: "Русский" };

function CrewDialog({ open, crew, onClose, onSaved }: { open: boolean; crew: Crew | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const { busy, run } = useAct();
  const [d, setD] = useState({ name: "", truck: "", color: COLORS[0], active: true });
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? crew?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open) setD(crew ? { name: crew.name, truck: crew.truck || "", color: crew.color, active: crew.active } : { name: "", truck: "", color: COLORS[0], active: true });
  }
  async function save() {
    if (!d.name.trim()) return;
    const r = await run("save", () => (crew ? updateCrew(crew.id, { name: d.name.trim(), truck: d.truck.trim(), color: d.color, active: d.active }) : addCrew({ name: d.name.trim(), truck: d.truck.trim(), color: d.color })), t("team.crewSaved"));
    if (r) {
      onSaved();
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={crew ? t("team.editCrew", { name: crew.name }) : t("team.newCrew")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={save} busy={busy === "save"} disabled={!d.name.trim()}>
            {t("ui.save")}
          </Btn>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("team.crewName")}>{(id) => <Input id={id} value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={60} placeholder={t("team.crewNamePh")} />}</Field>
          <Field label={t("team.truck")} optional>
            {(id) => <Input id={id} value={d.truck} onChange={(v) => setD({ ...d, truck: v })} maxLength={60} placeholder="ABC-123" />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold text-ink-soft">{t("team.color")}</legend>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <label key={c} className="relative cursor-pointer">
                <input type="radio" name="crew-color" value={c} checked={d.color === c} onChange={() => setD({ ...d, color: c })} className="peer sr-only" />
                <span className="block h-9 w-9 rounded-full ring-2 ring-transparent ring-offset-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-ink" style={{ background: c }} />
                <span className="sr-only">{c}</span>
              </label>
            ))}
            <label className="ml-1 flex items-center gap-2 text-[13px] text-muted">
              {t("team.customColor")}
              <input type="color" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-white p-1" />
            </label>
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted">{t("team.colorHint")}</p>
        </fieldset>
        {crew ? <Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("team.crewActive")} hint={t("team.crewActiveHint")} /> : null}
        <button type="submit" className="sr-only">
          {t("ui.save")}
        </button>
      </form>
    </Dialog>
  );
}

type SDraft = { name: string; phone: string; role: Role; crewId: string; lang: StaffLang; pin: string };
function StaffDialog({ open, person, crews, onClose, onSaved }: { open: boolean; person: StaffUser | null; crews: Crew[]; onClose: () => void; onSaved: () => void }) {
  const i = useT();
  const { t } = i;
  const { busy, run } = useAct();
  const [d, setD] = useState<SDraft>({ name: "", phone: "", role: "worker", crewId: "", lang: "fi", pin: "" });
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? person?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open) setD(person ? { name: person.name, phone: person.phone || "", role: person.role, crewId: person.crewId || "", lang: person.lang, pin: "" } : { name: "", phone: "", role: "worker", crewId: crews[0]?.id || "", lang: "fi", pin: "" });
  }
  const pinBad = d.pin !== "" && !/^\d{4,8}$/.test(d.pin);
  const ok = d.name.trim() && d.phone.replace(/\D/g, "").length >= 6 && (person ? !pinBad : /^\d{4,8}$/.test(d.pin));
  async function save() {
    if (!ok) return;
    const body = { name: d.name.trim(), phone: d.phone.trim(), role: d.role, crewId: d.crewId || null, lang: d.lang, ...(d.pin ? { pin: d.pin } : {}) };
    const r = await run("save", () => (person ? updateStaff(person.id, body) : addStaff({ ...body, pin: d.pin })), person ? t("team.personSaved") : t("team.personAdded", { name: d.name.trim() }));
    if (r) {
      onSaved();
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={person ? t("team.editPerson", { name: person.name }) : t("team.newPerson")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={save} busy={busy === "save"} disabled={!ok}>
            {t("ui.save")}
          </Btn>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t("team.name")}>{(id) => <Input id={id} value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={80} autoComplete="off" />}</Field>
        <Field label={t("team.phone")} hint={t("team.phoneHint")}>
          {(id, h) => <Input id={id} type="tel" value={d.phone} onChange={(v) => setD({ ...d, phone: v })} maxLength={40} describedBy={h} autoComplete="off" />}
        </Field>
        <Field label={t("team.role")} hint={t(`team.roleHint.${d.role}`)}>
          {(id, h) => <Select id={id} value={d.role} onChange={(v) => setD({ ...d, role: v as Role })} describedBy={h} options={(["worker", "leader", "sales", "owner"] as Role[]).map((r) => ({ value: r, label: roleLabel(i, r) }))} />}
        </Field>
        <Field label={t("team.crew")}>
          {(id) => <Select id={id} value={d.crewId} onChange={(v) => setD({ ...d, crewId: v })} options={[{ value: "", label: t("team.noCrew") }, ...crews.map((c) => ({ value: c.id, label: c.name }))]} />}
        </Field>
        <Field label={t("team.lang")} hint={t("team.langHint")}>
          {(id, h) => <Select id={id} value={d.lang} onChange={(v) => setD({ ...d, lang: v as StaffLang })} describedBy={h} options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />}
        </Field>
        <Field label={person ? t("team.newPin") : t("team.pin")} hint={person ? t("team.newPinHint") : t("team.pinHint")} error={pinBad ? t("team.pinBad") : null}>
          {(id, h) => <Input id={id} type="text" inputMode="numeric" autoComplete="off" value={d.pin} onChange={(v) => setD({ ...d, pin: v.replace(/\D/g, "").slice(0, 8) })} describedBy={h} className="font-mono tracking-[0.3em]" />}
        </Field>
        <button type="submit" className="sr-only">
          {t("ui.save")}
        </button>
      </form>
    </Dialog>
  );
}

export function Team() {
  const i = useT();
  const { t, lang } = i;
  const { owner, user } = useOffice();
  const st = useLoad(getStaff, [], { poll: true });
  const { busy, run } = useAct();
  const [crewEdit, setCrewEdit] = useState<Crew | null>(null);
  const [crewNew, setCrewNew] = useState(false);
  const [crewDel, setCrewDel] = useState<Crew | null>(null);
  const [pEdit, setPEdit] = useState<StaffUser | null>(null);
  const [pNew, setPNew] = useState(false);
  const [pDel, setPDel] = useState<StaffUser | null>(null);
  const reload = () => st.reload();

  return (
    <div className="space-y-5">
      <Callout tone="info" icon={<IHelmet className="h-5 w-5" />} title={t("team.loginsTitle")}>
        {t("team.logins")}{" "}
        <a href="/crew" target="_blank" rel="noopener" className="font-semibold text-ink underline underline-offset-2">
          /crew
        </a>
      </Callout>
      <Async state={st}>
        {(d) => (
          <>
            <section aria-labelledby="team-crews">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="team-crews" className="font-display text-[18px] font-bold text-ink">
                  {t("team.crews")}
                </h2>
                {owner ? (
                  <Btn size="sm" variant="primary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setCrewNew(true)}>
                    {t("team.newCrew")}
                  </Btn>
                ) : null}
              </div>
              {d.crews.length ? (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {d.crews.map((c) => {
                    const members = d.staff.filter((s) => s.crewId === c.id);
                    return (
                      <li key={c.id}>
                        <Card as="article" className={cx("h-full overflow-hidden", !c.active && "opacity-70")} aria-label={c.name}>
                          <div className="h-1.5" style={{ background: c.color }} aria-hidden />
                          <div className="flex items-start justify-between gap-2 px-4 pt-3">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
                                <CrewDot color={c.color} />
                                <span className="truncate">{c.name}</span>
                              </p>
                              <p className="text-[12.5px] text-muted">{c.truck ? t("team.truckV", { truck: c.truck }) : t("team.noTruck")}</p>
                            </div>
                            {owner ? (
                              <div className="flex shrink-0">
                                <IconBtn label={t("team.editCrewShort", { name: c.name })} tone="quiet" onClick={() => setCrewEdit(c)}>
                                  <IEdit className="h-[17px] w-[17px]" />
                                </IconBtn>
                                <IconBtn label={t("team.deleteCrewShort", { name: c.name })} tone="quiet" onClick={() => setCrewDel(c)}>
                                  <ITrash className="h-[17px] w-[17px]" />
                                </IconBtn>
                              </div>
                            ) : null}
                          </div>
                          <div className="px-4 pt-2 pb-4">
                            {!c.active ? <Badge tone="gray">{t("team.crewOff")}</Badge> : null}
                            <p className="mt-1 text-[12px] font-semibold tracking-wide text-muted uppercase">{t("team.members", { n: members.length })}</p>
                            {members.length ? (
                              <ul className="mt-1 space-y-0.5 text-[13.5px]">
                                {members.map((m) => (
                                  <li key={m.id} className={cx("flex items-center justify-between gap-2", m.active === false && "text-muted line-through")}>
                                    <span className="truncate">{m.name}</span>
                                    <span className="shrink-0 text-[12px] text-muted">{roleLabel(i, m.role)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-1 text-[13px] text-muted">{t("team.noMembers")}</p>
                            )}
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Card as="div">
                  <Empty icon={<ITeam className="h-6 w-6" />} title={t("team.noCrews")} text={t("team.noCrewsText")} />
                </Card>
              )}
            </section>

            <section aria-labelledby="team-people">
              <Card>
                <CardHead
                  id="team-people"
                  title={t("team.people")}
                  sub={t("team.peopleSub", { n: d.staff.length })}
                  actions={
                    owner ? (
                      <Btn size="sm" variant="primary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setPNew(true)}>
                        {t("team.newPerson")}
                      </Btn>
                    ) : null
                  }
                />
                {d.staff.length ? (
                  <TableWrap>
                    <table className="w-full min-w-[820px] border-collapse">
                      <caption className="sr-only">{t("team.people")}</caption>
                      <thead>
                        <tr className="border-y border-line bg-mist/50">
                          <th scope="col" className={th}>
                            {t("team.name")}
                          </th>
                          <th scope="col" className={th}>
                            {t("team.role")}
                          </th>
                          <th scope="col" className={th}>
                            {t("team.crew")}
                          </th>
                          <th scope="col" className={th}>
                            {t("team.lang")}
                          </th>
                          <th scope="col" className={th}>
                            {t("team.lastLogin")}
                          </th>
                          <th scope="col" className={th}>
                            {t("team.state")}
                          </th>
                          {owner ? (
                            <th scope="col" className={th}>
                              <span className="sr-only">{t("team.actions")}</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {[...d.staff]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((s) => {
                            const crew = d.crews.find((c) => c.id === s.crewId);
                            const me = s.id === user.id;
                            const off = s.active === false;
                            return (
                              <tr key={s.id} className={cx("border-b border-line last:border-0", off && "bg-mist/40")}>
                                <td className={td}>
                                  <p className={cx("font-semibold", off && "text-muted")}>
                                    {s.name}
                                    {me ? <span className="ml-1.5 text-[12px] font-normal text-muted">({t("team.you")})</span> : null}
                                  </p>
                                  {s.phone ? (
                                    <a href={telHref(s.phone)} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink hover:underline">
                                      <IconPhone className="h-3.5 w-3.5" />
                                      {s.phone}
                                    </a>
                                  ) : null}
                                </td>
                                <td className={td}>
                                  <Badge tone={s.role === "owner" ? "ink" : s.role === "leader" || s.role === "sales" ? "sun" : "neutral"}>{roleLabel(i, s.role)}</Badge>
                                </td>
                                <td className={td}>{crew ? <span className="inline-flex items-center gap-1.5"><CrewDot color={crew.color} />{crew.name}</span> : <span className="text-muted">{t("team.noCrew")}</span>}</td>
                                <td className={td}>{LANG_NAMES[s.lang] || s.lang}</td>
                                <td className={cx(td, "text-[13px] text-ink-soft")}>{s.lastLoginAt ? ago(s.lastLoginAt, lang) : t("team.never")}</td>
                                <td className={td}>
                                  <Badge tone={off ? "gray" : "green"} dot>
                                    {off ? t("team.off") : t("team.on")}
                                  </Badge>
                                </td>
                                {owner ? (
                                  <td className={td}>
                                    <div className="flex justify-end gap-1">
                                      <Btn
                                        size="xs"
                                        variant="light"
                                        disabled={me}
                                        busy={busy === s.id}
                                        onClick={() => run(s.id, () => updateStaff(s.id, { active: off }), off ? t("team.switchedOn", { name: s.name }) : t("team.switchedOff", { name: s.name })).then((r) => r && reload())}
                                        title={me ? t("team.notSelf") : undefined}
                                      >
                                        {off ? t("team.switchOn") : t("team.switchOff")}
                                      </Btn>
                                      <IconBtn label={t("team.editPersonShort", { name: s.name })} tone="quiet" onClick={() => setPEdit(s)}>
                                        <IEdit className="h-[17px] w-[17px]" />
                                      </IconBtn>
                                      <IconBtn label={t("team.removePersonShort", { name: s.name })} tone="quiet" onClick={() => setPDel(s)} disabled={me}>
                                        <ITrash className="h-[17px] w-[17px]" />
                                      </IconBtn>
                                    </div>
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </TableWrap>
                ) : (
                  <Empty icon={<ITeam className="h-6 w-6" />} title={t("team.noPeople")} text={t("team.noPeopleText")} />
                )}
                {!owner ? <p className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{t("team.leaderNote")}</p> : null}
              </Card>
            </section>

            <CrewDialog open={crewNew || !!crewEdit} crew={crewEdit} onClose={() => (setCrewNew(false), setCrewEdit(null))} onSaved={reload} />
            <StaffDialog open={pNew || !!pEdit} person={pEdit} crews={d.crews} onClose={() => (setPNew(false), setPEdit(null))} onSaved={reload} />
            <Confirm
              open={!!crewDel}
              onClose={() => setCrewDel(null)}
              danger
              title={t("team.deleteCrewTitle", { name: crewDel?.name || "" })}
              confirmLabel={t("team.deleteBtn")}
              text={<p>{t("team.deleteCrewText")}</p>}
              onConfirm={async () => {
                if (!crewDel) return;
                const r = await run("delcrew", () => removeCrew(crewDel.id), t("team.crewDeleted"));
                if (r) reload();
                return !!r;
              }}
            />
            <Confirm
              open={!!pDel}
              onClose={() => setPDel(null)}
              danger
              title={t("team.removeTitle", { name: pDel?.name || "" })}
              confirmLabel={t("team.removeBtn")}
              text={<p>{t("team.removeText")}</p>}
              onConfirm={async () => {
                if (!pDel) return;
                const r = await run("delp", () => removeStaff(pDel.id), t("team.removed"));
                if (r) reload();
                return !!r;
              }}
            />
          </>
        )}
      </Async>
    </div>
  );
}
