"use client";
// The company's own people in the portal (admins only), and the same dialog the office uses for an account's users.
import { useState } from "react";
import { BIZ_ROLES, bizRemoveUser, bizSaveUser, bizUsers, type BizRole, type BizUser } from "@/lib/business";
import type { StaffLang } from "@/lib/platform";
import { useT } from "../office/context";
import { dateTime } from "../office/format";
import { errMessage, LANG_NAMES, LANGS } from "../office/i18n";
import { IEdit, ITeam, ITrash } from "../office/icons";
import { Async, Badge, Btn, Card, Confirm, Dialog, Empty, Field, IconBtn, Input, Select, Switch } from "../office/ui";
import { IconPlus } from "../ui/Icons";
import { useBiz, useBizAct, useBizLoad } from "./context";

export function Users() {
  const { t } = useT();
  const { me } = useBiz();
  const st = useBizLoad(bizUsers, []);
  const { run } = useBizAct();
  const [edit, setEdit] = useState<BizUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<BizUser | null>(null);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[1.7rem] font-extrabold tracking-[-0.01em] text-ink">{t("biz.users.title")}</h1>
          <p className="text-[14px] text-muted">{t("biz.users.sub")}</p>
        </div>
        <Btn variant="primary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          {t("biz.users.add")}
        </Btn>
      </div>
      <Async state={st}>
        {(d) => (
          <UserList
            users={d.users}
            selfId={me.user.id}
            onEdit={setEdit}
            onDelete={setDel}
          />
        )}
      </Async>
      <UserDialog
        open={adding || !!edit}
        user={edit}
        selfId={me.user.id}
        onClose={() => (setAdding(false), setEdit(null))}
        save={(body, id) => bizSaveUser(body, id)}
        onSaved={() => st.reload()}
      />
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        danger
        title={t("biz.users.removeTitle", { name: del?.name || "" })}
        text={<p>{t("biz.users.removeText")}</p>}
        confirmLabel={t("team.removeBtn")}
        onConfirm={async () => {
          if (!del) return;
          const r = await run("del", () => bizRemoveUser(del.id), t("team.removed"));
          if (r) st.reload();
          return !!r;
        }}
      />
    </div>
  );
}

export function UserList({ users, selfId, onEdit, onDelete }: { users: BizUser[]; selfId?: string; onEdit: (u: BizUser) => void; onDelete: (u: BizUser) => void }) {
  const { t, lang } = useT();
  if (!users.length)
    return (
      <Card as="div">
        <Empty icon={<ITeam className="h-6 w-6" />} title={t("biz.users.none")} />
      </Card>
    );
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {users.map((u) => (
        <li key={u.id}>
          <Card as="div" className="flex h-full items-start gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">
                {u.name} {u.id === selfId ? <span className="text-[12.5px] font-normal text-muted">({t("team.you")})</span> : null}
              </p>
              <p className="text-[13px] text-muted">
                {u.phone}
                {u.email ? ` · ${u.email}` : ""}
              </p>
              <p className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={u.role === "admin" ? "ink" : u.role === "manager" ? "blue" : "neutral"}>{t(`biz.role.${u.role}`)}</Badge>
                <Badge tone="neutral">{LANG_NAMES[u.lang] || u.lang}</Badge>
                {!u.active ? <Badge tone="gray">{t("team.off")}</Badge> : null}
              </p>
              <p className="mt-1.5 text-[12px] text-muted">
                {t("team.lastLogin")}: {u.lastLoginAt ? dateTime(u.lastLoginAt, lang) : t("team.never")}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <IconBtn label={t("team.editPersonShort", { name: u.name })} tone="quiet" onClick={() => onEdit(u)}>
                <IEdit className="h-[18px] w-[18px]" />
              </IconBtn>
              {u.id !== selfId ? (
                <IconBtn label={t("team.removePersonShort", { name: u.name })} tone="quiet" onClick={() => onDelete(u)}>
                  <ITrash className="h-[18px] w-[18px]" />
                </IconBtn>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

type Draft = { name: string; phone: string; email: string; role: BizRole; lang: StaffLang; pin: string; active: boolean };

/** Add or edit a portal user. Used by the company's admin and by the office (with its own save function). */
export function UserDialog({
  open,
  user,
  selfId,
  onClose,
  save,
  onSaved
}: {
  open: boolean;
  user: BizUser | null;
  selfId?: string;
  onClose: () => void;
  save: (body: Partial<BizUser> & { pin?: string }, id?: string) => Promise<unknown>;
  onSaved: () => void;
}) {
  const i = useT();
  const { t } = i;
  const [d, setD] = useState<Draft>({ name: "", phone: "", email: "", role: "manager", lang: "fi", pin: "", active: true });
  const [seen, setSeen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = open ? user?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    setErr(null);
    if (open) setD(user ? { name: user.name, phone: user.phone, email: user.email, role: user.role, lang: user.lang, pin: "", active: user.active } : { name: "", phone: "", email: "", role: "manager", lang: "fi", pin: "", active: true });
  }
  const self = !!user && user.id === selfId;
  const pinBad = d.pin !== "" && !/^\d{4,8}$/.test(d.pin);
  const needPin = !user && !d.pin;
  async function submit() {
    if (!d.name.trim() || !d.phone.trim() || pinBad || needPin) return;
    setBusy(true);
    setErr(null);
    try {
      await save({ name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(), role: d.role, lang: d.lang, active: d.active, ...(d.pin ? { pin: d.pin } : {}) }, user?.id);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errMessage(i, e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={user ? t("team.editPerson", { name: user.name }) : t("biz.users.add")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={submit} busy={busy} disabled={!d.name.trim() || !d.phone.trim() || pinBad || needPin}>
            {t("ui.save")}
          </Btn>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("team.name")}>{(id) => <Input id={id} value={d.name} onChange={(v) => setD({ ...d, name: v })} maxLength={80} />}</Field>
        <Field label={t("team.phone")} hint={t("team.phoneHint")}>{(id, h) => <Input id={id} type="tel" value={d.phone} onChange={(v) => setD({ ...d, phone: v })} maxLength={40} describedBy={h} />}</Field>
        <Field label={t("biz.users.email")} optional hint={t("biz.users.emailHint")}>
          {(id, h) => <Input id={id} type="email" value={d.email} onChange={(v) => setD({ ...d, email: v })} maxLength={120} describedBy={h} />}
        </Field>
        <Field label={t("team.lang")}>{(id) => <Select id={id} value={d.lang} onChange={(v) => setD({ ...d, lang: v as StaffLang })} options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))} />}</Field>
        <Field label={t("team.role")} hint={t(`biz.roleHint.${d.role}`)} className="sm:col-span-2">
          {(id, h) => <Select id={id} value={d.role} onChange={(v) => setD({ ...d, role: v as BizRole })} options={BIZ_ROLES.map((r) => ({ value: r, label: t(`biz.role.${r}`), disabled: self && r !== "admin" }))} describedBy={h} />}
        </Field>
        <Field label={user ? t("team.newPin") : t("team.pin")} hint={user ? t("team.newPinHint") : t("team.pinHint")} error={pinBad ? t("team.pinBad") : null}>
          {(id, h) => <Input id={id} inputMode="numeric" value={d.pin} onChange={(v) => setD({ ...d, pin: v.replace(/\D/g, "").slice(0, 8) })} describedBy={h} maxLength={8} className="font-mono" />}
        </Field>
        {!self ? <Switch className="self-end" checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t("team.on")} /> : <div />}
        {err ? <p className="text-[13px] text-[#b42318] sm:col-span-2" role="alert">{err}</p> : null}
        <button type="submit" className="sr-only">
          {t("ui.save")}
        </button>
      </form>
    </Dialog>
  );
}
