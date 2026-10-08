"use client";
import { useEffect, useState } from "react";

/** True while the media query matches (false during the static render). */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Desktop with a mouse. Only there do the intro, looping background motion and parallax run; phones and tablets stay light. */
export const RICH_MOTION = "(min-width: 1024px) and (pointer: fine)";
export const useRichMotion = () => useMedia(RICH_MOTION);
