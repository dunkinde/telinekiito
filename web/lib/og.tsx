// Share images (Open Graph / Twitter), drawn at build time with next/og and written as static PNG files.
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

export function ogImage({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0e1217", color: "#ffffff", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 40 40">
            <rect width="40" height="40" rx="10" fill="#ffc20e" />
            <path d="M12 9v22M28 9v22M12 15h16M12 25h16M12 25l16-10" stroke="#0e1217" strokeWidth="3.2" fill="none" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 700 }}>TelineKiito</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: "#ffc20e" }}>{eyebrow}</div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, marginTop: 18 }}>{title}</div>
          <div style={{ fontSize: 34, color: "rgba(255,255,255,0.72)", marginTop: 24 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", height: 14, width: 260, background: "#ffc20e", borderRadius: 4 }} />
      </div>
    ),
    OG_SIZE
  );
}
