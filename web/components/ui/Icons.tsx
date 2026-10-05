// Simple line icons drawn for this site (24 × 24 grid, 1.75 px stroke, currentColor).
import type { ServiceIcon } from "@/lib/content";

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

export const IconArrow = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconClose = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
export const IconPhone = (p: P) => (
  <Svg {...p}>
    <path d="M5 4h3.2l1.6 4-2 1.3a11 11 0 006.9 6.9l1.3-2 4 1.6V19a2 2 0 01-2.2 2A16 16 0 013 6.2 2 2 0 015 4z" />
  </Svg>
);
export const IconMail = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 6.5L12 13l8.5-6.5" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconUpload = (p: P) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
);
export const IconTruck = (p: P) => (
  <Svg {...p}>
    <path d="M3 6h11v10H3zM14 9.5h4l3 3.5v3h-7" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" />
    <path d="M8.8 12l2.2 2.2 4.2-4.4" />
  </Svg>
);
export const IconMap = (p: P) => (
  <Svg {...p}>
    <path d="M9 4.5L3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2zM9 4.5v13M15 6.5v13" />
  </Svg>
);

/** Service icons: small house drawings showing where the scaffold goes. */
export function ServiceGlyph({ kind, className = "h-7 w-7" }: { kind: ServiceIcon; className?: string }) {
  switch (kind) {
    case "roof":
      return (
        <Svg className={className}>
          <path d="M4 11l8-6 8 6M6 10v9h12v-9" />
          <path d="M2.5 12.5h3M18.5 12.5h3" strokeWidth={2.4} />
        </Svg>
      );
    case "facade":
      return (
        <Svg className={className}>
          <path d="M6 20V8l6-4 6 4v12" />
          <path d="M3.5 20V9M20.5 20V9M3.5 14h2.5M18 14h2.5M3.5 9.5h2.5M18 9.5h2.5" />
        </Svg>
      );
    case "both":
      return (
        <Svg className={className}>
          <path d="M4 11l8-6 8 6M6.5 10v10h11V10" />
          <path d="M3 20v-8M21 20v-8M3 16h3.5M17.5 16h3.5" />
          <path d="M2 12h3M19 12h3" strokeWidth={2.4} />
        </Svg>
      );
    case "gutters":
      return (
        <Svg className={className}>
          <path d="M4 10l8-5.5L20 10M6 10v10h12V10" />
          <path d="M3 11.5h4M17 11.5h4M19.5 11.5v8" />
        </Svg>
      );
    case "bolt":
      return (
        <Svg className={className}>
          <path d="M13 3L5.5 13.5H12L11 21l7.5-10.5H12z" />
        </Svg>
      );
    case "building":
      return (
        <Svg className={className}>
          <path d="M4 20V6h7v14M11 20V3h9v17M2.5 20h19" />
          <path d="M6.5 9.5h2M6.5 13h2M14 7h3M14 10.5h3M14 14h3" />
        </Svg>
      );
  }
}
