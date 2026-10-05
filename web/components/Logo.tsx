// TelineKiito mark: a scaffold frame (two standards, two ledgers, one brace) on a safety-yellow tile.
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#ffc20e" />
      <g stroke="#0e1217" strokeWidth="3.2" strokeLinecap="square" fill="none">
        <path d="M12 9v22M28 9v22M12 15h16M12 25h16M12 25l16-10" />
      </g>
    </svg>
  );
}

export function Logo({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className={`font-display text-[1.35rem] leading-none font-extrabold tracking-[-0.01em] ${dark ? "text-white" : "text-ink"}`}>
        Teline<span className="text-sun-deep">Kiito</span>
      </span>
    </span>
  );
}
