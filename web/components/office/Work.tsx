"use client";
// Work (owner, leaders and sales): the company's own tasks on a board, projects that group them, routines that make a
// task every day, week or month, and the hours people log against tasks.
import { useMemo, useState } from "react";
import {
  addComment,
  getWork,
  logHours,
  removeHours,
  removeProject,
  removeRoutine,
  removeTask,
  saveProject,
  saveRoutine,
  saveTask,
  type CheckItem,
  type Every,
  type Person,
  type Priority,
  type Project,
  type Routine,
  type Task,
  type TaskStatus,
  type WorkData,
} from "@/lib/work";
import { IconPlus } from "../ui/Icons";
import { useAct, useLoad, useOffice, useT } from "./context";
import {
  ago,
  day,
  initials,
  isoWeek,
  numText,
  parseNum,
  weekday,
} from "./format";
import { IApprove, ILeft, IRight, ITrash } from "./icons";
import { useWT } from "./workText";
import {
  Async,
  Badge,
  Btn,
  Card,
  Check,
  Chips,
  Confirm,
  Dialog,
  Empty,
  Field,
  IconBtn,
  Input,
  Select,
  SectionIntro,
  Switch,
  TableWrap,
  Tabs,
  TextArea,
  Toolbar,
  cx,
  td,
  th,
  type Tone,
} from "./ui";

const STATUSES: TaskStatus[] = ["todo", "doing", "done"];
const PRIORITIES: Priority[] = ["low", "normal", "high"];
const PRIO_TONE: Record<Priority, Tone> = {
  low: "gray",
  normal: "neutral",
  high: "red",
};
type TabKey = "board" | "projects" | "routines" | "workload";

const addDays = (s: string, n: number) => {
  const d = new Date(s + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (s: string) =>
  addDays(s, -((new Date(s + "T12:00:00Z").getUTCDay() + 6) % 7));
const sumHours = (t: Task) => (t.hours || []).reduce((a, h) => a + h.hours, 0);
const isOverdue = (t: Task, today: string) =>
  t.status !== "done" && !!t.due && t.due < today;

export function Work() {
  const wt = useWT();
  const { route, setParams } = useOffice();
  const state = useLoad(getWork, [], { poll: true });
  const tab = (
    ["board", "projects", "routines", "workload"].includes(route.params.tab)
      ? route.params.tab
      : "board"
  ) as TabKey;
  return (
    <div>
      <SectionIntro>{wt("addToHome")}</SectionIntro>
      <Tabs
        className="mb-4"
        label={wt("tab.board")}
        value={tab}
        onChange={(k) => setParams({ tab: k === "board" ? null : k })}
        tabs={(["board", "projects", "routines", "workload"] as TabKey[]).map(
          (k) => ({ key: k, label: wt(`tab.${k}`) }),
        )}
      />
      <Async state={state}>
        {(d) => {
          const reload = () => state.reload();
          if (tab === "projects") return <Projects d={d} reload={reload} />;
          if (tab === "routines") return <Routines d={d} reload={reload} />;
          if (tab === "workload") return <Workload d={d} />;
          return <Board d={d} reload={reload} />;
        }}
      </Async>
    </div>
  );
}

function usePeople(d: WorkData) {
  return useMemo(() => {
    const byId = new Map<string, Person>(d.people.map((p) => [p.id, p]));
    return {
      byId,
      name: (id?: string | null) => (id ? byId.get(id)?.name || "?" : ""),
    };
  }, [d.people]);
}

/* ---------------- Board ---------------- */
function Board({ d, reload }: { d: WorkData; reload: () => void }) {
  const wt = useWT();
  const { lang } = useT();
  const { user, route, setParams } = useOffice();
  const { run, busy } = useAct();
  const people = usePeople(d);
  const [who, setWho] = useState<"all" | "mine" | "overdue">("all");
  const [open, setOpen] = useState<Task | "new" | null>(null);
  const proj = route.params.project || "";
  const projName = (id?: string | null) =>
    d.projects.find((p) => p.id === id)?.name || "";
  const shown = d.tasks.filter(
    (t) =>
      (who !== "mine" || t.assigneeId === user.id) &&
      (who !== "overdue" || isOverdue(t, d.today)) &&
      (!proj || (proj === "none" ? !t.projectId : t.projectId === proj)),
  );
  const order = (a: Task, b: Task) =>
    (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) ||
    (a.due || "9999").localeCompare(b.due || "9999") ||
    a.createdAt.localeCompare(b.createdAt);
  async function move(t: Task, dir: 1 | -1) {
    const s = STATUSES[STATUSES.indexOf(t.status) + dir];
    if (
      s &&
      (await run(`m${t.id}`, () => saveTask({ status: s }, t.id), undefined, {
        refresh: false,
      }))
    )
      reload();
  }
  return (
    <>
      <Toolbar>
        <Chips
          label={wt("assignee")}
          value={who}
          onChange={setWho}
          options={[
            { key: "all", label: wt("f.all") },
            {
              key: "mine",
              label: wt("f.mine"),
              count: d.tasks.filter(
                (t) => t.status !== "done" && t.assigneeId === user.id,
              ).length,
            },
            {
              key: "overdue",
              label: wt("f.overdue"),
              count: d.tasks.filter((t) => isOverdue(t, d.today)).length,
            },
          ]}
        />
        <div className="w-full sm:w-64">
          <Select
            aria-label={wt("project")}
            value={proj}
            onChange={(v) => setParams({ project: v || null })}
            options={[
              { value: "", label: wt("f.allProjects") },
              { value: "none", label: wt("f.noProject") },
              ...d.projects
                .filter((p) => p.status !== "archived")
                .map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <Btn
          variant="primary"
          size="sm"
          className="ml-auto"
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => setOpen("new")}
        >
          {wt("newTask")}
        </Btn>
      </Toolbar>
      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((s, si) => {
          const col = shown.filter((t) => t.status === s).sort(order);
          return (
            <section
              key={s}
              aria-label={wt(`st.${s}`)}
              className="flex min-w-0 flex-col gap-2 rounded-xl bg-mist/60 p-2.5"
            >
              <h3 className="flex items-center justify-between px-1 text-[13px] font-semibold tracking-wide text-muted uppercase">
                {wt(`st.${s}`)}
                <span className="tabular-nums">{col.length}</span>
              </h3>
              {col.length === 0 ? (
                <p className="px-1 py-4 text-center text-[13px] text-muted">
                  {wt("emptyCol")}
                </p>
              ) : null}
              {col.map((t) => {
                const cl = t.checklist || [];
                const h = sumHours(t);
                const late = isOverdue(t, d.today);
                return (
                  <article
                    key={t.id}
                    className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-line"
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      onClick={() => setOpen(t)}
                    >
                      <p
                        className={cx(
                          "text-[14.5px] font-semibold text-ink",
                          s === "done" && "text-muted line-through",
                        )}
                      >
                        {t.title}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                        {t.priority !== "normal" ? (
                          <Badge tone={PRIO_TONE[t.priority]}>
                            {wt(`pr.${t.priority}`)}
                          </Badge>
                        ) : null}
                        {t.projectId ? (
                          <Badge tone="blue">{projName(t.projectId)}</Badge>
                        ) : null}
                        {t.routineId ? (
                          <Badge tone="violet">{wt("fromRoutine")}</Badge>
                        ) : null}
                        {t.due ? (
                          <span
                            className={cx(
                              late && "font-semibold text-[#b42318]",
                            )}
                          >
                            {day(t.due, lang)}
                          </span>
                        ) : null}
                        {cl.length ? (
                          <span>
                            ☑ {cl.filter((c) => c.done).length}/{cl.length}
                          </span>
                        ) : null}
                        {t.comments?.length ? (
                          <span>💬 {t.comments.length}</span>
                        ) : null}
                        {h ? <span>{numText(h, lang)} h</span> : null}
                        {t.orderRef ? (
                          <span className="font-mono">{t.orderRef}</span>
                        ) : null}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center gap-1">
                      {t.assigneeId ? (
                        <span
                          title={people.name(t.assigneeId)}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white"
                        >
                          {initials(people.name(t.assigneeId))}
                        </span>
                      ) : null}
                      <span className="ml-auto" />
                      {si > 0 ? (
                        <IconBtn
                          label={wt("moveLeft")}
                          disabled={busy === `m${t.id}`}
                          onClick={() => move(t, -1)}
                        >
                          <ILeft className="h-4 w-4" />
                        </IconBtn>
                      ) : null}
                      {si < 2 ? (
                        <IconBtn
                          label={wt("moveRight")}
                          disabled={busy === `m${t.id}`}
                          onClick={() => move(t, 1)}
                        >
                          {si === 1 ? (
                            <IApprove className="h-4 w-4" />
                          ) : (
                            <IRight className="h-4 w-4" />
                          )}
                        </IconBtn>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      <TaskDialog
        d={d}
        task={open}
        defaultProject={proj && proj !== "none" ? proj : ""}
        onClose={() => setOpen(null)}
        reload={reload}
      />
    </>
  );
}

type TaskDraft = {
  title: string;
  notes: string;
  projectId: string;
  assigneeId: string;
  due: string;
  priority: Priority;
  status: TaskStatus;
  orderRef: string;
  checklist: CheckItem[];
};

function TaskDialog({
  d,
  task,
  defaultProject,
  onClose,
  reload,
}: {
  d: WorkData;
  task: Task | "new" | null;
  defaultProject: string;
  onClose: () => void;
  reload: () => void;
}) {
  const wt = useWT();
  const { lang } = useT();
  const { user, owner } = useOffice();
  const { run, busy } = useAct();
  const open = task !== null;
  const existing = task && task !== "new" ? task : null;
  // The live copy, so comments and hours show as soon as they're added.
  const cur = existing
    ? d.tasks.find((t) => t.id === existing.id) || existing
    : null;
  const [dr, setDr] = useState<TaskDraft | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const [hrs, setHrs] = useState({ date: d.today, hours: "", note: "" });
  const [del, setDel] = useState(false);
  const key = open ? existing?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    setItem("");
    setComment("");
    setHrs({ date: d.today, hours: "", note: "" });
    if (open)
      setDr(
        existing
          ? {
              title: existing.title,
              notes: existing.notes || "",
              projectId: existing.projectId || "",
              assigneeId: existing.assigneeId || "",
              due: existing.due || "",
              priority: existing.priority,
              status: existing.status,
              orderRef: existing.orderRef || "",
              checklist: existing.checklist || [],
            }
          : {
              title: "",
              notes: "",
              projectId: defaultProject,
              assigneeId: user.id,
              due: "",
              priority: "normal",
              status: "todo",
              orderRef: "",
              checklist: [],
            },
      );
  }
  if (!dr) return null;
  const up = (p: Partial<TaskDraft>) => setDr((x) => (x ? { ...x, ...p } : x));
  async function save() {
    if (!dr || !dr.title.trim()) return;
    const body = {
      ...dr,
      title: dr.title.trim(),
      projectId: dr.projectId || null,
      assigneeId: dr.assigneeId || null,
      due: dr.due || null,
      orderRef: dr.orderRef || null,
    };
    const r = await run(
      "task",
      () => saveTask(body, existing?.id),
      existing ? wt("saved") : wt("created"),
      { refresh: false },
    );
    if (r) {
      reload();
      onClose();
    }
  }
  async function act(k: string, fn: () => Promise<unknown>) {
    if (await run(k, fn, undefined, { refresh: false })) reload();
  }
  const people = d.people.map((p) => ({ value: p.id, label: p.name }));
  return (
    <>
      <Dialog
        open={open && !del}
        onClose={onClose}
        title={existing ? wt("editTask") : wt("newTask")}
        footer={
          <>
            {existing ? (
              <Btn
                variant="quiet"
                className="mr-auto text-[#b42318]"
                icon={<ITrash className="h-4 w-4" />}
                onClick={() => setDel(true)}
              >
                {wt("delete")}
              </Btn>
            ) : null}
            <Btn variant="quiet" onClick={onClose}>
              {wt("cancel")}
            </Btn>
            <Btn
              variant="primary"
              busy={busy === "task"}
              disabled={!dr.title.trim()}
              onClick={save}
            >
              {wt("save")}
            </Btn>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={wt("title")} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={dr.title}
                maxLength={200}
                onChange={(v) => up({ title: v })}
              />
            )}
          </Field>
          <Field label={wt("status")}>
            {(id) => (
              <Select
                id={id}
                value={dr.status}
                onChange={(v) => up({ status: v as TaskStatus })}
                options={STATUSES.map((s) => ({
                  value: s,
                  label: wt(`st.${s}`),
                }))}
              />
            )}
          </Field>
          <Field label={wt("priority")}>
            {(id) => (
              <Select
                id={id}
                value={dr.priority}
                onChange={(v) => up({ priority: v as Priority })}
                options={PRIORITIES.map((p) => ({
                  value: p,
                  label: wt(`pr.${p}`),
                }))}
              />
            )}
          </Field>
          <Field label={wt("assignee")}>
            {(id) => (
              <Select
                id={id}
                value={dr.assigneeId}
                onChange={(v) => up({ assigneeId: v })}
                options={[{ value: "", label: wt("nobody") }, ...people]}
              />
            )}
          </Field>
          <Field label={wt("due")} optional>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={dr.due}
                onChange={(v) => up({ due: v })}
              />
            )}
          </Field>
          <Field label={wt("project")} optional>
            {(id) => (
              <Select
                id={id}
                value={dr.projectId}
                onChange={(v) => up({ projectId: v })}
                options={[
                  { value: "", label: wt("f.noProject") },
                  ...d.projects
                    .filter(
                      (p) => p.status !== "archived" || p.id === dr.projectId,
                    )
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </Field>
          <Field label={wt("orderRef")} hint={wt("orderRefHint")} optional>
            {(id, h) => (
              <Input
                id={id}
                describedBy={h}
                value={dr.orderRef}
                maxLength={14}
                onChange={(v) => up({ orderRef: v.toUpperCase() })}
              />
            )}
          </Field>
          <Field label={wt("notes")} optional className="sm:col-span-2">
            {(id) => (
              <TextArea
                id={id}
                rows={3}
                value={dr.notes}
                maxLength={4000}
                onChange={(v) => up({ notes: v })}
              />
            )}
          </Field>
        </div>

        <h3 className="mt-5 mb-2 text-[13px] font-semibold text-ink-soft">
          {wt("checklist")}
        </h3>
        <ul className="flex flex-col gap-1">
          {dr.checklist.map((c, i) => (
            <li key={i} className="flex items-center gap-2">
              <Check
                checked={c.done}
                onChange={(v) =>
                  up({
                    checklist: dr.checklist.map((x, j) =>
                      j === i ? { ...x, done: v } : x,
                    ),
                  })
                }
                label={
                  <span className={cx(c.done && "text-muted line-through")}>
                    {c.text}
                  </span>
                }
              />
              <IconBtn
                label={wt("delete")}
                className="ml-auto"
                onClick={() =>
                  up({ checklist: dr.checklist.filter((_, j) => j !== i) })
                }
              >
                <ITrash className="h-4 w-4" />
              </IconBtn>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label={wt("addItem")}
            placeholder={wt("addItem")}
            value={item}
            maxLength={200}
            onChange={setItem}
            onKeyDown={(e) => {
              if (e.key === "Enter" && item.trim()) {
                e.preventDefault();
                up({
                  checklist: [
                    ...dr.checklist,
                    { text: item.trim(), done: false },
                  ],
                });
                setItem("");
              }
            }}
          />
          <Btn
            size="sm"
            disabled={!item.trim()}
            onClick={() => {
              up({
                checklist: [
                  ...dr.checklist,
                  { text: item.trim(), done: false },
                ],
              });
              setItem("");
            }}
          >
            +
          </Btn>
        </div>

        {cur ? (
          <>
            <h3 className="mt-6 mb-2 text-[13px] font-semibold text-ink-soft">
              {wt("hours")} · {wt("total")} {numText(sumHours(cur), lang)} h
            </h3>
            <ul className="flex flex-col gap-1 text-[13.5px]">
              {(cur.hours || []).map((h) => (
                <li key={h.id} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-muted">
                    {day(h.date, lang)}
                  </span>
                  <span className="w-12 shrink-0 font-semibold tabular-nums">
                    {numText(h.hours, lang)} h
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {h.userName}
                    {h.note ? ` · ${h.note}` : ""}
                  </span>
                  {h.userId === user.id || owner ? (
                    <IconBtn
                      label={wt("delete")}
                      onClick={() =>
                        act(`h${h.id}`, () => removeHours(cur.id, h.id))
                      }
                    >
                      <ITrash className="h-4 w-4" />
                    </IconBtn>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-[8.5rem_5rem_1fr_auto] gap-2">
              <Input
                type="date"
                aria-label={wt("date")}
                value={hrs.date}
                onChange={(v) => setHrs((x) => ({ ...x, date: v }))}
              />
              <Input
                inputMode="decimal"
                aria-label={wt("hours")}
                placeholder="h"
                value={hrs.hours}
                onChange={(v) => setHrs((x) => ({ ...x, hours: v }))}
              />
              <Input
                aria-label={wt("note")}
                placeholder={wt("note")}
                value={hrs.note}
                maxLength={300}
                onChange={(v) => setHrs((x) => ({ ...x, note: v }))}
              />
              <Btn
                size="sm"
                busy={busy === "hrs"}
                disabled={!(parseNum(hrs.hours) || 0)}
                onClick={async () => {
                  if (
                    await run(
                      "hrs",
                      () =>
                        logHours(cur.id, {
                          date: hrs.date,
                          hours: parseNum(hrs.hours) || 0,
                          note: hrs.note,
                        }),
                      undefined,
                      { refresh: false },
                    )
                  ) {
                    setHrs({ date: hrs.date, hours: "", note: "" });
                    reload();
                  }
                }}
              >
                {wt("logHours")}
              </Btn>
            </div>

            <h3 className="mt-6 mb-2 text-[13px] font-semibold text-ink-soft">
              {wt("comments")}
            </h3>
            <ul className="flex flex-col gap-2">
              {(cur.comments || []).map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg bg-mist/60 px-3 py-2 text-[13.5px]"
                >
                  <p className="text-[12px] text-muted">
                    {c.byName} · {ago(c.at, lang)}
                  </p>
                  <p className="whitespace-pre-wrap text-ink">{c.text}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-start gap-2">
              <TextArea
                rows={2}
                aria-label={wt("addComment")}
                placeholder={wt("addComment")}
                value={comment}
                maxLength={2000}
                onChange={setComment}
              />
              <Btn
                size="sm"
                busy={busy === "cmt"}
                disabled={!comment.trim()}
                onClick={async () => {
                  if (
                    await run(
                      "cmt",
                      () => addComment(cur.id, comment.trim()),
                      undefined,
                      { refresh: false },
                    )
                  ) {
                    setComment("");
                    reload();
                  }
                }}
              >
                {wt("send")}
              </Btn>
            </div>
          </>
        ) : null}
      </Dialog>
      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title={wt("deleteTask")}
        confirmLabel={wt("delete")}
        danger
        onConfirm={async () => {
          if (!existing) return;
          if (
            await run("del", () => removeTask(existing.id), wt("deleted"), {
              refresh: false,
            })
          ) {
            setDel(false);
            reload();
            onClose();
          }
        }}
      />
    </>
  );
}

/* ---------------- Projects ---------------- */
function Projects({ d, reload }: { d: WorkData; reload: () => void }) {
  const wt = useWT();
  const { lang } = useT();
  const { setParams } = useOffice();
  const people = usePeople(d);
  const [open, setOpen] = useState<Project | "new" | null>(null);
  const [show, setShow] = useState<"active" | "done" | "archived">("active");
  const list = d.projects.filter((p) => p.status === show);
  return (
    <>
      <Toolbar>
        <Chips
          label={wt("status")}
          value={show}
          onChange={setShow}
          options={(["active", "done", "archived"] as const).map((s) => ({
            key: s,
            label: wt(`ps.${s}`),
            count: d.projects.filter((p) => p.status === s).length,
          }))}
        />
        <Btn
          variant="primary"
          size="sm"
          className="ml-auto"
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => setOpen("new")}
        >
          {wt("newProject")}
        </Btn>
      </Toolbar>
      {list.length === 0 ? (
        <Card as="div">
          <Empty title={wt("emptyProjects")} text={wt("emptyProjectsText")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            const ts = d.tasks.filter((t) => t.projectId === p.id);
            const done = ts.filter((t) => t.status === "done").length;
            const late = ts.filter((t) => isOverdue(t, d.today)).length;
            const h = ts.reduce((a, t) => a + sumHours(t), 0);
            const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
            return (
              <Card key={p.id} as="article" className="flex flex-col gap-2 p-4">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setOpen(p)}
                >
                  <h3 className="text-[16px] font-bold text-ink">{p.name}</h3>
                  {p.description ? (
                    <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">
                      {p.description}
                    </p>
                  ) : null}
                </button>
                <div
                  className="h-2 overflow-hidden rounded-full bg-mist"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-sun-deep"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                  <span>{wt("tasksDone", { d: done, n: ts.length })}</span>
                  {late ? (
                    <span className="font-semibold text-[#b42318]">
                      {wt("overdue")} {late}
                    </span>
                  ) : null}
                  {h ? <span>{numText(h, lang)} h</span> : null}
                  {p.due ? (
                    <span
                      className={cx(
                        p.status === "active" &&
                          p.due < d.today &&
                          "font-semibold text-[#b42318]",
                      )}
                    >
                      {wt("due")} {day(p.due, lang)}
                    </span>
                  ) : null}
                  {p.ownerId ? <span>{people.name(p.ownerId)}</span> : null}
                </div>
                <Btn
                  size="xs"
                  variant="quiet"
                  className="self-start"
                  onClick={() => setParams({ tab: null, project: p.id })}
                >
                  {wt("openTasks")}
                </Btn>
              </Card>
            );
          })}
        </div>
      )}
      <ProjectDialog
        d={d}
        project={open}
        onClose={() => setOpen(null)}
        reload={reload}
      />
    </>
  );
}

function ProjectDialog({
  d,
  project,
  onClose,
  reload,
}: {
  d: WorkData;
  project: Project | "new" | null;
  onClose: () => void;
  reload: () => void;
}) {
  const wt = useWT();
  const { user } = useOffice();
  const { run, busy } = useAct();
  const open = project !== null;
  const existing = project && project !== "new" ? project : null;
  const blank = {
    name: "",
    description: "",
    ownerId: user.id,
    due: "",
    status: "active" as Project["status"],
  };
  const [dr, setDr] = useState(blank);
  const [seen, setSeen] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const key = open ? existing?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open)
      setDr(
        existing
          ? {
              name: existing.name,
              description: existing.description || "",
              ownerId: existing.ownerId || "",
              due: existing.due || "",
              status: existing.status,
            }
          : blank,
      );
  }
  const up = (p: Partial<typeof dr>) => setDr((x) => ({ ...x, ...p }));
  async function save() {
    if (!dr.name.trim()) return;
    const r = await run(
      "proj",
      () =>
        saveProject(
          {
            ...dr,
            name: dr.name.trim(),
            ownerId: dr.ownerId || null,
            due: dr.due || null,
          },
          existing?.id,
        ),
      existing ? wt("saved") : wt("created"),
      { refresh: false },
    );
    if (r) {
      reload();
      onClose();
    }
  }
  return (
    <>
      <Dialog
        open={open && !del}
        onClose={onClose}
        title={existing ? wt("editProject") : wt("newProject")}
        footer={
          <>
            {existing ? (
              <Btn
                variant="quiet"
                className="mr-auto text-[#b42318]"
                icon={<ITrash className="h-4 w-4" />}
                onClick={() => setDel(true)}
              >
                {wt("delete")}
              </Btn>
            ) : null}
            <Btn variant="quiet" onClick={onClose}>
              {wt("cancel")}
            </Btn>
            <Btn
              variant="primary"
              busy={busy === "proj"}
              disabled={!dr.name.trim()}
              onClick={save}
            >
              {wt("save")}
            </Btn>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={wt("name")} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={dr.name}
                maxLength={120}
                onChange={(v) => up({ name: v })}
              />
            )}
          </Field>
          <Field label={wt("owner")}>
            {(id) => (
              <Select
                id={id}
                value={dr.ownerId}
                onChange={(v) => up({ ownerId: v })}
                options={[
                  { value: "", label: wt("nobody") },
                  ...d.people.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </Field>
          <Field label={wt("due")} optional>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={dr.due}
                onChange={(v) => up({ due: v })}
              />
            )}
          </Field>
          <Field label={wt("status")}>
            {(id) => (
              <Select
                id={id}
                value={dr.status}
                onChange={(v) => up({ status: v as Project["status"] })}
                options={(["active", "done", "archived"] as const).map((s) => ({
                  value: s,
                  label: wt(`ps.${s}`),
                }))}
              />
            )}
          </Field>
          <Field label={wt("description")} optional className="sm:col-span-2">
            {(id) => (
              <TextArea
                id={id}
                rows={3}
                value={dr.description}
                maxLength={2000}
                onChange={(v) => up({ description: v })}
              />
            )}
          </Field>
        </div>
      </Dialog>
      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title={wt("deleteProject")}
        confirmLabel={wt("delete")}
        danger
        onConfirm={async () => {
          if (!existing) return;
          if (
            await run("pdel", () => removeProject(existing.id), wt("deleted"), {
              refresh: false,
            })
          ) {
            setDel(false);
            reload();
            onClose();
          }
        }}
      />
    </>
  );
}

/* ---------------- Routines ---------------- */
function Routines({ d, reload }: { d: WorkData; reload: () => void }) {
  const wt = useWT();
  const { lang } = useT();
  const { run } = useAct();
  const people = usePeople(d);
  const [open, setOpen] = useState<Routine | "new" | null>(null);
  const when = (r: Routine) =>
    r.every === "day"
      ? wt("ev.day")
      : r.every === "week"
        ? `${wt("ev.week")}, ${weekday(addDays("2024-01-01", r.weekday - 1), lang, true)}`
        : `${wt("ev.month")}, ${wt("monthDayN", { n: r.monthDay })}`;
  return (
    <>
      <Toolbar>
        <Btn
          variant="primary"
          size="sm"
          className="ml-auto"
          icon={<IconPlus className="h-4 w-4" />}
          onClick={() => setOpen("new")}
        >
          {wt("newRoutine")}
        </Btn>
      </Toolbar>
      {d.routines.length === 0 ? (
        <Card as="div">
          <Empty title={wt("emptyRoutines")} text={wt("emptyRoutinesText")} />
        </Card>
      ) : (
        <Card as="div">
          <TableWrap label={wt("tab.routines")}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>{wt("title")}</th>
                  <th className={th}>{wt("every")}</th>
                  <th className={th}>{wt("assignee")}</th>
                  <th className={th}>{wt("project")}</th>
                  <th className={th}>{wt("status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.routines.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>
                      <button
                        type="button"
                        className="text-left font-semibold hover:underline"
                        onClick={() => setOpen(r)}
                      >
                        {r.title}
                      </button>
                      {r.lastMade ? (
                        <p className="text-[12px] text-muted">
                          {wt("lastMade", { d: day(r.lastMade, lang) })}
                        </p>
                      ) : null}
                    </td>
                    <td className={td}>{when(r)}</td>
                    <td className={td}>{people.name(r.assigneeId) || "–"}</td>
                    <td className={td}>
                      {d.projects.find((p) => p.id === r.projectId)?.name ||
                        "–"}
                    </td>
                    <td className={td}>
                      <Switch
                        checked={r.active}
                        label={r.active ? wt("active") : wt("paused")}
                        onChange={async (v) => {
                          if (
                            await run(
                              `r${r.id}`,
                              () => saveRoutine({ active: v }, r.id),
                              undefined,
                              { refresh: false },
                            )
                          )
                            reload();
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
      <RoutineDialog
        d={d}
        routine={open}
        onClose={() => setOpen(null)}
        reload={reload}
      />
    </>
  );
}

function RoutineDialog({
  d,
  routine,
  onClose,
  reload,
}: {
  d: WorkData;
  routine: Routine | "new" | null;
  onClose: () => void;
  reload: () => void;
}) {
  const wt = useWT();
  const { lang } = useT();
  const { run, busy } = useAct();
  const open = routine !== null;
  const existing = routine && routine !== "new" ? routine : null;
  const blank = {
    title: "",
    notes: "",
    projectId: "",
    assigneeId: "",
    every: "week" as Every,
    weekday: 1,
    monthDay: 1,
    checklist: "",
  };
  const [dr, setDr] = useState(blank);
  const [seen, setSeen] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const key = open ? existing?.id || "new" : null;
  if (key !== seen) {
    setSeen(key);
    if (open)
      setDr(
        existing
          ? {
              title: existing.title,
              notes: existing.notes || "",
              projectId: existing.projectId || "",
              assigneeId: existing.assigneeId || "",
              every: existing.every,
              weekday: existing.weekday,
              monthDay: existing.monthDay,
              checklist: (existing.checklist || [])
                .map((c) => c.text)
                .join("\n"),
            }
          : blank,
      );
  }
  const up = (p: Partial<typeof dr>) => setDr((x) => ({ ...x, ...p }));
  async function save() {
    if (!dr.title.trim()) return;
    const body = {
      ...dr,
      title: dr.title.trim(),
      projectId: dr.projectId || null,
      assigneeId: dr.assigneeId || null,
      checklist: dr.checklist
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((text) => ({ text, done: false })),
    };
    const r = await run(
      "rout",
      () => saveRoutine(body, existing?.id),
      existing ? wt("saved") : wt("created"),
      { refresh: false },
    );
    if (r) {
      reload();
      onClose();
    }
  }
  return (
    <>
      <Dialog
        open={open && !del}
        onClose={onClose}
        title={existing ? wt("editRoutine") : wt("newRoutine")}
        footer={
          <>
            {existing ? (
              <Btn
                variant="quiet"
                className="mr-auto text-[#b42318]"
                icon={<ITrash className="h-4 w-4" />}
                onClick={() => setDel(true)}
              >
                {wt("delete")}
              </Btn>
            ) : null}
            <Btn variant="quiet" onClick={onClose}>
              {wt("cancel")}
            </Btn>
            <Btn
              variant="primary"
              busy={busy === "rout"}
              disabled={!dr.title.trim()}
              onClick={save}
            >
              {wt("save")}
            </Btn>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={wt("title")} className="sm:col-span-2">
            {(id) => (
              <Input
                id={id}
                value={dr.title}
                maxLength={200}
                onChange={(v) => up({ title: v })}
              />
            )}
          </Field>
          <Field label={wt("every")}>
            {(id) => (
              <Select
                id={id}
                value={dr.every}
                onChange={(v) => up({ every: v as Every })}
                options={(["day", "week", "month"] as const).map((e) => ({
                  value: e,
                  label: wt(`ev.${e}`),
                }))}
              />
            )}
          </Field>
          {dr.every === "week" ? (
            <Field label={wt("weekday")}>
              {(id) => (
                <Select
                  id={id}
                  value={String(dr.weekday)}
                  onChange={(v) => up({ weekday: Number(v) })}
                  options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                    value: String(n),
                    label: weekday(addDays("2024-01-01", n - 1), lang, true),
                  }))}
                />
              )}
            </Field>
          ) : dr.every === "month" ? (
            <Field label={wt("monthDay")}>
              {(id) => (
                <Select
                  id={id}
                  value={String(dr.monthDay)}
                  onChange={(v) => up({ monthDay: Number(v) })}
                  options={Array.from({ length: 28 }, (_, i) => ({
                    value: String(i + 1),
                    label: String(i + 1),
                  }))}
                />
              )}
            </Field>
          ) : (
            <div />
          )}
          <Field label={wt("assignee")}>
            {(id) => (
              <Select
                id={id}
                value={dr.assigneeId}
                onChange={(v) => up({ assigneeId: v })}
                options={[
                  { value: "", label: wt("nobody") },
                  ...d.people.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </Field>
          <Field label={wt("project")} optional>
            {(id) => (
              <Select
                id={id}
                value={dr.projectId}
                onChange={(v) => up({ projectId: v })}
                options={[
                  { value: "", label: wt("f.noProject") },
                  ...d.projects
                    .filter(
                      (p) => p.status === "active" || p.id === dr.projectId,
                    )
                    .map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </Field>
          <Field label={wt("checklist")} optional className="sm:col-span-2">
            {(id) => (
              <TextArea
                id={id}
                rows={3}
                value={dr.checklist}
                onChange={(v) => up({ checklist: v })}
              />
            )}
          </Field>
          <Field label={wt("notes")} optional className="sm:col-span-2">
            {(id) => (
              <TextArea
                id={id}
                rows={2}
                value={dr.notes}
                maxLength={2000}
                onChange={(v) => up({ notes: v })}
              />
            )}
          </Field>
        </div>
      </Dialog>
      <Confirm
        open={del}
        onClose={() => setDel(false)}
        title={wt("deleteRoutine")}
        confirmLabel={wt("delete")}
        danger
        onConfirm={async () => {
          if (!existing) return;
          if (
            await run("rdel", () => removeRoutine(existing.id), wt("deleted"), {
              refresh: false,
            })
          ) {
            setDel(false);
            reload();
            onClose();
          }
        }}
      />
    </>
  );
}

/* ---------------- Workload ---------------- */
function Workload({ d }: { d: WorkData }) {
  const wt = useWT();
  const { lang } = useT();
  const [start, setStart] = useState(() => mondayOf(d.today));
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const logged = d.tasks.flatMap((t) => t.hours || []);
  const rows = d.people.map((p) => {
    const per = days.map((dd) =>
      logged
        .filter((h) => h.userId === p.id && h.date === dd)
        .reduce((a, h) => a + h.hours, 0),
    );
    const mine = d.tasks.filter(
      (t) => t.assigneeId === p.id && t.status !== "done",
    );
    return {
      p,
      per,
      total: per.reduce((a, b) => a + b, 0),
      open: mine.length,
      late: mine.filter((t) => isOverdue(t, d.today)).length,
    };
  });
  const fmt = (n: number) => (n ? numText(n, lang) : "–");
  return (
    <>
      <Toolbar>
        <IconBtn
          label={wt("prevWeek")}
          onClick={() => setStart(addDays(start, -7))}
        >
          <ILeft className="h-4 w-4" />
        </IconBtn>
        <span className="min-w-[6rem] text-center text-[14px] font-semibold">
          {wt("week", { n: isoWeek(start) })}
        </span>
        <IconBtn
          label={wt("nextWeek")}
          onClick={() => setStart(addDays(start, 7))}
        >
          <IRight className="h-4 w-4" />
        </IconBtn>
        {start !== mondayOf(d.today) ? (
          <Btn
            size="sm"
            variant="quiet"
            onClick={() => setStart(mondayOf(d.today))}
          >
            {wt("thisWeek")}
          </Btn>
        ) : null}
      </Toolbar>
      <Card as="div">
        <TableWrap label={wt("tab.workload")}>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>{wt("person")}</th>
                {days.map((dd) => (
                  <th
                    key={dd}
                    className={cx(
                      th,
                      "text-right",
                      dd === d.today && "text-ink",
                    )}
                  >
                    {day(dd, lang)}
                  </th>
                ))}
                <th className={cx(th, "text-right")}>{wt("total")}</th>
                <th className={cx(th, "text-right")}>{wt("open")}</th>
                <th className={cx(th, "text-right")}>{wt("overdue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td className={cx(td, "font-semibold whitespace-nowrap")}>
                    {r.p.name}
                  </td>
                  {r.per.map((h, i) => (
                    <td
                      key={i}
                      className={cx(
                        td,
                        "text-right tabular-nums",
                        !h && "text-muted",
                      )}
                    >
                      {fmt(h)}
                    </td>
                  ))}
                  <td
                    className={cx(td, "text-right font-semibold tabular-nums")}
                  >
                    {fmt(r.total)}
                  </td>
                  <td className={cx(td, "text-right tabular-nums")}>
                    {r.open || "–"}
                  </td>
                  <td
                    className={cx(
                      td,
                      "text-right tabular-nums",
                      r.late > 0 && "font-semibold text-[#b42318]",
                    )}
                  >
                    {r.late || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
