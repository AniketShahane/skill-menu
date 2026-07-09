"use client";

// Grill v2 chat drawer (spec 2026-07-08_grill-v2-chat-first-redesign-spec.md, section 7).
// A ticket is born from a conversation: the drawer runs a transcript-style interview against
// the day-level grill routes, then shows the ENTIRE final ticket body for approval. Nothing is
// written to the board until the user approves. The parent (interactive-memory-studio) owns the
// session state machine and all fetches; this file is presentation plus the composer.

import { Check, Clipboard, Loader2, MessageCircleQuestion, TriangleAlert, X } from "lucide-react";
import { motion } from "motion/react";
import { type CSSProperties, useEffect, useId, useState } from "react";
import type { GrillProposal, GrillQuestion } from "@/lib/interactive-memory/grill";
import {
  diffProposalAgainstTask,
  type FieldChangeKind,
} from "@/lib/interactive-memory/proposal-diff";
import type { TaskKind, TaskRecord } from "@/lib/interactive-memory/types";

export type GrillDrawerMode = "create" | "revise";

// State machine names from spec 7.2 (done/cancelled are terminal and close the drawer, so they
// are handled by the parent unmounting this component rather than as rendered phases here).
export type GrillChatPhase =
  | "intent"
  | "waiting"
  | "chatting"
  | "proposal"
  | "applying"
  | "task-changed"
  | "error"
  | "lost";

// Client-accumulated transcript. Each grill route returns only the latest turn, so the parent
// appends user messages, served questions turns, and superseded proposals here as they happen.
export type GrillTranscriptEntry =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "questions"; note?: string; questions: GrillQuestion[] }
  | { id: string; role: "proposal"; proposal: GrillProposal; warnings: string[] };

// The current turn awaiting user action (rendered at the foot of the thread). Correlates with
// phase: a "questions" active turn goes with chatting; a "proposal" active turn goes with
// proposal / applying / task-changed / an apply error.
export type GrillActiveTurn =
  | { kind: "questions"; note?: string; questions: GrillQuestion[] }
  | { kind: "proposal"; proposal: GrillProposal; warnings: string[] };

export type GrillErrorInfo = {
  message: string;
  canRetry: boolean;
};

const KIND_LABELS: Record<TaskKind, string> = {
  focus: "Focus",
  task: "Task",
  quick: "Quick",
  comms: "Comms",
  personal: "Personal",
  ad_hoc: "Ad hoc",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  flex: 1,
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  background: "var(--studio-primary)",
  color: "var(--studio-primary-ink)",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "var(--studio-surface-muted)",
  color: "var(--studio-text)",
  border: "1px solid var(--studio-border)",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: 0,
  background: "transparent",
  color: "var(--studio-text-soft)",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  padding: "6px 4px",
};

function disabledStyle(base: CSSProperties, disabled: boolean): CSSProperties {
  return disabled ? { ...base, opacity: 0.5, cursor: "not-allowed" } : base;
}

const composerTextareaStyle: CSSProperties = {
  background: "var(--studio-input)",
  border: "1px solid var(--studio-border)",
  borderRadius: 8,
  color: "var(--studio-text)",
  padding: "8px 10px",
  resize: "vertical",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

export function GrillChatDrawer({
  mode,
  phase,
  headerTitle,
  entries,
  active,
  diffBaseline,
  freshTask,
  error,
  busy,
  onSendIntent,
  onSendMessage,
  onDraftNow,
  onApply,
  onDiscard,
  onRetry,
  onStartOver,
  onCopyPrompt,
  onReconfirmTaskChanged,
}: {
  mode: GrillDrawerMode;
  phase: GrillChatPhase;
  headerTitle: string;
  entries: GrillTranscriptEntry[];
  active?: GrillActiveTurn;
  diffBaseline?: TaskRecord;
  freshTask?: TaskRecord;
  error?: GrillErrorInfo;
  busy: boolean;
  onSendIntent: (intent: string) => void;
  onSendMessage: (text: string) => void;
  onDraftNow: () => void;
  onApply: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onStartOver: () => void;
  onCopyPrompt: () => Promise<void>;
  onReconfirmTaskChanged: () => void;
}) {
  const titleId = useId();
  const [composer, setComposer] = useState("");
  const [copied, setCopied] = useState(false);

  const closeDisabled = phase === "applying";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabled) onDiscard();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDisabled, onDiscard]);

  async function handleCopyPrompt() {
    await onCopyPrompt();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const trimmed = composer.trim();
  const canSend = trimmed.length > 0 && !busy;

  function submitIntent() {
    if (!canSend) return;
    onSendIntent(trimmed);
    setComposer("");
  }

  function submitMessage() {
    if (!canSend) return;
    onSendMessage(trimmed);
    setComposer("");
  }

  const kicker = mode === "create" ? "Grill · new ticket" : "Re-grill · existing ticket";
  const showComposer = phase === "chatting" || phase === "proposal" || phase === "applying";
  const showProposalCard =
    active?.kind === "proposal" &&
    (phase === "proposal" || phase === "applying" || phase === "task-changed" || phase === "error");

  return (
    <motion.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onDiscard();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 95,
        display: "flex",
        justifyContent: "flex-end",
        background:
          "radial-gradient(circle at 82% 18%, color-mix(in srgb, var(--studio-primary) 6%, transparent), transparent 62%), color-mix(in srgb, var(--studio-bg) 30%, rgba(3, 5, 8, 0.5))",
        backdropFilter: "blur(14px) saturate(112%)",
      }}
    >
      <motion.section
        animate={{ x: 0, opacity: 1 }}
        aria-labelledby={titleId}
        aria-modal="true"
        exit={{ x: 24, opacity: 0 }}
        initial={{ x: 24, opacity: 0 }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          width: "min(520px, calc(100vw - 32px))",
          height: "100dvh",
          overflow: "hidden",
          borderLeft: "1px solid var(--studio-border)",
          background: "var(--studio-surface-strong)",
          boxShadow: "-24px 0 70px color-mix(in srgb, var(--studio-shadow) 70%, transparent)",
          color: "var(--studio-text)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "20px 20px 12px",
            borderBottom: "1px solid var(--studio-border)",
          }}
        >
          <div>
            <div className="studio-kicker">{kicker}</div>
            <h2 id={titleId} style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 900 }}>
              {headerTitle}
            </h2>
          </div>
          <button
            aria-label="Close grill"
            className="icon-button"
            disabled={closeDisabled}
            onClick={onDiscard}
            style={closeDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {phase === "intent" ? (
            <p style={{ margin: 0, color: "var(--studio-text-soft)", fontSize: 13 }}>
              Describe what you want done. The interview will qualify it into a complete ticket, and
              nothing lands on the board until you approve the final body.
            </p>
          ) : null}

          {entries.map((entry) => (
            <GrillEntryView entry={entry} key={entry.id} />
          ))}

          {active?.kind === "questions" ? (
            <GrillQuestionsBlock note={active.note} questions={active.questions} />
          ) : null}

          {showProposalCard && active?.kind === "proposal" ? (
            <GrillProposalCard
              diffBaseline={mode === "revise" ? diffBaseline : undefined}
              proposal={active.proposal}
              warnings={active.warnings}
            />
          ) : null}

          {phase === "waiting" ? <GrillPending label="Thinking..." /> : null}
          {phase === "applying" ? <GrillPending label="Applying..." /> : null}

          {phase === "task-changed" && freshTask ? (
            <div className="prompt-required-warning" role="alert">
              This task changed while you were grilling it. Replacing it now will overwrite the
              current version titled "{freshTask.title}".
            </div>
          ) : null}

          {phase === "error" && error ? (
            <div className="deploy-agent-status deploy-agent-status-error" role="alert">
              <TriangleAlert className="h-4 w-4" />
              {error.message}
            </div>
          ) : null}

          {phase === "lost" ? (
            <div className="deploy-agent-status deploy-agent-status-error" role="alert">
              <TriangleAlert className="h-4 w-4" />
              This conversation was lost (the session expired or the server restarted). Nothing was
              saved. Start again to continue.
            </div>
          ) : null}
        </div>

        <div
          style={{
            padding: "12px 20px 20px",
            borderTop: "1px solid var(--studio-border)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {phase === "intent" ? (
            <>
              <textarea
                onChange={(event) => setComposer(event.target.value)}
                placeholder="What do you want done?"
                rows={4}
                style={composerTextareaStyle}
                value={composer}
              />
              <button
                disabled={!canSend}
                onClick={submitIntent}
                style={disabledStyle(primaryButtonStyle, !canSend)}
                type="button"
              >
                <MessageCircleQuestion className="h-4 w-4" />
                Start grilling
              </button>
            </>
          ) : null}

          {showProposalCard && phase === "proposal" ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onDiscard} style={secondaryButtonStyle} type="button">
                Discard
              </button>
              <button onClick={onApply} style={primaryButtonStyle} type="button">
                {mode === "revise" ? "Replace ticket" : "Create ticket"}
              </button>
            </div>
          ) : null}

          {phase === "task-changed" ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onDiscard} style={secondaryButtonStyle} type="button">
                Discard
              </button>
              <button onClick={onReconfirmTaskChanged} style={primaryButtonStyle} type="button">
                Replace anyway
              </button>
            </div>
          ) : null}

          {showComposer ? (
            <>
              <textarea
                disabled={busy}
                onChange={(event) => setComposer(event.target.value)}
                placeholder={
                  phase === "proposal"
                    ? "Type a correction to refine the ticket..."
                    : "Type your reply..."
                }
                rows={3}
                style={busy ? { ...composerTextareaStyle, opacity: 0.6 } : composerTextareaStyle}
                value={composer}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  disabled={busy}
                  onClick={onDraftNow}
                  style={disabledStyle(secondaryButtonStyle, busy)}
                  type="button"
                >
                  Good enough, draft it
                </button>
                <button
                  disabled={!canSend}
                  onClick={submitMessage}
                  style={disabledStyle(primaryButtonStyle, !canSend)}
                  type="button"
                >
                  {phase === "proposal" ? "Send correction" : "Send"}
                </button>
              </div>
            </>
          ) : null}

          {phase === "error" && error ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => void handleCopyPrompt()}
                style={secondaryButtonStyle}
                type="button"
              >
                <Clipboard className="h-4 w-4" />
                {copied ? "Copied" : "Copy grill prompt"}
              </button>
              {error.canRetry ? (
                <button onClick={onRetry} style={primaryButtonStyle} type="button">
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          {phase === "lost" ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => void handleCopyPrompt()}
                style={secondaryButtonStyle}
                type="button"
              >
                <Clipboard className="h-4 w-4" />
                {copied ? "Copied" : "Copy grill prompt"}
              </button>
              <button onClick={onStartOver} style={primaryButtonStyle} type="button">
                Start again
              </button>
            </div>
          ) : null}

          {phase !== "error" && phase !== "lost" && phase !== "intent" ? (
            <button onClick={() => void handleCopyPrompt()} style={ghostButtonStyle} type="button">
              <Clipboard className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy grill prompt"}
            </button>
          ) : null}
        </div>
      </motion.section>
    </motion.div>
  );
}

function GrillPending({ label }: { label: string }) {
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--studio-text-soft)" }}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function GrillEntryView({ entry }: { entry: GrillTranscriptEntry }) {
  if (entry.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "88%",
          background: "color-mix(in srgb, var(--studio-primary) 16%, var(--studio-surface))",
          border: "1px solid var(--studio-border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 13,
          whiteSpace: "pre-wrap",
        }}
      >
        {entry.text}
      </div>
    );
  }
  if (entry.role === "questions") {
    return <GrillQuestionsBlock note={entry.note} questions={entry.questions} />;
  }
  // Superseded proposal collapsed into history.
  return (
    <div
      style={{
        border: "1px dashed var(--studio-border)",
        borderRadius: 10,
        padding: "8px 12px",
        color: "var(--studio-text-soft)",
        fontSize: 12,
        background: "var(--studio-surface)",
      }}
    >
      <div
        style={{ fontWeight: 800, textTransform: "uppercase", fontSize: 10, letterSpacing: 0.4 }}
      >
        Earlier proposal · superseded
      </div>
      <div style={{ marginTop: 4, color: "var(--studio-text-muted)" }}>
        {entry.proposal.impactLine}
      </div>
    </div>
  );
}

function GrillQuestionsBlock({ note, questions }: { note?: string; questions: GrillQuestion[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {note ? <p style={{ margin: 0, fontSize: 13, color: "var(--studio-text)" }}>{note}</p> : null}
      <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        {questions.map((question) => (
          <li key={question.id} style={{ fontSize: 13, fontWeight: 700 }}>
            {question.text}
          </li>
        ))}
      </ol>
    </div>
  );
}

const CHANGE_BADGE: Record<Exclude<FieldChangeKind, "unchanged">, { label: string; bg: string }> = {
  changed: { label: "changed", bg: "var(--studio-primary)" },
  added: { label: "added", bg: "var(--studio-success, #2f9e44)" },
  removed: { label: "removed", bg: "var(--studio-danger, #e03131)" },
};

// Proposal card, spec 7.3 exact order: impact line (loudest), server readiness chips, every
// field FULL and untruncated (scroll, never clamp), model-inferred badges, revise changed marks
// (computed via diffProposalAgainstTask, never model-reported), then the actions live in the
// drawer footer below. Read-only: corrections go through the composer, not inline editing.
export function GrillProposalCard({
  diffBaseline,
  proposal,
  warnings,
}: {
  diffBaseline?: TaskRecord;
  proposal: GrillProposal;
  warnings: string[];
}) {
  const { ticket, provenance } = proposal;
  const diff = diffBaseline ? diffProposalAgainstTask(proposal, diffBaseline) : undefined;

  const topFields: Array<{ key: string; diffKey: string; label: string; value: string }> = [
    { key: "title", diffKey: "title", label: "Title", value: ticket.title },
    { key: "kind", diffKey: "kind", label: "Kind", value: KIND_LABELS[ticket.kind] },
    {
      key: "estimateMinutes",
      diffKey: "estimateMinutes",
      label: "Estimate",
      value: `${ticket.estimateMinutes} min`,
    },
    { key: "workDepth", diffKey: "workDepth", label: "Work depth", value: ticket.workDepth },
  ];
  if (ticket.agentName) {
    topFields.push({
      key: "agentName",
      diffKey: "agentName",
      label: "Agent",
      value: ticket.agentName,
    });
  }
  const ticketFieldRows: Array<{ key: string; label: string; value: string }> = [
    { key: "objective", label: "Objective", value: ticket.ticketFields.objective },
    { key: "background", label: "Background", value: ticket.ticketFields.background },
    { key: "sourcesOverride", label: "Sources", value: ticket.ticketFields.sourcesOverride },
    {
      key: "constraintsNonGoals",
      label: "Constraints / non-goals",
      value: ticket.ticketFields.constraintsNonGoals,
    },
    { key: "doneWhen", label: "Done when", value: ticket.ticketFields.doneWhen },
    { key: "verification", label: "Verification", value: ticket.ticketFields.verification },
  ];

  return (
    <div
      style={{
        border: "1px solid var(--studio-border)",
        borderRadius: 12,
        background: "var(--studio-surface)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 900,
          lineHeight: 1.35,
          color: "var(--studio-text)",
        }}
      >
        {proposal.impactLine}
      </div>

      {warnings.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {warnings.map((warning) => (
            <span
              key={warning}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "color-mix(in srgb, var(--studio-danger, #e03131) 14%, transparent)",
                color: "var(--studio-text)",
                border:
                  "1px solid color-mix(in srgb, var(--studio-danger, #e03131) 45%, transparent)",
                borderRadius: 999,
                padding: "3px 9px",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              <TriangleAlert className="h-3 w-3" />
              {warning}
            </span>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--studio-text-soft)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <Check className="h-3.5 w-3.5" />
          No readiness warnings: deploy will not block.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {topFields.map((field) => (
          <GrillFieldRow
            change={diff?.[field.diffKey]}
            inferred={provenance[field.key] === "inferred"}
            key={field.key}
            label={field.label}
            value={field.value}
          />
        ))}
        {ticketFieldRows.map((field) => (
          <GrillFieldRow
            change={diff?.[`ticketFields.${field.key}`]}
            inferred={provenance[field.key] === "inferred"}
            key={field.key}
            label={field.label}
            value={field.value}
          />
        ))}
      </div>
    </div>
  );
}

function GrillFieldRow({
  change,
  inferred,
  label,
  value,
}: {
  change?: FieldChangeKind;
  inferred: boolean;
  label: string;
  value: string;
}) {
  const changeBadge = change && change !== "unchanged" ? CHANGE_BADGE[change] : undefined;
  const text = value.trim() ? value : "None";
  return (
    <div
      style={{
        border: "1px solid var(--studio-border)",
        borderRadius: 8,
        padding: "8px 10px",
        background: changeBadge
          ? "color-mix(in srgb, var(--studio-primary) 8%, var(--studio-surface))"
          : "var(--studio-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "var(--studio-text-soft)",
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
        {changeBadge ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "#fff",
              background: changeBadge.bg,
              borderRadius: 999,
              padding: "1px 7px",
              textTransform: "uppercase",
            }}
          >
            {changeBadge.label}
          </span>
        ) : null}
        {inferred ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 900,
              color: "var(--studio-text)",
              background: "color-mix(in srgb, var(--studio-warning, #f08c00) 22%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--studio-warning, #f08c00) 55%, transparent)",
              borderRadius: 999,
              padding: "1px 7px",
              textTransform: "uppercase",
            }}
            title="Model-inferred: not traceable to something you stated. Most likely to be wrong."
          >
            model-inferred
          </span>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 13,
          color: "var(--studio-text)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {text}
      </div>
    </div>
  );
}
