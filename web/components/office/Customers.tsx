"use client";
// Business customers (partner accounts): discount, payment terms and the partner code for the website quote.
import { useState } from "react";
import { getAccounts, removeAccount, saveAccount, type Account } from "@/lib/platform";
import { IconMail, IconPhone, IconPlus } from "../ui/Icons";
import { useAct, useLoad, useT } from "./context";
import { day, money, telHref } from "./format";
import { statusLabel } from "./i18n";
import { ICopy, ICustomers, IEdit, ITrash } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Callout, Card, Confirm, Dialog, Empty, Field, IconBtn, Input, NumInput, Switch, TextArea, Toolbar, cx, useCopy } from "./ui";

type Draft = { name: string; businessId: string; contactName: string; email: string; phone: string; code: string; discountPct: number | null; paymentDays: number | null; notes: string; active: boolean };
const blank: Draft = { name: "", businessId: "", contactName: "", email: "", phone: "", code: "", discountPct: 0, paymentDays: 14, notes: "", active: true };

function AccountDialog({ open, onClose, account, onSaved }: { open: boolean; onClose: () => void; account: Account | null; onSaved: () => void }) {
  const { t, lang } = useT();
  const { busy, run } = useAct();
  const [d, setD] = useState<Draft>(blank);
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? account?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open)
      setD(
        account
          ? {
              name: account.name,
              businessId: account.businessId || "",
              contactName: account.contactName || "",
              email: account.email || "",
              phone: account.phone || "",
              code: account.code,
              discountPct: account.discountPct,
              paymentDays: account.paymentDays,
              notes: account.notes || "",
              active: account.active
            }
          : blank
      );
  }
  const up = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const badDiscount = d.discountPct != null && (d.discountPct < 0 || d.discountPct > 50);
  async function save() {
    if (!d.name.trim() || badDiscount) return;
    const body: Partial<Account> = {
      name: d.name.trim(),
      businessId: d.businessId.trim(),
      contactName: d.contactName.trim(),
      email: d.email.trim(),
      phone: d.phone.trim(),
      code: d.code.trim(),
      discountPct: d.discountPct ?? 0,
      paymentDays: d.paymentDays ?? 14,
      notes: d.notes,
      active: d.active
    };
    const r = await run("save", () => saveAccount(body, account?.id), account ? t("acc.saved") : t("acc.created"));
    if (r) {
      onSaved();
      onClose();
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={account ? t("acc.edit", { name: account.name }) : t("acc.new")}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={save} busy={busy === "save"} disabled={!d.name.trim() || badDiscount}>
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
        <Field label={t("acc.name")} className="sm:col-span-2">
          {(id) => <Input id={id} value={d.name} onChange={(v) => up({ name: v })} maxLength={120} required autoComplete="organization" />}
        </Field>
        <Field label={t("acc.businessId")} optional>
          {(id) => <Input id={id} value={d.businessId} onChange={(v) => up({ businessId: v })} maxLength={20} placeholder="1234567-8" />}
        </Field>
        <Field label={t("acc.contact")} optional>
          {(id) => <Input id={id} value={d.contactName} onChange={(v) => up({ contactName: v })} maxLength={120} />}
        </Field>
        <Field label={t("acc.email")} optional>
          {(id) => <Input id={id} type="email" value={d.email} onChange={(v) => up({ email: v })} maxLength={120} autoComplete="email" />}
        </Field>
        <Field label={t("acc.phone")} optional>
          {(id) => <Input id={id} type="tel" value={d.phone} onChange={(v) => up({ phone: v })} maxLength={40} />}
        </Field>
        <Field label={t("acc.code")} hint={t("acc.codeHint")}>
          {(id, h) => <Input id={id} value={d.code} onChange={(v) => up({ code: v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) })} describedBy={h} className="font-mono uppercase" placeholder={t("acc.codePh")} />}
        </Field>
        <Field label={t("acc.discount")} hint={t("acc.discountHint")} error={badDiscount ? t("acc.discountBad") : null}>
          {(id, h) => <NumInput id={id} lang={lang} value={d.discountPct} onChange={(v) => up({ discountPct: v })} suffix="%" describedBy={h} />}
        </Field>
        <Field label={t("acc.payDays")} hint={t("acc.payDaysHint")}>
          {(id, h) => <NumInput id={id} lang={lang} value={d.paymentDays} onChange={(v) => up({ paymentDays: v })} suffix={t("ui.daysUnit")} describedBy={h} />}
        </Field>
        <Field label={t("acc.notes")} optional className="sm:col-span-2">
          {(id) => <TextArea id={id} rows={3} value={d.notes} onChange={(v) => up({ notes: v })} maxLength={1000} />}
        </Field>
        <Switch className="sm:col-span-2" checked={d.active} onChange={(v) => up({ active: v })} label={t("acc.active")} hint={t("acc.activeHint")} />
        <button type="submit" className="sr-only">
          {t("ui.save")}
        </button>
      </form>
    </Dialog>
  );
}

function AccountCard({ a, onEdit, onDelete }: { a: Account; onEdit: () => void; onDelete: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { copied, copy } = useCopy();
  const [showOrders, setShowOrders] = useState(false);
  const orders = a.orders || [];
  const total = orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + o.total, 0);
  return (
    <Card as="article" className={cx("flex h-full flex-col", !a.active && "opacity-80")} aria-label={a.name}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-bold text-ink">{a.name}</h2>
          <p className="text-[12.5px] text-muted">
            {a.businessId ? `${t("acc.businessIdShort")} ${a.businessId}` : t("acc.noBusinessId")}
            {!a.active ? (
              <>
                {" · "}
                <Badge tone="gray">{t("acc.inactive")}</Badge>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconBtn label={t("acc.editShort", { name: a.name })} tone="quiet" onClick={onEdit}>
            <IEdit className="h-[18px] w-[18px]" />
          </IconBtn>
          <IconBtn label={t("acc.deleteShort", { name: a.name })} tone="quiet" onClick={onDelete}>
            <ITrash className="h-[18px] w-[18px]" />
          </IconBtn>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 px-5">
        <span className="inline-flex items-center gap-1 rounded-xl bg-ink py-1 pr-1 pl-3 text-white">
          <span className="sr-only">{t("acc.code")}: </span>
          <span className="font-mono text-[15px] font-bold tracking-wider">{a.code}</span>
          <button type="button" onClick={() => copy(a.code)} aria-label={t("acc.copy", { code: a.code })} className="grid h-7 w-7 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white">
            <ICopy className="h-4 w-4" />
          </button>
        </span>
        <span aria-live="polite" className="text-[12.5px] font-medium text-[#17663a]">
          {copied === a.code ? t("acc.copied") : ""}
        </span>
        <Badge tone="sun">{t("acc.discountV", { pct: a.discountPct })}</Badge>
        <Badge tone="neutral">{t("acc.payDaysV", { n: a.paymentDays })}</Badge>
      </div>
      <ul className="mt-3 space-y-1 px-5 text-[13.5px]">
        {a.contactName ? <li className="font-medium text-ink">{a.contactName}</li> : null}
        {a.email ? (
          <li>
            <a href={`mailto:${a.email}`} className="inline-flex items-center gap-2 text-ink-soft hover:text-ink hover:underline">
              <IconMail className="h-4 w-4 text-muted" />
              {a.email}
            </a>
          </li>
        ) : null}
        {a.phone ? (
          <li>
            <a href={telHref(a.phone)} className="inline-flex items-center gap-2 text-ink-soft hover:text-ink hover:underline">
              <IconPhone className="h-4 w-4 text-muted" />
              {a.phone}
            </a>
          </li>
        ) : null}
      </ul>
      {a.notes ? <p className="mx-5 mt-3 rounded-xl bg-mist px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">{a.notes}</p> : null}
      <div className="mt-auto border-t border-line px-5 py-3">
        <button type="button" aria-expanded={showOrders} onClick={() => setShowOrders(!showOrders)} disabled={!orders.length} className="flex w-full items-center justify-between text-left text-[13.5px] font-semibold text-ink disabled:text-muted">
          <span>{orders.length ? t("acc.orders", { n: orders.length, total: money(total, lang, 0) }) : t("acc.noOrders")}</span>
          {orders.length ? <span className="text-muted">{showOrders ? "−" : "+"}</span> : null}
        </button>
        {showOrders ? (
          <ul className="mt-2 space-y-1.5">
            {orders.map((o) => (
              <li key={o.ref} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px]">
                <RefLink refNo={o.ref} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{o.address}</span>
                <span className="text-muted">{statusLabel(i, o.status)}</span>
                <span className="font-semibold tabular-nums">{money(o.total, lang)}</span>
                <span className="w-full text-[12px] text-muted">{day(o.createdAt.slice(0, 10), lang, { year: true })}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}

export function Customers() {
  const { t } = useT();
  const st = useLoad(getAccounts, [], { poll: true });
  const { run } = useAct();
  const [edit, setEdit] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Account | null>(null);
  return (
    <div>
      <Callout tone="info" className="mb-4" title={t("acc.howTitle")}>
        {t("acc.how")}
      </Callout>
      <Toolbar className="justify-end">
        <Btn variant="primary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          {t("acc.new")}
        </Btn>
      </Toolbar>
      <Async state={st}>
        {(d) =>
          d.accounts.length ? (
            <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {d.accounts.map((a) => (
                <li key={a.id}>
                  <AccountCard a={a} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} />
                </li>
              ))}
            </ul>
          ) : (
            <Card as="div">
              <Empty icon={<ICustomers className="h-6 w-6" />} title={t("acc.none")} text={t("acc.noneText")} action={<Btn variant="primary" size="sm" onClick={() => setCreating(true)}>{t("acc.new")}</Btn>} />
            </Card>
          )
        }
      </Async>
      <AccountDialog open={creating || !!edit} account={edit} onClose={() => (setCreating(false), setEdit(null))} onSaved={() => st.reload()} />
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        danger
        title={t("acc.deleteTitle", { name: del?.name || "" })}
        confirmLabel={t("acc.deleteBtn")}
        text={<p>{t("acc.deleteText")}</p>}
        onConfirm={async () => {
          if (!del) return;
          const r = await run("del", () => removeAccount(del.id), t("acc.deleted"));
          if (r) st.reload();
          return !!r;
        }}
      />
    </div>
  );
}
