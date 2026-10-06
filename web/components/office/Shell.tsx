"use client";
// Office frame: sidebar navigation (a menu on phones), the header with alerts and the user menu, and the order panel.
import { useEffect, useMemo, useState } from "react";
import { markAlertsRead, type Alert } from "@/lib/platform";
import { Logo, LogoMark } from "../Logo";
import { OWNER_ONLY, useOffice, useT, type Section } from "./context";
import { ago, initials } from "./format";
import { alertText, alertTypeLabel, roleLabel } from "./i18n";
import {
  IApprove,
  IBell,
  ICalendar,
  ICustomers,
  IExternal,
  IHelmet,
  IInvoice,
  ILogout,
  IMap,
  IMenu,
  IMessages,
  IOrders,
  IOverview,
  IReports,
  ISettings,
  IStar,
  IStock,
  ITeam
} from "./icons";
import { IconClose } from "../ui/Icons";
import { LangSwitch } from "./Login";
import { Count, IconBtn, cx, usePopover } from "./ui";
import { OrderDrawer } from "./OrderDetail";
import { Overview } from "./Overview";
import { Orders } from "./Orders";
import { CalendarView } from "./Calendar";
import { MapView } from "./MapView";
import { Approvals } from "./Approvals";
import { Messages } from "./Messages";
import { Stock } from "./Stock";
import { Team } from "./Team";
import { Invoices } from "./Invoices";
import { Customers } from "./Customers";
import { Reviews } from "./Reviews";
import { Reports } from "./Reports";
import { Settings } from "./Settings";

const ICONS: Record<Section, (p: { className?: string }) => React.ReactNode> = {
  overview: IOverview,
  orders: IOrders,
  calendar: ICalendar,
  map: IMap,
  approvals: IApprove,
  messages: IMessages,
  stock: IStock,
  team: ITeam,
  invoices: IInvoice,
  customers: ICustomers,
  reviews: (p) => <IStar {...p} />,
  reports: IReports,
  settings: ISettings
};
const GROUPS: { key: "daily" | "resources" | "money"; items: Section[] }[] = [
  { key: "daily", items: ["overview", "orders", "calendar", "map", "approvals", "messages"] },
  { key: "resources", items: ["stock", "team"] },
  { key: "money", items: ["invoices", "customers", "reviews", "reports", "settings"] }
];

function useBadges() {
  const { orders, pending, alerts } = useOffice();
  return useMemo(() => {
    const real = (orders || []).filter((o) => !o.example);
    const received = real.filter((o) => o.status === "received").length;
    const unplanned = real.filter((o) => {
      const a = o.assignment || {};
      if (o.status === "received" || o.status === "confirmed") return !(a.date && a.crewId);
      if (o.status === "pickup_requested") return !a.pickupDate;
      return false;
    }).length;
    const unread = (alerts || []).filter((a) => !a.read).length;
    const b: Partial<Record<Section, number>> = { orders: received, calendar: unplanned, approvals: (pending || []).length, messages: unread };
    return b;
  }, [orders, pending, alerts]);
}

function NavList({ onPick }: { onPick?: () => void }) {
  const { t, tk } = useT();
  const { owner, route, nav } = useOffice();
  const badges = useBadges();
  return (
    <nav aria-label={t("nav.label")} className="flex flex-col gap-5">
      {GROUPS.map((g) => {
        const items = g.items.filter((s) => owner || !OWNER_ONLY.includes(s));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-white/40 uppercase">{t(`nav.group.${g.key}`)}</p>
            <ul className="space-y-0.5">
              {items.map((s) => {
                const Icon = ICONS[s];
                const on = route.section === s;
                const n = badges[s] || 0;
                return (
                  <li key={s}>
                    <a
                      href={`#/${s}`}
                      aria-current={on ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        nav(s);
                        onPick?.();
                      }}
                      className={cx(
                        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors focus-visible:outline-sun",
                        on ? "bg-white/[0.09] text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      {on ? <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-sun" /> : null}
                      <Icon className={cx("h-[19px] w-[19px] shrink-0", on ? "text-sun" : "text-white/60 group-hover:text-white/90")} />
                      <span className="flex-1 truncate">{t(`nav.${s}`)}</span>
                      {n ? <Count n={n} tone={s === "approvals" || s === "messages" ? "sun" : "dim"} label={tk(`nav.badge.${s}`)} /> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SideLinks() {
  const { t } = useT();
  return (
    <div className="space-y-0.5 border-t border-white/10 pt-3">
      <div className="flex h-10 items-center justify-between gap-2 px-3 lg:hidden">
        <span className="text-[13.5px] font-medium text-white/65">{t("ui.language")}</span>
        <LangSwitch dark />
      </div>
      <a href="/crew" target="_blank" rel="noopener" className="flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/65 hover:bg-white/[0.05] hover:text-white focus-visible:outline-sun">
        <IHelmet className="h-[18px] w-[18px]" />
        <span className="flex-1">{t("top.crewApp")}</span>
        <IExternal className="h-3.5 w-3.5 opacity-60" />
        <span className="sr-only">{t("ui.newTab")}</span>
      </a>
      <a href="/" target="_blank" rel="noopener" className="flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/65 hover:bg-white/[0.05] hover:text-white focus-visible:outline-sun">
        <IGlobeSmall />
        <span className="flex-1">{t("top.website")}</span>
        <IExternal className="h-3.5 w-3.5 opacity-60" />
        <span className="sr-only">{t("ui.newTab")}</span>
      </a>
    </div>
  );
}
const IGlobeSmall = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" />
  </svg>
);

/* ---------------- Alerts bell ---------------- */
function Bell() {
  const i = useT();
  const { t, lang } = i;
  const { alerts, openOrder, nav, refresh, fail } = useOffice();
  const pop = usePopover();
  const list = alerts || [];
  const unread = list.filter((a) => !a.read).length;
  async function read(ids: string[] | "all") {
    try {
      await markAlertsRead(ids);
      refresh();
    } catch (e) {
      fail(e);
    }
  }
  function openAlert(a: Alert) {
    pop.setOpen(false);
    if (!a.read) read([a.id]);
    if (a.ref) openOrder(a.ref);
    else if (a.type === "contact") nav("messages", { tab: "contact" });
    else nav("messages");
  }
  return (
    <div ref={pop.ref} className="relative">
      <IconBtn label={unread ? t("top.alertsUnread", { n: unread }) : t("top.alerts")} tone="quiet" aria-expanded={pop.open} aria-haspopup="dialog" onClick={() => pop.setOpen(!pop.open)} className="h-10 w-10">
        <IBell className="h-[21px] w-[21px]" />
        {unread ? (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10.5px] leading-none font-bold text-white ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </IconBtn>
      {pop.open ? (
        <div role="dialog" aria-label={t("top.alerts")} className="absolute top-12 right-0 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-2xl bg-white shadow-[0_20px_50px_-12px_rgba(14,18,23,0.35)] ring-1 ring-line">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="font-display text-[15px] font-bold text-ink">{t("top.alerts")}</p>
            {unread ? (
              <button type="button" onClick={() => read("all")} className="text-[13px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                {t("alerts.markAll")}
              </button>
            ) : null}
          </div>
          {list.length ? (
            <ul className="max-h-[min(420px,60vh)] divide-y divide-line overflow-y-auto">
              {list.slice(0, 10).map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => openAlert(a)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-mist/70">
                    <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.read ? "bg-transparent" : "bg-signal")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cx("text-[13px] font-semibold", a.read ? "text-muted" : "text-ink")}>{alertTypeLabel(i, a.type)}</span>
                        <span className="shrink-0 text-[12px] text-muted">{ago(a.createdAt, lang)}</span>
                      </span>
                      <span className={cx("mt-0.5 block text-[13.5px] leading-snug", a.read ? "text-muted" : "text-ink-soft")}>{alertText(i, a)}</span>
                      {!a.read ? <span className="sr-only">{t("alerts.unread")}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted">{t("alerts.none")}</p>
          )}
          <div className="border-t border-line px-4 py-2.5">
            <button
              type="button"
              onClick={() => {
                pop.setOpen(false);
                nav("messages");
              }}
              className="text-[13px] font-semibold text-ink hover:underline"
            >
              {t("top.allMessages")} →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- User menu ---------------- */
function UserMenu() {
  const i = useT();
  const { t } = i;
  const { user, logout } = useOffice();
  const pop = usePopover();
  const name = user.master ? t("user.masterName") : user.name;
  return (
    <div ref={pop.ref} className="relative">
      <button
        type="button"
        aria-expanded={pop.open}
        aria-haspopup="menu"
        onClick={() => pop.setOpen(!pop.open)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 hover:bg-ink/[0.05] sm:pr-3"
      >
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[12px] font-bold text-white">
          {initials(name)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[140px] truncate text-[13.5px] font-semibold text-ink">{name}</span>
          <span className="block text-[11.5px] text-muted">{roleLabel(i, user.role)}</span>
        </span>
        <span className="sr-only sm:hidden">{t("user.menu")}</span>
      </button>
      {pop.open ? (
        <div role="menu" aria-label={t("user.menu")} className="absolute top-12 right-0 z-50 w-64 overflow-hidden rounded-2xl bg-white p-2 shadow-[0_20px_50px_-12px_rgba(14,18,23,0.35)] ring-1 ring-line">
          <div className="px-3 py-2">
            <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
            <p className="text-[12.5px] text-muted">
              {roleLabel(i, user.role)}
              {user.phone ? ` · ${user.phone}` : ""}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
            <span className="text-[13px] font-medium text-ink-soft">{t("ui.language")}</span>
            <LangSwitch />
          </div>
          <div className="border-t border-line pt-1.5 lg:hidden">
            <a role="menuitem" href="/crew" target="_blank" rel="noopener" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium text-ink hover:bg-mist">
              <IHelmet className="h-[18px] w-[18px]" />
              {t("top.crewApp")}
            </a>
            <a role="menuitem" href="/" target="_blank" rel="noopener" className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium text-ink hover:bg-mist">
              <IExternal className="h-[18px] w-[18px]" />
              {t("top.website")}
            </a>
          </div>
          <div className="border-t border-line pt-1.5">
            <button role="menuitem" type="button" onClick={logout} className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[14px] font-semibold text-ink hover:bg-mist">
              <ILogout className="h-[18px] w-[18px]" />
              {t("user.logout")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Frame ---------------- */
export function Shell() {
  const { t } = useT();
  const { route, owner, me } = useOffice();
  const [menu, setMenu] = useState(false);
  const section = route.section;

  useEffect(() => {
    document.title = `${t(`nav.${section}`)} · ${me.company || "TelineKiito"} – ${t("app.office")}`;
  }, [section, t, me.company]);

  // Phone menu: Esc closes it, the page behind doesn't scroll.
  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const title = t(`nav.${section}`);
  const sub = t(`sub.${section}`);
  const fullBleed = section === "map";

  return (
    <div className="min-h-screen bg-mist lg:pl-[244px]">
      <a href="#main" className="sr-only z-[100] rounded-full bg-sun px-4 py-2 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        {t("ui.skip")}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[244px] flex-col bg-ink lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <a href="#/overview" aria-label={t("nav.home")} className="rounded-lg focus-visible:outline-sun">
            <Logo dark className="scale-[0.92] origin-left" />
          </a>
        </div>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto px-3 pt-2 pb-4">
          <NavList />
          <SideLinks />
        </div>
      </aside>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5 lg:h-16 lg:px-8">
          <IconBtn label={t("nav.open")} tone="quiet" className="h-10 w-10 lg:hidden" onClick={() => setMenu(true)} aria-expanded={menu} aria-controls="office-menu">
            <IMenu className="h-[22px] w-[22px]" />
          </IconBtn>
          <a href="#/overview" className="flex items-center gap-2 lg:hidden" aria-label={t("nav.home")}>
            <LogoMark className="h-8 w-8" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[19px] leading-tight font-bold text-ink lg:text-[22px]">{title}</h1>
            <p className="hidden truncate text-[12.5px] text-muted lg:block">{sub}</p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {!owner ? <span className="mr-1 hidden rounded-full bg-mist px-2.5 py-1 text-[12px] font-semibold text-ink-soft ring-1 ring-line xl:inline">{t("top.leaderView")}</span> : null}
            <LangSwitch className="hidden sm:inline-flex" />
            <Bell />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Phone / tablet menu */}
      {menu ? (
        <div id="office-menu" className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.label")}>
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMenu(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col bg-ink shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Logo dark className="scale-90 origin-left" />
              <IconBtn label={t("nav.close")} tone="dark" onClick={() => setMenu(false)} className="h-10 w-10">
                <IconClose />
              </IconBtn>
            </div>
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-y-auto px-3 pt-2 pb-5">
              <NavList onPick={() => setMenu(false)} />
              <SideLinks />
            </div>
          </div>
        </div>
      ) : null}

      <main id="main" tabIndex={-1} className={cx("outline-none", fullBleed ? "p-0" : "px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-6")}>
        <div className={fullBleed ? "" : "mx-auto max-w-[1600px]"}>
          <SectionView section={section} />
        </div>
      </main>

      <OrderDrawer />
    </div>
  );
}

function SectionView({ section }: { section: Section }) {
  switch (section) {
    case "overview":
      return <Overview />;
    case "orders":
      return <Orders />;
    case "calendar":
      return <CalendarView />;
    case "map":
      return <MapView />;
    case "approvals":
      return <Approvals />;
    case "messages":
      return <Messages />;
    case "stock":
      return <Stock />;
    case "team":
      return <Team />;
    case "invoices":
      return <Invoices />;
    case "customers":
      return <Customers />;
    case "reviews":
      return <Reviews />;
    case "reports":
      return <Reports />;
    case "settings":
      return <Settings />;
  }
}
