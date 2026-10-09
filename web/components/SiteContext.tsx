"use client";
// Shared state for the page: prices and site content from the server, and opening the quote and tracking dialogs from anywhere.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getConfig, getContent, type Config, type JobType, type SiteContent, type Urgency } from "@/lib/api";

export interface QuoteStart {
  address?: string;
  jobType?: JobType;
  urgency?: Urgency;
  /** "hero": opened from the hero address bar, which then morphs into the quote window. */
  origin?: "hero";
}

interface SiteState {
  config: Config | null;
  /** FAQ and contact details edited in the office, and published reviews (null until loaded). */
  content: SiteContent | null;
  introDone: boolean;
  setIntroDone: (v: boolean) => void;
  quote: { open: boolean; start: QuoteStart; key: number };
  openQuote: (start?: QuoteStart) => void;
  closeQuote: () => void;
  track: { open: boolean; ref?: string; phone4?: string; key?: string };
  openTrack: (ref?: string, phone4?: string) => void;
  closeTrack: () => void;
}

const Ctx = createContext<SiteState | null>(null);

export function SiteProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [quote, setQuote] = useState<SiteState["quote"]>({ open: false, start: {}, key: 0 });
  const [track, setTrack] = useState<SiteState["track"]>({ open: false });

  useEffect(() => {
    let alive = true;
    getConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => {
        /* The page still works; prices load when the wizard asks for them. */
      });
    getContent()
      .then((c) => alive && setContent(c))
      .catch(() => {
        /* The built-in FAQ and contact details stay. */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Every opening gets a new key, so the wizard starts fresh with the new address.
  const openQuote = useCallback((start: QuoteStart = {}) => setQuote((q) => ({ open: true, start, key: q.key + 1 })), []);
  const closeQuote = useCallback(() => setQuote((q) => ({ ...q, open: false })), []);
  const openTrack = useCallback((ref?: string, phone4?: string) => setTrack({ open: true, ref, phone4 }), []);
  const closeTrack = useCallback(() => setTrack((t) => ({ ...t, open: false })), []);

  // Links in our emails and texts open the tracking window: /?track=TK-XXXXXX&k=<the order's key>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ref = q.get("track");
    if (!ref) return;
    setTrack({ open: true, ref: ref.toUpperCase().slice(0, 20), key: (q.get("k") || "").slice(0, 400) || undefined });
    const url = new URL(window.location.href);
    url.searchParams.delete("track");
    url.searchParams.delete("k");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  return (
    <Ctx.Provider value={{ config, content, introDone, setIntroDone, quote, openQuote, closeQuote, track, openTrack, closeTrack }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSite(): SiteState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSite must be used inside <SiteProvider>");
  return c;
}
