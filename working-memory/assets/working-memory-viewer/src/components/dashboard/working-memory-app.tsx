"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Circle,
  Clock3,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  TableProperties,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { cn } from "@/lib/utils";
import type {
  CommunicationItem,
  CommunicationRisk,
  CommunicationState,
  DailyNote,
  SectionKind,
  TaskItem,
  WorkingMemoryDataset,
} from "@/lib/working-memory/types";

type View = "today" | "comms" | "history";
type Tone = "accent" | "focus" | "comms" | "waiting" | "warning" | "critical" | "closed";
type EvidenceSelection =
  | { kind: "note"; id: string }
  | { kind: "task"; id: string }
  | { kind: "comm"; id: string };

const VIEW_META: Record<View, { label: string; icon: ComponentType<{ className?: string }> }> = {
  today: { label: "Today", icon: TableProperties },
  comms: { label: "Comms", icon: MessageSquareWarning },
  history: { label: "History", icon: Archive },
};

const VIEW_COLORS: Record<View, string> = {
  today: "var(--focus)",
  comms: "var(--comms)",
  history: "var(--accent)",
};

const COMM_STATE_COLORS: Record<CommunicationState, string> = {
  owed_by_me: "var(--comms)",
  waiting_on_others: "var(--waiting)",
  monitor: "var(--accent)",
  closed: "var(--closed)",
  source_gap: "var(--critical)",
};

const COMM_TABS: Array<{ label: string; state: CommunicationState }> = [
  { label: "Owed by me", state: "owed_by_me" },
  { label: "Waiting", state: "waiting_on_others" },
  { label: "Monitor", state: "monitor" },
  { label: "Closed", state: "closed" },
  { label: "Source gaps", state: "source_gap" },
];

export function WorkingMemoryApp({ dataset }: { dataset: WorkingMemoryDataset }) {
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState(
    dataset.latestDate || dataset.notes[0]?.date || "",
  );
  const [query, setQuery] = useState("");
  const [commState, setCommState] = useState<CommunicationState>("owed_by_me");
  const [selection, setSelection] = useState<EvidenceSelection>({
    kind: "note",
    id: selectedDate,
  });
  const deferredQuery = useDeferredValue(query);
  const selectedNote =
    dataset.notes.find((note) => note.date === selectedDate) || dataset.notes[0] || undefined;
  const latestNote = dataset.notes[0];

  const filteredComms = useMemo(
    () =>
      dataset.comms.filter((comm) => {
        if (comm.state !== commState) return false;
        return matchesQuery(comm, deferredQuery);
      }),
    [commState, dataset.comms, deferredQuery],
  );

  const historyNotes = useMemo(
    () =>
      dataset.notes.filter((note) => {
        if (!deferredQuery.trim()) return true;
        const haystack = [
          note.date,
          note.title,
          note.frontmatter.deepWork,
          note.frontmatter.status,
          ...note.tasks.map((task) => task.title),
          ...note.trackers.map((tracker) => tracker.title),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(deferredQuery.toLowerCase());
      }),
    [dataset.notes, deferredQuery],
  );

  const selectedEvidence = useMemo(
    () => resolveEvidence(selection, dataset, selectedNote),
    [dataset, selectedNote, selection],
  );

  const sourceHealth = getSourceHealth(latestNote);

  return (
    <div className="app-grid">
      <aside className="rail flex flex-col items-center gap-3 px-2 py-4">
        <div className="brand-mark mb-4 flex h-10 w-10 items-center justify-center rounded-md text-xs font-black">
          WM
        </div>
        {(Object.keys(VIEW_META) as View[]).map((key) => {
          const Icon = VIEW_META[key].icon;
          const active = view === key;
          return (
            <button
              aria-label={VIEW_META[key].label}
              aria-pressed={active}
              className={cn(
                "nav-button flex h-11 w-11 items-center justify-center rounded-md transition",
                active && "nav-button-active",
              )}
              key={key}
              onClick={() => setView(key)}
              style={navStyle(VIEW_COLORS[key])}
              title={VIEW_META[key].label}
              type="button"
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </aside>

      <main className="flex min-w-0 flex-col overflow-hidden">
        <header className="command-bar flex shrink-0 items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Working Memory</div>
            <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
              {VIEW_META[view].label}
            </h1>
          </div>
          <CommandMetric label="Focus" tone="focus" value={latestNote?.stats.coreOpen ?? 0} />
          <CommandMetric
            label="Comms"
            tone="comms"
            value={
              dataset.comms.filter((comm) => comm.state !== "closed" && comm.risk !== "none").length
            }
          />
          <CommandMetric
            label="Loops"
            tone="accent"
            value={dataset.comms.filter((comm) => comm.state === "owed_by_me").length}
          />
          <label className="control flex min-w-[170px] items-center gap-2 rounded-md px-3 py-2 text-xs">
            <Clock3 className="h-4 w-4" />
            <select
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setSelection({ kind: "note", id: event.target.value });
              }}
              value={selectedDate}
            >
              {dataset.notes.map((note) => (
                <option key={note.date} value={note.date}>
                  {note.date}
                </option>
              ))}
            </select>
          </label>
          <label className="control flex w-[320px] items-center gap-2 rounded-md px-3 py-2">
            <Search className="h-4 w-4" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Jira, people, text"
              value={query}
            />
          </label>
          <div
            className={cn(
              "signal-chip flex items-center gap-2",
              sourceHealth.clean ? "chip-closed" : "chip-critical",
            )}
            title={sourceHealth.label}
          >
            {sourceHealth.clean ? (
              <ShieldCheck className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {sourceHealth.label}
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-auto">
          {view === "today" && selectedNote ? (
            <TodayView
              comms={dataset.comms}
              note={selectedNote}
              onSelect={(nextSelection) => setSelection(nextSelection)}
            />
          ) : null}
          {view === "comms" ? (
            <CommsView
              activeState={commState}
              comms={filteredComms}
              counts={countCommsByState(dataset.comms)}
              onSelect={(comm) => setSelection({ kind: "comm", id: comm.id })}
              onStateChange={setCommState}
            />
          ) : null}
          {view === "history" ? (
            <HistoryView
              comms={dataset.comms}
              notes={historyNotes}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelection({ kind: "note", id: date });
                setView("today");
              }}
            />
          ) : null}
        </section>
      </main>

      <aside className="inspector evidence-panel flex min-w-0 flex-col overflow-hidden">
        <Inspector evidence={selectedEvidence} />
      </aside>
    </div>
  );
}

function TodayView({
  note,
  comms,
  onSelect,
}: {
  note: DailyNote;
  comms: CommunicationItem[];
  onSelect: (selection: EvidenceSelection) => void;
}) {
  const tasksBySection = groupTasks(note.tasks);
  const todayRiskComms = comms.filter(
    (comm) => comm.lastSeen === note.date && comm.state !== "closed" && comm.risk !== "none",
  );
  const notesSection = note.sections.find((section) => section.kind === "notes");
  const orderBlock = notesSection
    ? extractPseudoBlock(notesSection.rawMarkdown, "Order of operations")
    : "";

  return (
    <div className="space-y-4 p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_280px] gap-4">
        <section className="mission-band rounded-md border p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="eyebrow">
                {note.date} / {note.frontmatter.status || "unknown"}
              </div>
              <h2 className="mt-1 line-clamp-2 text-2xl font-black text-[var(--text-primary)]">
                {note.frontmatter.deepWork || note.title}
              </h2>
            </div>
            <div className="metric-strip grid shrink-0 grid-cols-3 gap-2 text-center">
              <Metric
                label="Done"
                tone="closed"
                value={note.stats.frontmatterCompleted ?? note.stats.coreDone}
              />
              <Metric
                label="Total"
                tone="focus"
                value={note.stats.frontmatterTotal ?? note.stats.coreTotal}
              />
              <Metric label="Risk" tone="comms" value={note.stats.commRiskCount} />
            </div>
          </div>
          {note.parseWarnings.length ? (
            <div className="mt-3 rounded-md border border-[var(--warning)] bg-[rgba(255,209,102,0.14)] px-3 py-2 text-xs font-semibold text-[var(--warning)]">
              {note.parseWarnings[0]}
            </div>
          ) : null}
        </section>

        <section className="comms-band rounded-md border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="section-title text-sm">Communication Risk</h3>
            <span className="text-xs text-[var(--text-tertiary)]">
              {todayRiskComms.length} active
            </span>
          </div>
          <div className="space-y-2">
            {todayRiskComms.slice(0, 5).map((comm) => (
              <button
                className="block w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--comms)] hover:bg-[var(--surface-muted)]"
                key={comm.id}
                onClick={() => onSelect({ kind: "comm", id: comm.id })}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <RiskPill risk={comm.risk} />
                  <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                    {stateLabel(comm.state)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {comm.title}
                </p>
              </button>
            ))}
            {!todayRiskComms.length ? (
              <div className="rounded-md border border-[var(--closed)] bg-[rgba(46,242,160,0.12)] px-3 py-2 text-xs font-semibold text-[var(--closed)]">
                No active comm risk in this note.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="panel overflow-hidden">
        <table className="work-table">
          <thead>
            <tr>
              <th className="w-[120px]">Section</th>
              <th>Item</th>
              <th className="w-[100px]">Age</th>
              <th className="w-[150px]">Jira</th>
              <th className="w-[170px]">Source</th>
            </tr>
          </thead>
          <tbody>
            {(["focus", "tasks", "quick"] as SectionKind[]).flatMap((section) =>
              (tasksBySection[section] || []).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onSelect={() => onSelect({ kind: "task", id: task.id })}
                />
              )),
            )}
          </tbody>
        </table>
      </section>

      {orderBlock ? (
        <section className="panel p-4">
          <h3 className="section-title mb-2 text-sm">Order Of Operations</h3>
          <MarkdownView compact markdown={orderBlock} />
        </section>
      ) : null}
    </div>
  );
}

function CommsView({
  activeState,
  comms,
  counts,
  onSelect,
  onStateChange,
}: {
  activeState: CommunicationState;
  comms: CommunicationItem[];
  counts: Record<CommunicationState, number>;
  onSelect: (comm: CommunicationItem) => void;
  onStateChange: (state: CommunicationState) => void;
}) {
  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap gap-2">
        {COMM_TABS.map((tab) => (
          <button
            className={cn(
              "state-tab px-3 py-2 text-sm font-bold transition",
              activeState === tab.state && "state-tab-active",
            )}
            key={tab.state}
            onClick={() => onStateChange(tab.state)}
            style={tabStyle(COMM_STATE_COLORS[tab.state])}
            type="button"
          >
            {tab.label} <span className="ml-1 text-xs opacity-70">{counts[tab.state] || 0}</span>
          </button>
        ))}
      </div>
      <section className="panel overflow-hidden">
        <table className="work-table">
          <thead>
            <tr>
              <th className="w-[110px]">Risk</th>
              <th>Thread / Ask</th>
              <th className="w-[110px]">Age</th>
              <th className="w-[110px]">Source</th>
              <th className="w-[130px]">Confidence</th>
              <th className="w-[120px]">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {comms.map((comm) => (
              <tr className={commRowClass(comm)} key={comm.id} style={rowStyleForComm(comm)}>
                <td>
                  <RiskPill risk={comm.risk} />
                </td>
                <td>
                  <button
                    className="line-clamp-2 text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                    onClick={() => onSelect(comm)}
                    type="button"
                  >
                    {comm.title}
                  </button>
                  <div className="mt-1 text-xs text-[var(--text-tertiary)]">{comm.reason}</div>
                </td>
                <td>{commAge(comm)}</td>
                <td className="capitalize">{comm.sourceType}</td>
                <td>
                  <span className="rounded-md border border-[var(--border)] px-2 py-1 text-xs capitalize">
                    {comm.confidence}
                  </span>
                </td>
                <td>
                  <button
                    className="rounded-md border border-[var(--accent)] px-2 py-1 text-xs font-bold text-[var(--accent)] transition hover:bg-[var(--accent-soft)]"
                    onClick={() => onSelect(comm)}
                    type="button"
                  >
                    lines {comm.lineRange[0]}-{comm.lineRange[1]}
                  </button>
                </td>
              </tr>
            ))}
            {!comms.length ? (
              <tr>
                <td className="text-sm text-[var(--text-tertiary)]" colSpan={6}>
                  No communication items match this tab and search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function HistoryView({
  notes,
  comms,
  onSelectDate,
}: {
  notes: DailyNote[];
  comms: CommunicationItem[];
  onSelectDate: (date: string) => void;
}) {
  const commRiskByDate = new Map<string, number>();
  for (const comm of comms) {
    if (comm.state !== "closed" && comm.risk !== "none") {
      commRiskByDate.set(comm.lastSeen, (commRiskByDate.get(comm.lastSeen) || 0) + 1);
    }
  }

  return (
    <div className="space-y-4 p-5">
      <section className="panel overflow-hidden">
        <table className="work-table">
          <thead>
            <tr>
              <th className="w-[120px]">Date</th>
              <th className="w-[110px]">Status</th>
              <th>Focus</th>
              <th className="w-[110px]">Done</th>
              <th className="w-[110px]">Comms</th>
              <th className="w-[130px]">Source</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note) => {
              const sourceHealth = getSourceHealth(note);
              return (
                <tr key={note.date}>
                  <td>
                    <button
                      className="font-bold text-[var(--accent)] hover:underline"
                      onClick={() => onSelectDate(note.date)}
                      type="button"
                    >
                      {note.date}
                    </button>
                  </td>
                  <td>{note.frontmatter.status || "unknown"}</td>
                  <td className="max-w-[520px]">
                    <div className="line-clamp-2 font-medium text-[var(--text-primary)]">
                      {note.frontmatter.deepWork || note.title}
                    </div>
                  </td>
                  <td>
                    {note.stats.frontmatterCompleted ?? note.stats.coreDone}/
                    {note.stats.frontmatterTotal ?? note.stats.coreTotal}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          commRiskByDate.get(note.date)
                            ? "bg-[var(--comms)]"
                            : "bg-[var(--border-strong)]",
                        )}
                      />
                      {commRiskByDate.get(note.date) || 0} risk
                    </div>
                  </td>
                  <td>
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-bold",
                        sourceHealth.clean
                          ? "bg-[rgba(46,242,160,0.14)] text-[var(--closed)]"
                          : "bg-[rgba(255,90,106,0.14)] text-[var(--critical)]",
                      )}
                    >
                      {sourceHealth.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Inspector({ evidence }: { evidence: ResolvedEvidence }) {
  return (
    <>
      <div className="border-b border-[var(--border)] bg-[#07090d] px-4 py-3">
        <div className="eyebrow">Evidence</div>
        <h2 className="mt-1 line-clamp-2 text-base font-black text-[var(--text-primary)]">
          {evidence.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
          <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono">
            {evidence.date}
          </span>
          <span className="rounded-md border border-[var(--accent)] px-2 py-1 font-mono text-[var(--accent)]">
            lines {evidence.lineRange[0]}-{evidence.lineRange[1]}
          </span>
          <span className="rounded-md border border-[var(--border)] px-2 py-1">
            {evidence.kind}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {evidence.reason ? (
          <div className="mb-3 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
            {evidence.reason}
          </div>
        ) : null}
        <MarkdownView markdown={evidence.markdown} readable />
      </div>
    </>
  );
}

function TaskRow({ task, onSelect }: { task: TaskItem; onSelect: () => void }) {
  return (
    <tr className="row-waiting" style={taskRowStyle(task.section)}>
      <td>
        <div className="flex items-center gap-2">
          {task.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-[var(--closed)]" />
          ) : (
            <Circle className="h-4 w-4 text-[var(--text-tertiary)]" />
          )}
          <span className="capitalize">{task.section}</span>
        </div>
      </td>
      <td>
        <button
          className="line-clamp-2 text-left font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
          onClick={onSelect}
          type="button"
        >
          {task.title}
        </button>
      </td>
      <td>{task.ageMarker || "-"}</td>
      <td>{task.jiraKeys.length ? task.jiraKeys.join(", ") : "-"}</td>
      <td className="max-w-[170px] truncate">{task.details.Source?.[0] || "-"}</td>
    </tr>
  );
}

function CommandMetric({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div
      className="metric-tile hidden min-w-[76px] px-3 py-2 text-center xl:block"
      style={toneStyle(tone)}
    >
      <div className="metric-value text-base font-black" style={{ color: colorForTone(tone) }}>
        {value}
      </div>
      <div className="metric-label eyebrow text-[10px]">{label}</div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="metric-tile min-w-[76px] px-3 py-2" style={toneStyle(tone)}>
      <div className="metric-value text-lg font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="metric-label eyebrow">{label}</div>
    </div>
  );
}

function RiskPill({ risk }: { risk: CommunicationRisk }) {
  return <span className={cn("signal-chip", riskClass(risk))}>{risk}</span>;
}

function riskClass(risk: CommunicationRisk) {
  if (risk === "critical") return "chip-critical";
  if (risk === "warning") return "chip-warning";
  if (risk === "stale") return "chip-stale";
  return "chip-none";
}

function navStyle(color: string) {
  return cssVars({
    "--nav-color": color,
    "--nav-glow": softColor(color),
  });
}

function tabStyle(color: string) {
  return cssVars({
    "--tab-color": color,
    "--tab-glow": softColor(color),
  });
}

function toneStyle(tone: Tone) {
  const color = colorForTone(tone);
  return cssVars({
    borderColor: color,
    boxShadow: `inset 0 1px 0 ${softColor(color)}`,
  });
}

function taskRowStyle(section: SectionKind) {
  const color =
    section === "focus" ? "var(--focus)" : section === "quick" ? "var(--accent)" : "var(--waiting)";
  return cssVars({
    "--row-color": color,
  });
}

function commRowClass(comm: CommunicationItem) {
  if (comm.state === "closed") return "row-closed";
  if (comm.state === "waiting_on_others") return "row-waiting";
  if (comm.risk === "critical") return "row-critical";
  if (comm.risk === "warning") return "row-warning";
  if (comm.risk === "stale") return "row-stale";
  return "row-waiting";
}

function rowStyleForComm(comm: CommunicationItem) {
  const color =
    comm.state === "closed"
      ? "var(--closed)"
      : comm.state === "waiting_on_others"
        ? "var(--waiting)"
        : riskColor(comm.risk);
  return cssVars({
    "--row-color": color,
  });
}

function riskColor(risk: CommunicationRisk) {
  if (risk === "critical") return "var(--critical)";
  if (risk === "warning") return "var(--warning)";
  if (risk === "stale") return "#f6a94b";
  return "var(--accent)";
}

function colorForTone(tone: Tone) {
  if (tone === "focus") return "var(--focus)";
  if (tone === "comms") return "var(--comms)";
  if (tone === "waiting") return "var(--waiting)";
  if (tone === "warning") return "var(--warning)";
  if (tone === "critical") return "var(--critical)";
  if (tone === "closed") return "var(--closed)";
  return "var(--accent)";
}

function softColor(color: string) {
  if (color.includes("focus")) return "rgba(183, 243, 74, 0.18)";
  if (color.includes("comms")) return "rgba(255, 75, 200, 0.18)";
  if (color.includes("waiting")) return "rgba(157, 123, 255, 0.18)";
  if (color.includes("warning")) return "rgba(255, 209, 102, 0.18)";
  if (color.includes("critical")) return "rgba(255, 90, 106, 0.18)";
  if (color.includes("closed")) return "rgba(46, 242, 160, 0.18)";
  return "rgba(0, 212, 255, 0.18)";
}

function cssVars(vars: Record<string, string>) {
  return vars as CSSProperties;
}

function groupTasks(tasks: TaskItem[]) {
  return tasks.reduce<Record<string, TaskItem[]>>((groups, task) => {
    groups[task.section] ||= [];
    groups[task.section].push(task);
    return groups;
  }, {});
}

function countCommsByState(comms: CommunicationItem[]) {
  return comms.reduce(
    (counts, comm) => {
      counts[comm.state] = (counts[comm.state] || 0) + 1;
      return counts;
    },
    {
      owed_by_me: 0,
      waiting_on_others: 0,
      monitor: 0,
      closed: 0,
      source_gap: 0,
    } satisfies Record<CommunicationState, number>,
  );
}

function matchesQuery(comm: CommunicationItem, query: string) {
  if (!query.trim()) return true;
  const lowerQuery = query.toLowerCase();
  return [comm.title, comm.evidence, comm.sourceType, comm.state, comm.reason]
    .join(" ")
    .toLowerCase()
    .includes(lowerQuery);
}

function commAge(comm: CommunicationItem) {
  if (comm.ageDays === undefined || comm.ageDays === 0) return comm.lastSeen;
  return `${comm.ageDays}d`;
}

function stateLabel(state: CommunicationState) {
  return state.replaceAll("_", " ");
}

function getSourceHealth(note: DailyNote | undefined) {
  if (!note) return { clean: false, label: "No notes" };
  if (!note.sourceGaps.length) return { clean: true, label: "No source gap" };
  const clean = note.sourceGaps.every((gap) => gap.clean);
  return { clean, label: clean ? "Sources clean" : "Source gap" };
}

function extractPseudoBlock(markdown: string, label: string) {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    line.toLowerCase().includes(`**${label.toLowerCase()}:**`),
  );
  if (startIndex < 0) return "";
  const blockLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^\*\*.+\*\*/.test(line.trim())) break;
    if (line.trim()) blockLines.push(line);
  }
  return blockLines.join("\n").trim();
}

type ResolvedEvidence = {
  kind: string;
  title: string;
  date: string;
  lineRange: [number, number];
  reason?: string;
  markdown: string;
};

function resolveEvidence(
  selection: EvidenceSelection,
  dataset: WorkingMemoryDataset,
  fallbackNote: DailyNote | undefined,
): ResolvedEvidence {
  if (selection.kind === "comm") {
    const comm = dataset.comms.find((item) => item.id === selection.id);
    if (comm) {
      return {
        kind: stateLabel(comm.state),
        title: comm.title,
        date: comm.lastSeen,
        lineRange: comm.lineRange,
        reason: `${comm.reason} Confidence: ${comm.confidence}.`,
        markdown: comm.evidence,
      };
    }
  }

  if (selection.kind === "task") {
    const task = dataset.notes
      .flatMap((note) => note.tasks)
      .find((item) => item.id === selection.id);
    if (task) {
      return {
        kind: task.section,
        title: task.title,
        date: task.date,
        lineRange: task.lineRange,
        markdown: task.rawMarkdown,
      };
    }
  }

  const note =
    dataset.notes.find((item) => item.date === selection.id) || fallbackNote || dataset.notes[0];
  return {
    kind: "note",
    title: note?.title || "No note selected",
    date: note?.date || "-",
    lineRange: [1, note?.rawMarkdown.split(/\r?\n/).length || 1],
    reason: note
      ? `${note.tasks.length} tasks, ${note.trackers.length} trackers parsed.`
      : undefined,
    markdown: note?.rawMarkdown || "No Working Memory note was found.",
  };
}
