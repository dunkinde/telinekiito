"use client";
// Published customer reviews (the office publishes them; only ratings the customer allowed to show).
// The section only appears once there is at least one published review.
import { useI18n } from "@/lib/i18n";
import { useSite } from "../SiteContext";
import { SectionHead, Stagger, StaggerItem } from "../ui/motion";

const STAR = "M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z";

export function Reviews() {
  const { t, lang } = useI18n();
  const { content } = useSite();
  const all = content?.reviews || [];
  if (!all.length) return null;
  // Reviews in the visitor's language first, the rest after; at most six fit one screen.
  const list = [...all.filter((r) => r.lang === lang), ...all.filter((r) => r.lang !== lang)].slice(0, 6);
  const avg = all.reduce((s, r) => s + r.stars, 0) / all.length;
  return (
    <section id="reviews" className="snap-screen section-pad bg-white" aria-label={t("sec.reviews.title")}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow={t("sec.reviews.eyebrow")} title={t("sec.reviews.title")} intro={t("sec.reviews.avg", { avg: avg.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 1 }), n: all.length })} />
        <Stagger as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 short:mt-6" stagger={0.06}>
          {list.map((r, i) => (
            <StaggerItem as="li" key={i}>
              <figure className="flex h-full flex-col rounded-3xl bg-mist p-6 ring-1 ring-line short:p-5">
                <span className="inline-flex gap-0.5 text-sun-deep" role="img" aria-label={`${r.stars} / 5`}>
                  {[1, 2, 3, 4, 5].map((k) => (
                    <svg key={k} viewBox="0 0 24 24" className="h-5 w-5" fill={k <= r.stars ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} aria-hidden>
                      <path d={STAR} />
                    </svg>
                  ))}
                </span>
                {r.text ? <blockquote className="mt-3 flex-1 leading-relaxed text-ink-soft line-clamp-5">“{r.text}”</blockquote> : <div className="flex-1" />}
                <figcaption className="mt-4 text-sm font-semibold text-ink">{r.name}</figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
