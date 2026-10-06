// Line icons for the office (same 24 × 24 grid and 1.75 px stroke as the website's icons).
type P = { className?: string; title?: string };
function Svg({ className = "h-5 w-5", title, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IOverview = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Svg>
);
export const IOrders = (p: P) => (
  <Svg {...p}>
    <path d="M8 4h8M9 2.8h6a1 1 0 011 1V5a1 1 0 01-1 1H9a1 1 0 01-1-1V3.8a1 1 0 011-1z" />
    <path d="M16 4h1.5A2.5 2.5 0 0120 6.5v12a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 18.5v-12A2.5 2.5 0 016.5 4H8" />
    <path d="M8 11h8M8 15h5" />
  </Svg>
);
export const ICalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
    <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2" />
  </Svg>
);
export const IMap = (p: P) => (
  <Svg {...p}>
    <path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2zM9 4.5v13M15 6.5v13" />
  </Svg>
);
export const IApprove = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l2.1 1.6 2.6-.2.8 2.5 2.2 1.4-.9 2.5.9 2.5-2.2 1.4-.8 2.5-2.6-.2L12 18.6l-2.1-1.6-2.6.2-.8-2.5-2.2-1.4.9-2.5-.9-2.5 2.2-1.4.8-2.5 2.6.2z" />
    <path d="M9 11l2 2 4-4" />
  </Svg>
);
export const IStock = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l8 4-8 4-8-4 8-4z" />
    <path d="M4 12l8 4 8-4M4 16.5l8 4 8-4" />
  </Svg>
);
export const IMessages = (p: P) => (
  <Svg {...p}>
    <path d="M4 5.5A2.5 2.5 0 016.5 3h11A2.5 2.5 0 0120 5.5v8a2.5 2.5 0 01-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 014 14.5z" />
    <path d="M8 8.5h8M8 12h5" />
  </Svg>
);
export const IInvoice = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2.5-1.5L13 21l-2-1.5L8.5 21 6 19.5z" />
    <path d="M9 8h6M9 11.5h6M9 15h3.5" />
  </Svg>
);
export const ICustomers = (p: P) => (
  <Svg {...p}>
    <path d="M4 20.5V8.5l6-3.5v15.5M10 20.5h10V10l-5-2.5M4 20.5h6" />
    <path d="M13.5 12h3M13.5 15.5h3M6.5 11h1M6.5 14.5h1" />
  </Svg>
);
export const IStar = (p: P & { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" className={p.className || "h-5 w-5"} aria-hidden fill={p.filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" />
  </svg>
);
export const ITeam = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.6-3.3 3-5.2 6-5.2s5.4 1.9 6 5.2" />
    <path d="M15.5 5.6a3 3 0 010 5.8M17.8 14.6c1.6.8 2.7 2.4 3.1 4.9" />
  </Svg>
);
export const IReports = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16" />
    <path d="M6.5 16.5v-5M11 16.5V7M15.5 16.5v-7.5M20 16.5V4.5" />
  </Svg>
);
export const ISettings = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </Svg>
);
export const IBell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2.2 2.2 0 004 0" />
  </Svg>
);
export const ILogout = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5H6.5A2 2 0 004.5 6.5v11a2 2 0 002 2H14" />
    <path d="M10.5 12H20M16.5 8l4 4-4 4" />
  </Svg>
);
export const IMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
export const IExternal = (p: P) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
    <path d="M17 13.5v4.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 015 18v-9a1.5 1.5 0 011.5-1.5H11" />
  </Svg>
);
export const ILeft = (p: P) => (
  <Svg {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Svg>
);
export const IRight = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);
export const IUp = (p: P) => (
  <Svg {...p}>
    <path d="M6 14.5l6-6 6 6" />
  </Svg>
);
export const IDown = (p: P) => (
  <Svg {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Svg>
);
export const IWarn = (p: P) => (
  <Svg {...p}>
    <path d="M12 4l9 15.5H3z" />
    <path d="M12 10v4M12 17v.2" />
  </Svg>
);
export const IInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8v.2" />
  </Svg>
);
export const IWind = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 9h11a2.5 2.5 0 10-2.5-2.5" />
    <path d="M3.5 13h15a2.5 2.5 0 11-2.5 2.5" />
    <path d="M3.5 17h7" />
  </Svg>
);
export const ITrash = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
  </Svg>
);
export const IEdit = (p: P) => (
  <Svg {...p}>
    <path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 012.9 0l.1.1a2 2 0 010 2.9L8.5 18.5z" />
    <path d="M13.5 7.5l3 3" />
  </Svg>
);
export const ICopy = (p: P) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
  </Svg>
);
export const IRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
    <path d="M19.5 4v4.5H15" />
  </Svg>
);
export const IDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
  </Svg>
);
export const IDoc = (p: P) => (
  <Svg {...p}>
    <path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2V8.5z" />
    <path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5" />
  </Svg>
);
export const ISend = (p: P) => (
  <Svg {...p}>
    <path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z" />
  </Svg>
);
export const ICamera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8.5A2 2 0 016 6.5h2.5L10 4.5h4l1.5 2H18a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);
export const IUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c.9-3.8 3.8-6 7.5-6s6.6 2.2 7.5 6" />
  </Svg>
);
export const IPickup = (p: P) => (
  <Svg {...p}>
    <path d="M21 6H10v10h11zM10 9.5H6l-3 3.5v3h7" />
    <circle cx="17" cy="17.5" r="1.8" />
    <circle cx="6.5" cy="17.5" r="1.8" />
  </Svg>
);
export const IFit = (p: P) => (
  <Svg {...p}>
    <path d="M4 9V4.5h4.5M15.5 4.5H20V9M20 15v4.5h-4.5M8.5 19.5H4V15" />
    <circle cx="12" cy="12" r="2.2" />
  </Svg>
);
export const IMinus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IDrag = (p: P) => (
  <Svg {...p}>
    <path d="M9 6v.2M15 6v.2M9 12v.2M15 12v.2M9 18v.2M15 18v.2" strokeWidth={2.6} />
  </Svg>
);
export const IGlobe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" />
  </Svg>
);
export const IHelmet = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 17h17M5 17v-2.5a7 7 0 0114 0V17" />
    <path d="M10 8.2V5.5h4v2.7" />
  </Svg>
);
export const ILock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </Svg>
);
export const IEye = (p: P) => (
  <Svg {...p}>
    <path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);
