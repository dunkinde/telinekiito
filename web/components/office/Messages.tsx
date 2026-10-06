"use client";
// Messages: office alerts, the outbox of customer emails and texts, and contact form messages from the website.
import { useMemo, useState } from "react";
import { deleteLead, getLeads, getOutbox, markAlertsRead, sendOutboxMessage, type Alert, type Messaging, type OutboxMessage } from "@/lib/platform";
import { IconMail, IconPhone } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import { ago, dateTime, telHref } from "./format";
import { alertText, alertTypeLabel, eventLabel } from "./i18n";
import { IBell, IMessages, ISend, ITrash } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Btn, Callout, Card, Chips, Confirm, Empty, Loading, Tabs, cx, type Tone } from "./ui";

const OUT_TONE: Record<OutboxMessage["status"], Tone> = { waiting: "sun", sent: "green", failed: "red", skipped: "gray" };

export function OutboxRow({ m, compact, status, onSent }: { m: OutboxMessage; compact?: boolean; status?: Messaging; onSent?: () => void }) {
  const i = useT();
  const { t, lang } = i;
  const { busy, run } = useAct();
  const [open, setOpen] = useState(false);
  const connected = status ? (m.channel === "email" ? status.email.connected : status.sms.connected) : false;
  const canSend = !!status && connected && (m.status === "waiting" || m.status === "failed");
  const preview = m.channel === "email" ? m.subject : m.body;
  const id = `ob-${m.id}`;
  return (
    <li className={cx("px-5 py-3", compact && "px-5")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cx("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", m.channel === "email" ? "bg-[#ebf2fd] text-[#1f4fa8]" : "bg-[#f3efff] text-[#5b3cc4]")}>
          {m.channel === "email" ? <IconMail className="h-4 w-4" /> : <IconPhone className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-semibold text-ink">{eventLabel(i, m.event)}</span>
            <span className="text-[12px] text-muted">
              {m.channel === "email" ? t("out.email") : t("out.sms")} · {m.audience === "office" ? t("out.toOffice") : m.to}
            </span>
            {!compact && m.ref ? <RefLink refNo={m.ref} className="text-[12px]" /> : null}
          </div>
          <p className={cx("mt-0.5 text-[13.5px] text-ink-soft", !open && "truncate")}>{preview}</p>
          {open ? (
            <pre id={id} className="mt-2 max-h-72 overflow-auto rounded-xl bg-mist px-3.5 py-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
              {m.channel === "email" ? `${t("out.to")}: ${m.to}\n${t("out.subject")}: ${m.subject}\n\n${m.body}` : m.body}
            </pre>
          ) : null}
          {m.error ? <p className="mt-1 text-[12.5px] text-[#b42318]">{m.status === "skipped" ? t("out.skippedWhy") : m.error}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="text-[12.5px] font-semibold text-ink-soft hover:text-ink hover:underline">
              {open ? t("out.hide") : t("out.show")}
            </button>
            {canSend ? (
              <Btn
                size="xs"
                variant="dark"
                icon={<ISend className="h-3.5 w-3.5" />}
                busy={busy === "send"}
                onClick={async () => {
                  const r = await run("send", () => sendOutboxMessage(m.id), undefined);
                  if (r) {
                    onSent?.();
                  }
                }}
              >
                {t("out.sendNow")}
              </Btn>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Badge tone={OUT_TONE[m.status]} dot>
            {t(`out.st.${m.status}`)}
          </Badge>
          <p className="mt-1 text-[12px] text-muted">{ago(m.sentAt || m.createdAt, lang)}</p>
          {m.attempts > 1 ? <p className="text-[11.5px] text-muted">{t("out.attempts", { n: m.attempts })}</p> : null}
        </div>
      </div>
    </li>
  );
}

export function MessagingStatus({ s }: { s: Messaging }) {
  const { t } = useT();
  const off = !s.email.connected || !s.sms.connected;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <span aria-hidden className={cx("grid h-9 w-9 place-items-center rounded-xl", s.email.connected ? "bg-[#e9f7ef] text-[#17663a]" : "bg-sun-soft text-[#7a5a00]")}>
            <IconMail className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              {t("out.emailTitle")}:{" "}
              <span className={s.email.connected ? "text-[#17663a]" : "text-[#7a5a00]"}>{s.email.connected ? t("out.connected") : t("out.notConnected")}</span>
            </p>
            <p className="truncate text-[12.5px] text-muted">{s.email.connected ? `${s.email.from || ""}${s.email.host ? ` · ${s.email.host}` : ""}` : t("out.emailOff")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-line">
          <span aria-hidden className={cx("grid h-9 w-9 place-items-center rounded-xl", s.sms.connected ? "bg-[#e9f7ef] text-[#17663a]" : "bg-sun-soft text-[#7a5a00]")}>
            <IconPhone className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              {t("out.smsTitle")}:{" "}
              <span className={s.sms.connected ? "text-[#17663a]" : "text-[#7a5a00]"}>{s.sms.connected ? t("out.connected") : t("out.notConnected")}</span>
            </p>
            <p className="truncate text-[12.5px] text-muted">{s.sms.connected ? t("out.provider", { p: s.sms.provider || "" }) : t("out.smsOff")}</p>
          </div>
        </div>
      </div>
      {off ? (
        <Callout tone="warn" title={t("out.offTitle")}>
          {t("out.offText")}
        </Callout>
      ) : null}
    </div>
  );
}

function AlertsTab() {
  const i = useT();
  const { t, lang } = i;
  const { alerts, openOrder, refresh, nav } = useOffice();
  const { busy, run } = useAct();
  const [show, setShow] = useState<"unread" | "all">("all");
  const list = (alerts || []).filter((a) => show === "all" || !a.read);
  const unread = (alerts || []).filter((a) => !a.read).length;
  const read = (ids: string[] | "all") => run(ids === "all" ? "all" : ids[0], () => markAlertsRead(ids));
  function open(a: Alert) {
    if (!a.read) read([a.id]);
    if (a.ref) openOrder(a.ref);
    else if (a.type === "contact") nav("messages", { tab: "contact" });
  }
  if (!alerts) return <Loading />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Chips
          label={t("alerts.show")}
          value={show}
          onChange={setShow}
          options={[
            { key: "all", label: t("alerts.all"), count: alerts.length },
            { key: "unread", label: t("alerts.unreadF"), count: unread }
          ]}
        />
        {unread ? (
          <Btn size="sm" variant="light" onClick={() => read("all")} busy={busy === "all"}>
            {t("alerts.markAll")}
          </Btn>
        ) : null}
      </div>
      <Card as="div">
        {list.length ? (
          <ul className="divide-y divide-line">
            {list.map((a) => (
              <li key={a.id} className={cx("flex items-start gap-3 px-5 py-3", !a.read && "bg-sun-soft/25")}>
                <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.read ? "bg-line" : "bg-signal")} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className={cx("text-[13.5px] font-semibold", a.read ? "text-ink-soft" : "text-ink")}>{alertTypeLabel(i, a.type)}</span>
                    <span className="text-[12px] text-muted">{dateTime(a.createdAt, lang)}</span>
                    {!a.read ? <span className="sr-only">{t("alerts.unread")}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[14px] text-ink-soft">{alertText(i, a)}</p>
                  {typeof a.data?.text === "string" && a.type === "customer_message" ? <p className="mt-1 rounded-lg bg-mist px-3 py-1.5 text-[13.5px] text-ink">“{a.data.text}”</p> : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                  {a.ref || a.type === "contact" ? (
                    <Btn size="xs" variant="light" onClick={() => open(a)}>
                      {a.ref ? t("alerts.openOrder") : t("alerts.openContact")}
                    </Btn>
                  ) : null}
                  {!a.read ? (
                    <Btn size="xs" variant="quiet" onClick={() => read([a.id]).then(refresh)} busy={busy === a.id}>
                      {t("alerts.markRead")}
                    </Btn>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<IBell className="h-6 w-6" />} title={show === "unread" ? t("alerts.noneUnread") : t("alerts.none")} />
        )}
      </Card>
    </div>
  );
}

function OutboxTab() {
  const { t } = useT();
  const st = useLoad(getOutbox, [], { poll: true });
  const [f, setF] = useState<"all" | OutboxMessage["status"]>("all");
  const [ch, setCh] = useState<"all" | "email" | "sms">("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of st.data?.messages || []) c[m.status] = (c[m.status] || 0) + 1;
    return c;
  }, [st.data]);
  return (
    <Async state={st}>
      {(d) => {
        const list = d.messages.filter((m) => (f === "all" || m.status === f) && (ch === "all" || m.channel === ch));
        return (
          <div className="space-y-4">
            <MessagingStatus s={d.status} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Chips
                label={t("out.filter")}
                value={f}
                onChange={setF}
                options={[
                  { key: "all", label: t("out.f.all"), count: d.messages.length },
                  { key: "waiting", label: t("out.st.waiting"), count: counts.waiting || 0 },
                  { key: "failed", label: t("out.st.failed"), count: counts.failed || 0 },
                  { key: "sent", label: t("out.st.sent"), count: counts.sent || 0 },
                  { key: "skipped", label: t("out.st.skipped"), count: counts.skipped || 0 }
                ]}
              />
              <Chips
                label={t("out.channel")}
                value={ch}
                onChange={setCh}
                options={[
                  { key: "all", label: t("out.f.allCh") },
                  { key: "email", label: t("out.email") },
                  { key: "sms", label: t("out.sms") }
                ]}
              />
            </div>
            <Card as="div">
              {list.length ? (
                <ul className="divide-y divide-line">
                  {list.map((m) => (
                    <OutboxRow key={m.id} m={m} status={d.status} onSent={() => st.reload()} />
                  ))}
                </ul>
              ) : (
                <Empty icon={<IMessages className="h-6 w-6" />} title={t("out.none")} text={t("out.noneText")} />
              )}
            </Card>
          </div>
        );
      }}
    </Async>
  );
}

export function Messages() {
  const { t } = useT();
  const { route, setParams, alerts } = useOffice();
  const tab = (["alerts", "outbox", "contact"].includes(route.params.tab) ? route.params.tab : "alerts") as "alerts" | "outbox" | "contact";
  return (
    <div>
      <Tabs
        className="mb-4"
        label={t("nav.messages")}
        value={tab}
        onChange={(k) => setParams({ tab: k === "alerts" ? null : k })}
        tabs={[
          { key: "alerts", label: t("msgs.tab.alerts"), count: (alerts || []).filter((a) => !a.read).length },
          { key: "outbox", label: t("msgs.tab.outbox") },
          { key: "contact", label: t("msgs.tab.contact") }
        ]}
      />
      {tab === "alerts" ? <AlertsTab /> : tab === "outbox" ? <OutboxTab /> : <ContactTab />}
    </div>
  );
}

function ContactTab() {
  const { t, lang } = useT();
  const st = useLoad(getLeads, [], { poll: true });
  const { run } = useAct();
  const [del, setDel] = useState<{ id: number; name: string } | null>(null);
  return (
    <>
      <Async state={st}>
        {(d) =>
          d.leads.length ? (
            <ul className="grid gap-3 lg:grid-cols-2">
              {d.leads.map((l) => (
                <li key={l.id}>
                  <Card as="div" className="h-full p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[16px] font-bold text-ink">{l.name}</p>
                        <p className="text-[12.5px] text-muted">
                          {dateTime(l.createdAt, lang)} · {l.lang === "en" ? "English" : "Suomi"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDel({ id: l.id, name: l.name })}
                        aria-label={t("leads.delete", { name: l.name })}
                        title={t("leads.deleteShort")}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-[#fff0ef] hover:text-[#b42318]"
                      >
                        <ITrash className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                    <p className="mt-3 text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{l.message}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Btn size="sm" variant="dark" href={`mailto:${l.email}?subject=${encodeURIComponent(t("leads.replySubject"))}`} icon={<IconMail className="h-4 w-4" />} className="max-w-full">
                        <span className="truncate">{l.email}</span>
                      </Btn>
                      {l.phone ? (
                        <Btn size="sm" variant="light" href={telHref(l.phone)} icon={<IconPhone className="h-4 w-4" />}>
                          {l.phone}
                        </Btn>
                      ) : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card as="div">
              <Empty icon={<IconMail className="h-6 w-6" />} title={t("leads.none")} text={t("leads.noneText")} />
            </Card>
          )
        }
      </Async>
      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        danger
        title={t("leads.deleteTitle")}
        confirmLabel={t("leads.deleteShort")}
        text={<p>{t("leads.deleteText", { name: del?.name || "" })}</p>}
        onConfirm={async () => {
          if (!del) return;
          const r = await run("del", () => deleteLead(del.id), t("leads.deleted"));
          if (r) st.reload();
          return !!r;
        }}
      />
    </>
  );
}
