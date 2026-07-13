"use client";

// Continuous monitoring queue UI (spec 2026-07-13_continuous-monitoring-queue-v1-spec.md,
// sections 6 client-side + 7). A header chip plus a tracker-styled collapsible panel where the
// user grills a harvested candidate into a real task or dismisses it. Grilling stays the only
// path from candidate to task; nothing here writes to the board directly. The parent
// (interactive-memory-studio) owns all fetches and the grill state machine; this file is
// presentation plus two callbacks.

import {
  CalendarDays,
  ChevronDown,
  FileText,
  Link2,
  Mail,
  MessageCircle,
  MessageCircleQuestion,
  PencilLine,
  Ticket,
  Video,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import { MOTION } from "@/lib/interactive-memory/motion";
import type {
  QueueFile,
  QueueItem,
  QueueSweepMeta,
  SourceKind,
  SourceRef,
} from "@/lib/interactive-memory/types";
import { cn } from "@/lib/utils";

const SOURCE_CHIP_META: Record<
  SourceKind,
  { label: string; icon: typeof MessageCircle; className: string }
> = {
  slack: { label: "Slack", icon: MessageCircle, className: "source-slack" },
  jira: { label: "Jira", icon: Ticket, className: "source-jira" },
  gmail: { label: "Gmail", icon: Mail, className: "source-gmail" },
  calendar: { label: "Calendar", icon: CalendarDays, className: "source-calendar" },
  meeting: { label: "Meeting", icon: Video, className: "source-meeting" },
  doc: { label: "Doc", icon: FileText, className: "source-doc" },
  manual: { label: "Manual", icon: PencilLine, className: "source-manual" },
};

// The queued lane counts only items still awaiting triage (spec 7). Dismissed/consumed items stay
// in the file for merge/re-ask bookkeeping but never render.
export function getQueuedItems(queue: QueueFile | undefined): QueueItem[] {
  if (!queue) return [];
  return queue.items.filter((item) => item.status === "queued");
}

// Any sweep source reported as failed lights the header warning dot and keeps the panel visible
// even when the queue is empty, so a broken connector is never silent (spec 7).
export function hasFailedSweepSource(sweep: QueueSweepMeta | undefined): boolean {
  return Boolean(sweep?.sources.some((source) => source.status === "failed"));
}

// One chip per distinct SourceKind, in first-seen order (spec 7 row layout).
export function distinctSourceKinds(sourceRefs: SourceRef[]): SourceKind[] {
  const seen = new Set<SourceKind>();
  const kinds: SourceKind[] = [];
  for (const ref of sourceRefs) {
    if (!seen.has(ref.kind)) {
      seen.add(ref.kind);
      kinds.push(ref.kind);
    }
  }
  return kinds;
}

// Grill-from-queue start body (spec 6/7): a create-mode grill carrying the queue item id so the
// server can seed the interview from the harvested context. No user intent is typed here; the
// server folds title/summary/context/sources into the create-mode intent.
export function buildQueueGrillStartBody(queueItemId: string): {
  mode: "create";
  queueItemId: string;
} {
  return { mode: "create", queueItemId };
}

function formatClockTime(iso: string, timeZone: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(time));
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string, timeZone: string): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return iso;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone,
    }).format(new Date(time));
  } catch {
    return iso;
  }
}

// Muted single-line health footer (spec 7): "last sweep <local time> · <source> ok/failed ...",
// or "no sweeps yet" when no sweep has landed.
export function formatSweepFooter(sweep: QueueSweepMeta | undefined, timeZone: string): string {
  if (!sweep?.lastSweepAt) return "no sweeps yet";
  const when = formatClockTime(sweep.lastSweepAt, timeZone);
  const sources = sweep.sources
    .map((source) => `${SOURCE_CHIP_META[source.source].label} ${source.status}`)
    .join(" · ");
  return sources ? `last sweep ${when} · ${sources}` : `last sweep ${when}`;
}

// Header chip (spec 7): "Queue · N" with a warning dot on any failed source. The parent renders it
// only when N > 0 or a source failed; the internal guard keeps it safe to mount unconditionally.
export function StudioQueueChip({
  count,
  hasFailedSource,
  onOpen,
}: {
  count: number;
  hasFailedSource: boolean;
  onOpen: () => void;
}) {
  if (count === 0 && !hasFailedSource) return null;
  return (
    <button
      className={cn("studio-queue-chip", hasFailedSource && "studio-queue-chip-warning")}
      onClick={onOpen}
      title={
        hasFailedSource
          ? "Monitoring queue: a sweep source failed"
          : "Monitoring queue: candidates awaiting triage"
      }
      type="button"
    >
      <MessageCircleQuestion className="h-4 w-4" />
      <span>Queue · {count}</span>
      {hasFailedSource ? <span aria-hidden="true" className="studio-queue-chip-dot" /> : null}
    </button>
  );
}

export function QueuePanel({
  collapsed,
  containerRef,
  grillEnabled,
  items,
  onDismiss,
  onGrill,
  onToggleCollapsed,
  sweep,
  timeZone,
}: {
  collapsed: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  grillEnabled: boolean;
  items: QueueItem[];
  onDismiss: (item: QueueItem) => void;
  onGrill: (item: QueueItem) => void;
  onToggleCollapsed: () => void;
  sweep: QueueSweepMeta;
  timeZone: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const bodyCollapsed = prefersReducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 };
  const bodyExpanded = prefersReducedMotion ? { opacity: 1 } : { opacity: 1, height: "auto" };
  const bodyTransition = {
    duration: prefersReducedMotion ? 0.1 : MOTION.duration.card,
    ease: MOTION.ease.out,
  };
  const footer = formatSweepFooter(sweep, timeZone);
  const bodyKey = collapsed ? "collapsed" : items.length > 0 ? "list" : "empty";

  return (
    <section
      aria-label="Continuous monitoring queue"
      className={cn("monitoring-queue", collapsed && "monitoring-queue-collapsed")}
      ref={containerRef}
    >
      <div className="monitoring-queue-head">
        <button
          aria-expanded={!collapsed}
          className="monitoring-queue-toggle"
          onClick={onToggleCollapsed}
          type="button"
        >
          <ChevronDown className="h-4 w-4" />
          <span>
            <span className="studio-kicker">Captured between mornings</span>
            <strong>Monitoring queue</strong>
          </span>
        </button>
        <div className="monitoring-queue-actions">
          <span className="monitoring-queue-count">{items.length}</span>
        </div>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {bodyKey === "list" ? (
          <motion.div
            animate={bodyExpanded}
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="list"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            <ul className="monitoring-queue-list">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    animate={{ opacity: 1, y: 0 }}
                    className="monitoring-queue-item"
                    exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -6 }}
                    initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 6 }}
                    key={item.id}
                    transition={bodyTransition}
                  >
                    <QueueItemRow
                      grillEnabled={grillEnabled}
                      item={item}
                      onDismiss={onDismiss}
                      onGrill={onGrill}
                      timeZone={timeZone}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <p className="monitoring-queue-footer">{footer}</p>
          </motion.div>
        ) : bodyKey === "empty" ? (
          <motion.div
            animate={bodyExpanded}
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="empty"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            <p className="monitoring-queue-empty">No captured candidates awaiting triage.</p>
            <p className="monitoring-queue-footer">{footer}</p>
          </motion.div>
        ) : (
          <motion.p
            animate={bodyExpanded}
            className="monitoring-queue-empty"
            exit={bodyCollapsed}
            initial={bodyCollapsed}
            key="collapsed-summary"
            style={{ overflow: "hidden" }}
            transition={bodyTransition}
          >
            {items.length === 1
              ? "1 candidate collapsed."
              : `${items.length} candidates collapsed.`}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}

function QueueItemRow({
  grillEnabled,
  item,
  onDismiss,
  onGrill,
  timeZone,
}: {
  grillEnabled: boolean;
  item: QueueItem;
  onDismiss: (item: QueueItem) => void;
  onGrill: (item: QueueItem) => void;
  timeZone: string;
}) {
  const kinds = distinctSourceKinds(item.sourceRefs);
  return (
    <div className="monitoring-queue-item-body">
      <div className="monitoring-queue-item-top">
        <strong className="monitoring-queue-item-title">{item.title}</strong>
        {kinds.length > 0 ? (
          <div className="monitoring-queue-item-sources">
            {kinds.map((kind) => {
              const meta = SOURCE_CHIP_META[kind];
              const Icon = meta.icon;
              return (
                <span className={cn("source-chip", meta.className)} key={kind}>
                  <Icon className="h-3.5 w-3.5" />
                  <span>{meta.label}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {item.summary.trim() ? (
        <p className="monitoring-queue-item-summary">{item.summary.trim()}</p>
      ) : null}

      {item.matchedTask || item.dismissedBefore ? (
        <div className="monitoring-queue-item-flags">
          {item.matchedTask ? (
            <span className="monitoring-queue-flag monitoring-queue-flag-match">
              <Link2 className="h-3 w-3" />
              possible match: {item.matchedTask.title}
            </span>
          ) : null}
          {item.dismissedBefore ? (
            <span className="monitoring-queue-flag monitoring-queue-flag-dismissed">
              dismissed before {formatShortDate(item.dismissedBefore.at, timeZone)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="monitoring-queue-item-buttons">
        <button
          className="monitoring-queue-grill"
          disabled={!grillEnabled}
          onClick={() => onGrill(item)}
          title={grillEnabled ? "Grill this candidate into a ticket" : "Grilling is disabled"}
          type="button"
        >
          <MessageCircleQuestion className="h-3.5 w-3.5" />
          Grill
        </button>
        <button
          className="monitoring-queue-dismiss"
          onClick={() => onDismiss(item)}
          title="Dismiss this candidate"
          type="button"
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>
      </div>
    </div>
  );
}
