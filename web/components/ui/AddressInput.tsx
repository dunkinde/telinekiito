"use client";
// Address field with suggestions while typing: official addresses with postal codes (National Land Survey),
// so the customer picks an existing address instead of typing one with a mistake. Works as an ARIA combobox:
// arrow keys move, Enter picks, Escape closes. Without suggestions it is a plain text field.
import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";
import { suggestAddresses, type AddressSuggestion } from "@/lib/api";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "autoComplete" | "role"> & {
  value: string;
  onChange: (v: string) => void;
  /** A suggestion was picked: value is already set to its label. */
  onPick?: (s: AddressSuggestion) => void;
  /** Accessible name of the list, e.g. "Address suggestions". */
  listLabel: string;
  wrapperClassName?: string;
};

export function AddressInput({ value, onChange, onPick, listLabel, wrapperClassName, className, onKeyDown, onBlur, onFocus, ...rest }: Props) {
  const listId = useId();
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const picked = useRef<string | null>(null);
  const typed = useRef(false);

  // Ask once typing pauses; only the newest answer counts.
  useEffect(() => {
    const q = value.trim();
    if (!typed.current || q.length < 3 || q === picked.current) {
      setItems([]);
      return;
    }
    const ctl = new AbortController();
    const id = window.setTimeout(() => {
      suggestAddresses(q, ctl.signal)
        .then((list) => {
          setItems(list);
          setActive(-1);
          setOpen(list.length > 0);
        })
        .catch(() => {});
    }, 250);
    return () => {
      window.clearTimeout(id);
      ctl.abort();
    };
  }, [value]);

  function pick(s: AddressSuggestion) {
    picked.current = s.label;
    typed.current = false;
    onChange(s.label);
    setItems([]);
    setOpen(false);
    onPick?.(s);
  }

  const shown = open && items.length > 0;
  return (
    <div className={`relative ${wrapperClassName || ""}`}>
      <input
        {...rest}
        value={value}
        onChange={(e) => {
          typed.current = true;
          picked.current = null;
          onChange(e.target.value);
        }}
        onFocus={(e) => {
          if (items.length) setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (shown && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (shown && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (shown && e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (shown && e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (!shown && e.key === "ArrowDown" && items.length) {
            e.preventDefault();
            setOpen(true);
          }
          onKeyDown?.(e);
        }}
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
      />
      {shown ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={listLabel}
          className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-80 overflow-auto rounded-2xl bg-white py-1.5 text-left shadow-[0_20px_50px_-20px_rgba(14,18,23,0.45)] ring-1 ring-line"
        >
          {items.map((s, i) => (
            <li
              key={s.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, so the pick lands before the field loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-4 py-2.5 ${i === active ? "bg-sun-soft" : ""}`}
            >
              <span className="font-semibold text-ink">{s.street}</span>
              <span className="shrink-0 text-sm text-muted">{[s.postcode, s.city].filter(Boolean).join(" ")}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
