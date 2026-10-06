// Line icons for the crew app (24 × 24 grid, round joins, currentColor), drawn in the same style as components/ui/Icons.
type P = { className?: string };
function Svg({ className = "h-6 w-6", children, stroke = 2 }: P & { children: React.ReactNode; stroke?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  );
}

export const IBack = (p: P) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
);
export const IChevronRight = (p: P) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
);
export const IChevronDown = (p: P) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const ICheck = (p: P) => (
  <Svg {...p} stroke={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IPlus = (p: P) => (
  <Svg {...p} stroke={2.4}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IMinus = (p: P) => (
  <Svg {...p} stroke={2.4}>
    <path d="M5 12h14" />
  </Svg>
);
export const IRefresh = (p: P) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 00-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.6 4.5L20 16M20 20v-4h-4" />
  </Svg>
);
export const IGear = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
export const IPhone = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 006.9 6.9l1.3-2 4 1.6V19a2 2 0 01-2.2 2A16 16 0 013 6.2 2 2 0 015 4z" />
  </Svg>
);
export const INavigate = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 11L20.5 3.5 13 20.5l-2-7.5z" />
  </Svg>
);
export const IPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
export const ICamera = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 011 1v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
    <circle cx="12" cy="13.2" r="3.6" />
  </Svg>
);
export const ITruck = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Svg>
);
export const IBox = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
    <path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" />
  </Svg>
);
/** Building up: a scaffold with an up arrow. */
export const IBuild = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V9M13 21V9M5 13h8M5 17h8M5 17l8-4" />
    <path d="M19 21V5M16 8l3-3 3 3" />
  </Svg>
);
/** Taking down: a scaffold with a down arrow. */
export const IDismantle = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V9M13 21V9M5 13h8M5 17h8M5 17l8-4" />
    <path d="M19 5v16M16 18l3 3 3-3" />
  </Svg>
);
export const IShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
    <path d="M8.8 12l2.2 2.2 4.2-4.4" />
  </Svg>
);
export const IWarn = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5L2.5 20h19z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Svg>
);
export const IClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IPlay = (p: P) => (
  <Svg {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Svg>
);
export const IStop = (p: P) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </Svg>
);
export const IPen = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z" />
    <path d="M13.5 7l3.5 3.5" />
  </Svg>
);
export const IFlag = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </Svg>
);
export const IChat = (p: P) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);
export const IUser = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6" />
  </Svg>
);
export const ILogout = (p: P) => (
  <Svg {...p}>
    <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
  </Svg>
);
export const ICloudOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18M8.5 7A5.5 5.5 0 0117.4 10 4 4 0 0119 17.6M17 18H7a4.5 4.5 0 01-1.6-8.7" />
  </Svg>
);
export const IUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Svg>
);
export const IList = (p: P) => (
  <Svg {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5" />
  </Svg>
);
export const IHome = (p: P) => (
  <Svg {...p}>
    <path d="M3.5 11L12 4l8.5 7M6 9.5V20h12V9.5" />
  </Svg>
);
export const IHistory = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 102.3-5.6L4 8.5M4 4v4.5h4.5" />
    <path d="M12 8v4.5l3 1.5" />
  </Svg>
);
export const IDownload = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Svg>
);
export const IEye = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
export const IEyeOff = (p: P) => (
  <Svg {...p}>
    <path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-3 3.7M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 004.4-1.1M9.9 9.9a3 3 0 004.2 4.2" />
  </Svg>
);
export const IKey = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
  </Svg>
);
export const ICalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
