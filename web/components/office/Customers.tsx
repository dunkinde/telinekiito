"use client";
// Business customers (partner accounts): discount, payment terms and the partner code for the website quote.
import { useState } from "react";
import { officeAccountUsers, officeRemoveAccountUser, officeSaveAccountUser, type BizUser } from "@/lib/business";
import { UserDialog, UserList } from "../business/Users";
import { approveAccount, getAccounts, rejectAccount, removeAccount, saveAccount, type Account } from "@/lib/platform";
import { IconMail, IconPhone, IconPlus } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { dateTime, day, money, telHref } from "./format";
import { statusLabel } from "./i18n";
import { ICopy, ICustomers, IEdit, IExternal, ITrash } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Callout, Card, Confirm, Dialog, Empty, Field, IconBtn, Input, NumInput, Switch, TextArea, Toolbar, cx, useCopy } from "./ui";

type Draft = { name: string; businessId: string; contactName: string; email: string; phone: string; code: string; discountPct: number | null; paymentDays: number | null; notes: string; active: boolean; billingAddress: string; einvoiceAddress: string; einvoiceOperator: string; reverseCharge: boolean };
const blank: Draft = { name: "", businessId: "", contactName: "", email: "", phone: "", code: "", discountPct: 0, paymentDays: 14, notes: "", active: true, billingAddress: "", einvoiceAddress: "", einvoiceOperator: "", reverseCharge: false };

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
              active: account.active,
              billingAddress: account.billingAddress || "",
              einvoiceAddress: account.einvoiceAddress || "",
              einvoiceOperator: account.einvoiceOperator || "",
              reverseCharge: Boolean(account.reverseCharge)
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
      active: d.active,
      billingAddress: d.billingAddress.trim(),
      einvoiceAddress: d.einvoiceAddress.trim(),
      einvoiceOperator: d.einvoiceOperator.trim(),
      reverseCharge: d.reverseCharge
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
        <Field label={t("acc.billing")} optional className="sm:col-span-2">
          {(id) => <Input id={id} value={d.billingAddress} onChange={(v) => up({ billingAddress: v })} maxLength={120} autoComplete="street-address" />}
        </Field>
        <Field label={t("acc.einvoice")} optional hint={t("acc.einvoiceHint")}>
          {(id, h) => <Input id={id} value={d.einvoiceAddress} onChange={(v) => up({ einvoiceAddress: v })} maxLength={40} describedBy={h} className="font-mono" />}
        </Field>
        <Field label={t("acc.operator")} optional hint={t("acc.operatorHint")}>
          {(id, h) => <Input id={id} value={d.einvoiceOperator} onChange={(v) => up({ einvoiceOperator: v })} maxLength={40} describedBy={h} className="font-mono" />}
        </Field>
        <Field label={t("acc.notes")} optional className="sm:col-span-2">
          {(id) => <TextArea id={id} rows={3} value={d.notes} onChange={(v) => up({ notes: v })} maxLength={1000} />}
        </Field>
        <Switch className="sm:col-span-2" checked={d.reverseCharge} onChange={(v) => up({ reverseCharge: v })} label={t("acc.rc")} hint={t("acc.rcHint")} />
        <Switch className="sm:col-span-2" checked={d.active} onChange={(v) => up({ active: v })} label={t("acc.active")} hint={t("acc.activeHint")} />
        <button type="submit" className="sr-only">
          {t("ui.save")}
        </button>
      </form>
    </Dialog>
  );
}

function AccountCard({ a, onEdit, onDelete, onUsers }: { a: Account; onEdit: () => void; onDelete: () => void; onUsers: () => void }) {
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
        {a.einvoiceAddress ? <Badge tone="green">{t("acc.einvoiceOn")}</Badge> : null}
        {a.reverseCharge ? <Badge tone="blue">{t("acc.rcOn")}</Badge> : null}
      </div>
      <div className="mt-3 px-5">
        <Btn size="xs" variant="light" onClick={onUsers}>
          {t("acc.portal", { n: a.portalUsers ?? 0 })}
        </Btn>
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

/** The account's people in the business portal (/business). */
function PortalUsersDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t } = useT();
  const { run } = useAct();
  const st = useLoad(() => (account ? officeAccountUsers(account.id) : Promise.resolve({ users: [] as BizUser[] })), [account?.id]);
  const [edit, setEdit] = useState<BizUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<BizUser | null>(null);
  if (!account) return null;
  return (
    <>
      <Dialog
        open={!!account && !adding && !edit && !del}
        onClose={onClose}
        title={t("acc.portalTitle", { name: account.name })}
        footer={
          <>
            <Btn variant="quiet" onClick={onClose}>
              {t("ui.close")}
            </Btn>
            <Btn variant="primary" icon={<IconPlus className="h-4 w-4" />} onClick={() => setAdding(true)}>
              {t("biz.users.add")}
            </Btn>
          </>
        }
      >
        <p className="mb-4 text-[13.5px] text-ink-soft">{t("acc.portalHow")}</p>
        <Async state={st}>{(d) => (d.users.length ? <UserList users={d.users} onEdit={setEdit} onDelete={setDel} /> : <p className="text-[14px] text-muted">{t("acc.portalNone")}</p>)}</Async>
      </Dialog>
      <UserDialog
        open={adding || !!edit}
        user={edit}
        onClose={() => (setAdding(false), setEdit(null))}
        save={(body, id) => officeSaveAccountUser(account.id, body, id)}
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
          const r = await run("del", () => officeRemoveAccountUser(account.id, del.id), t("team.removed"));
          if (r) st.reload();
          return !!r;
        }}
      />
    </>
  );
}

/* ---------------- Registration requests ---------------- */
// A company registered itself on the portal. The office calls the contact person, checks the business ID and then
// opens the account with the discount and payment terms agreed on the phone (or rejects it).
function RequestCard({ a, onApprove, onReject }: { a: Account; onApprove: () => void; onReject: () => void }) {
  const { t, lang } = useT();
  return (
    <Card as="article" className="flex h-full flex-col ring-2 ring-sun" aria-label={a.name}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="font-display text-[17px] font-bold text-ink">{a.name}</h3>
          <p className="text-[12.5px] text-muted">
            {t("acc.businessIdShort")} {a.businessId}
            {a.registration?.at ? ` · ${t("acc.req.at", { date: dateTime(a.registration.at, lang) })}` : null}
          </p>
        </div>
        <Badge tone="sun">{t("acc.pending")}</Badge>
      </div>
      <ul className="mt-3 space-y-1 px-5 text-[13.5px]">
        <li className="font-medium text-ink">{a.contactName}</li>
        {a.phone ? (
          <li>
            <a href={telHref(a.phone)} className="inline-flex items-center gap-2 text-ink-soft hover:text-ink hover:underline">
              <IconPhone className="h-4 w-4 text-muted" />
              {a.phone}
            </a>
          </li>
        ) : null}
        {a.email ? (
          <li>
            <a href={`mailto:${a.email}`} className="inline-flex items-center gap-2 text-ink-soft hover:text-ink hover:underline">
              <IconMail className="h-4 w-4 text-muted" />
              {a.email}
            </a>
          </li>
        ) : null}
        {a.billingAddress ? <li className="text-ink-soft">{t("acc.billing")}: {a.billingAddress}</li> : null}
        {a.einvoiceAddress ? <li className="text-ink-soft">{t("acc.einvoice")}: <span className="font-mono">{a.einvoiceAddress}</span></li> : null}
      </ul>
      {a.registration?.message ? <p className="mx-5 mt-3 rounded-xl bg-mist px-3 py-2 text-[13px] whitespace-pre-line text-ink-soft">“{a.registration.message}”</p> : null}
      {a.conflicts && (a.conflicts.customer || a.conflicts.otherRequests || a.conflicts.phoneTaken) ? (
        <div className="mx-5 mt-3">
          <Callout tone="warn">
            <ul className="space-y-0.5">
              {a.conflicts.customer ? <li>{t("acc.req.isCustomer", { name: a.conflicts.customer })}</li> : null}
              {a.conflicts.otherRequests ? <li>{t("acc.req.otherRequests", { n: a.conflicts.otherRequests })}</li> : null}
              {a.conflicts.phoneTaken ? <li>{t("acc.req.phoneTaken", { name: a.conflicts.phoneTaken })}</li> : null}
            </ul>
          </Callout>
        </div>
      ) : null}
      <div className="mt-auto pt-4">
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
        {a.phone ? (
          <Btn size="sm" variant="dark" href={telHref(a.phone)} icon={<IconPhone className="h-4 w-4" />}>
            {t("acc.req.call")}
          </Btn>
        ) : null}
        <Btn size="sm" variant="light" href={`https://tietopalvelu.ytj.fi/yritys/${encodeURIComponent(a.businessId || "")}`} newTab icon={<IExternal className="h-4 w-4" />}>
          {t("acc.req.ytj")}
        </Btn>
        <span className="ml-auto flex gap-2">
          <Btn size="sm" variant="quiet" onClick={onReject}>
            {t("acc.req.reject")}
          </Btn>
          <Btn size="sm" variant="primary" onClick={onApprove}>
            {t("acc.req.approve")}
          </Btn>
        </span>
      </div>
      </div>
    </Card>
  );
}

function ApproveDialog({ account, onClose, onDone }: { account: Account | null; onClose: () => void; onDone: () => void }) {
  const { t, lang } = useT();
  const { busy, run } = useAct();
  const [discount, setDiscount] = useState<number | null>(0);
  const [days, setDays] = useState<number | null>(14);
  const [seen, setSeen] = useState<string | null>(null);
  if ((account?.id || null) !== seen) {
    setSeen(account?.id || null);
    setDiscount(0);
    setDays(14);
  }
  const bad = discount != null && (discount < 0 || discount > 50);
  async function approve() {
    if (!account || bad) return;
    const r = await run("approve", () => approveAccount(account.id, { discountPct: discount ?? 0, paymentDays: days ?? 14 }), t("acc.req.approved"));
    if (r) {
      onDone();
      onClose();
    }
  }
  return (
    <Dialog
      open={!!account}
      onClose={onClose}
      title={t("acc.req.approveTitle", { name: account?.name || "" })}
      footer={
        <>
          <Btn variant="quiet" onClick={onClose}>
            {t("ui.cancel")}
          </Btn>
          <Btn variant="dark" onClick={approve} busy={busy === "approve"} disabled={bad}>
            {t("acc.req.approveBtn")}
          </Btn>
        </>
      }
    >
      <p className="mb-4 text-[13.5px] text-ink-soft">{t("acc.req.approveText")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("acc.discount")} hint={t("acc.discountHint")} error={bad ? t("acc.discountBad") : null}>
          {(id, h) => <NumInput id={id} lang={lang} value={discount} onChange={setDiscount} suffix="%" describedBy={h} />}
        </Field>
        <Field label={t("acc.payDays")} hint={t("acc.payDaysHint")}>
          {(id, h) => <NumInput id={id} lang={lang} value={days} onChange={setDays} suffix={t("ui.daysUnit")} describedBy={h} />}
        </Field>
      </div>
    </Dialog>
  );
}

export function Customers() {
  const { t } = useT();
  const st = useLoad(getAccounts, [], { poll: true });
  const { run } = useAct();
  const [edit, setEdit] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Account | null>(null);
  const [portal, setPortal] = useState<Account | null>(null);
  const [approve, setApprove] = useState<Account | null>(null);
  const [reject, setReject] = useState<Account | null>(null);
  const { refresh } = useOffice();
  const requests = (st.data?.accounts || []).filter((a) => a.pending);
  // The nav badge counts registration alerts; deciding removes the alert, so refresh it with the list.
  const reload = () => (st.reload(), refresh());
  return (
    <div>
      {requests.length ? (
        <section aria-labelledby="acc-req" className="mb-8">
          <h2 id="acc-req" className="flex items-center gap-2 font-display text-[19px] font-bold text-ink">
            {t("acc.req.title")}
            <Badge tone="sun">{requests.length}</Badge>
          </h2>
          <p className="mt-1 mb-4 max-w-3xl text-[13.5px] text-ink-soft">{t("acc.req.how")}</p>
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {requests.map((a) => (
              <li key={a.id}>
                <RequestCard a={a} onApprove={() => setApprove(a)} onReject={() => setReject(a)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
          d.accounts.some((a) => !a.pending) ? (
            <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {d.accounts.filter((a) => !a.pending).map((a) => (
                <li key={a.id}>
                  <AccountCard a={a} onEdit={() => setEdit(a)} onDelete={() => setDel(a)} onUsers={() => setPortal(a)} />
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
      <ApproveDialog account={approve} onClose={() => setApprove(null)} onDone={reload} />
      <Confirm
        open={!!reject}
        onClose={() => setReject(null)}
        danger
        title={t("acc.req.rejectTitle", { name: reject?.name || "" })}
        confirmLabel={t("acc.req.reject")}
        text={<p>{t("acc.req.rejectText")}</p>}
        onConfirm={async () => {
          if (!reject) return;
          const r = await run("reject", () => rejectAccount(reject.id), t("acc.req.rejected"));
          if (r) reload();
          return !!r;
        }}
      />
      <PortalUsersDialog account={portal} onClose={() => (setPortal(null), st.reload())} />
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
