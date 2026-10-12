// TelineKiito "forward cut" wordmark, from the owner's outlined source (concept 04).
// Letters take currentColor; the two slashes are always safety yellow.
export const LETTERS: [number, string][] = [
  [0, "M0 0H80V16H52V59H28V16H0Z"],
  [84, "M0 0H68V16H25V22H66V37H25V44H68V59H0Z"],
  [157, "M0 0H24V44H69V59H0Z"],
  [230, "M0 0H23V59H0Z"],
  [258, "M0 0H28L51 30V0H74V59H47L24 29V59H0Z"],
  [337, "M0 0H67V16H24V22H65V37H24V44H67V59H0Z"],
  [408, "M0 0H22V23L46 0H72L45 28L72 59H47L22 33V59H0Z"],
  [484, "M0 0H22V59H0Z"],
  [510, "M0 0H22V59H0Z"],
  [536, "M0 0H73V16H48V59H24V16H0Z"],
  [612, "M17 0H69C78 0 82 3 81 9C80.7 11.5 79.5 14 77.5 17L55 53C52.5 57 50.5 59 46 59H16C6 59 0 54 0 44V17C0 6 6 0 17 0ZM30 17C25 17 23 19 23 24V34C23 39 25 42 30 42H39C41 42 42 40 43 38L51 25C54 20 52 17 47 17Z"],
];
export const SLASHES = ["M713 0H735L699 59H677Z", "M744 0H766L730 59H708Z"];

// App icon: the two slashes on a dark tile.
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0e1217" />
      <path className="fill-sun" d="M17.1 10H24.6L12.4 30H4.9ZM27.6 10H35.1L22.9 30H15.4Z" />
    </svg>
  );
}

export function Logo({ dark = false, className = "h-[18px] sm:h-[22px]" }: { dark?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 766 59" role="img" aria-label="TelineKiito" className={`block w-auto ${dark ? "text-white" : "text-ink"} ${className}`}>
      <g fill="currentColor">
        {LETTERS.map(([x, d]) => (
          <path key={x} transform={`translate(${x} 0)`} d={d} fillRule="evenodd" />
        ))}
      </g>
      <path className="fill-sun" d={SLASHES.join("")} />
    </svg>
  );
}
