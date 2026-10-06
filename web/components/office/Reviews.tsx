"use client";
// Customer reviews: read them and choose which to show on the website (only with the customer's permission).
import { useMemo, useState } from "react";
import { getReviews, setReviewPublished, type Review } from "@/lib/platform";
import { useAct, useLoad, useT } from "./context";
import { dateTime, number } from "./format";
import { IStar } from "./icons";
import { RefLink } from "./bits";
import { Async, Badge, Card, Chips, Empty, Stars, Switch, cx } from "./ui";

type F = "all" | "published" | "ready" | "private";

export function Reviews() {
  const { t, lang } = useT();
  const st = useLoad(getReviews, [], { poll: true });
  const { busy, run } = useAct();
  const [f, setF] = useState<F>("all");
  const all = useMemo(() => [...(st.data?.reviews || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [st.data]);
  const avg = all.length ? all.reduce((s, r) => s + r.stars, 0) / all.length : 0;
  const by = (k: F) => (r: Review) => (k === "all" ? true : k === "published" ? r.published : k === "ready" ? r.consent && !r.published : !r.consent);
  const list = all.filter(by(f));
  async function toggle(r: Review, on: boolean) {
    const res = await run(r.id, () => setReviewPublished(r.id, on), on ? t("rev.publishedDone") : t("rev.hiddenDone"), { refresh: false });
    if (res) st.reload();
  }
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: all.filter((r) => r.stars === n).length }));
  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <Card as="div" className="flex items-center gap-4 px-5 py-4">
          <p className="font-display text-[40px] leading-none font-extrabold text-ink tabular-nums">{all.length ? number(avg, lang, 1) : "–"}</p>
          <div>
            <Stars n={Math.round(avg)} />
            <p className="mt-1 text-[12.5px] text-muted">{t("rev.count", { n: all.length })}</p>
          </div>
        </Card>
        <Card as="div" className="px-5 py-3">
          <ul className="space-y-1" aria-label={t("rev.distribution")}>
            {dist.map((x) => (
              <li key={x.n} className="flex items-center gap-3 text-[12.5px]">
                <span className="w-10 shrink-0 text-ink-soft">
                  {x.n} <span aria-hidden>★</span>
                  <span className="sr-only">{t("rev.starsWord")}</span>
                </span>
                <span aria-hidden className="h-2 flex-1 overflow-hidden rounded-full bg-mist">
                  <span className="block h-full rounded-full bg-sun-deep" style={{ width: `${all.length ? (x.c / all.length) * 100 : 0}%` }} />
                </span>
                <span className="w-8 text-right font-semibold text-ink tabular-nums">{x.c}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Chips
        className="mb-4"
        label={t("rev.filter")}
        value={f}
        onChange={setF}
        options={(["all", "published", "ready", "private"] as F[]).map((k) => ({ key: k, label: t(`rev.f.${k}`), count: all.filter(by(k)).length }))}
      />
      <Async state={st}>
        {() =>
          list.length ? (
            <ul className="grid gap-3 lg:grid-cols-2">
              {list.map((r) => (
                <li key={r.id}>
                  <Card as="article" className={cx("flex h-full flex-col p-5", r.published && "ring-[#bfe5cd]")} aria-label={t("rev.by", { name: r.name })}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Stars n={r.stars} />
                        <p className="mt-1 text-[14px] font-semibold text-ink">{r.name || "–"}</p>
                        <p className="text-[12.5px] text-muted">
                          {dateTime(r.createdAt, lang)} · <RefLink refNo={r.ref} className="text-[12px]" />
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {r.published ? (
                          <Badge tone="green" dot>
                            {t("rev.onSite")}
                          </Badge>
                        ) : null}
                        <Badge tone={r.consent ? "blue" : "gray"}>{r.consent ? t("rev.consent") : t("rev.noConsent")}</Badge>
                      </div>
                    </div>
                    {r.text ? <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-ink">“{r.text}”</p> : <p className="mt-3 flex-1 text-[13.5px] text-muted italic">{t("rev.noText")}</p>}
                    <div className="mt-4 border-t border-line pt-3">
                      <Switch
                        checked={r.published}
                        disabled={!r.consent || busy === r.id}
                        onChange={(v) => toggle(r, v)}
                        label={t("rev.publish")}
                        hint={r.consent ? t("rev.publishHint") : t("rev.publishNoConsent")}
                      />
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Card as="div">
              <Empty icon={<IStar className="h-6 w-6" />} title={all.length ? t("rev.noMatch") : t("rev.none")} text={all.length ? undefined : t("rev.noneText")} />
            </Card>
          )
        }
      </Async>
    </div>
  );
}
