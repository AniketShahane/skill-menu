#!/usr/bin/env node
// Deterministic stand-in for the `claude -p` CLI used by grill.ts (grill v2, spec section 9).
// Reads the trailing `-- <userText>` argument and returns canned turn JSON on stdout, matching
// the shape executeClaudeTurn() expects: { session_id, is_error, result, structured_output }.
// No network calls, no real model, safe for repeated CI runs.
//
// Turn selection (checked in order; the force-draft nudge / draft-now ramp is checked FIRST so a
// post-proposal correction that wrongly received the nudge still resolves to a proposal):
//   - the force-draft nudge / draft-now exit ramp ("produce the proposal now" / "good enough")
//   - env WM_GRILL_FIXTURE = "bad-schema" | "bad-then-good" | "gappy-proposal" | "proposal-first"
//       | "revise-no-note" | "revise-no-note-persistent" | "always-questions"
//   - markers embedded in the user message: [[BAD]] [[PROPOSAL]] [[QUESTIONS]] [[QUESTIONS_NO_NOTE]] [[GAPPY]]
//   - default: a first turn (no --resume) asks questions; a continuation (--resume) proposes.

const args = process.argv.slice(2);
const dashIndex = args.lastIndexOf("--");
const userText = dashIndex >= 0 ? (args[dashIndex + 1] ?? "") : "";
const hasResume = args.includes("--resume");
const scenario = process.env.WM_GRILL_FIXTURE || "";

function questionsTurn(withNote) {
  const turn = {
    kind: "questions",
    questions: [
      { id: "q1", text: "What exact outcome should exist when this is done?" },
      { id: "q2", text: "What authoritative source, repo, or doc governs this work?" },
    ],
  };
  if (withNote) {
    turn.note = "Short read: the ticket names the goal but leaves sources and verification open.";
  }
  return turn;
}

function proposalTurn(overrides = {}) {
  const ticketFields = {
    objective: "Refactor the reporting module to remove duplicated helpers.",
    background: "The module grew organically and now duplicates several helper functions.",
    sourcesOverride: "The main branch, reporting module directory.",
    constraintsNonGoals: "Do not change the public reporting API.",
    doneWhen: "The helpers are deduplicated and the regression test passes.",
    verification: "Run the unit suite and confirm it stays green.",
    ...(overrides.ticketFields ?? {}),
  };
  return {
    kind: "proposal",
    impactLine: "The deploy agent will refactor the reporting module and add a regression test.",
    ticket: {
      title: "Refactor the reporting module",
      kind: "task",
      estimateMinutes: 60,
      workDepth: "deep",
      agentName: "refactor-reporting",
      ticketFields,
    },
    provenance: {
      title: "user-stated",
      kind: "inferred",
      estimateMinutes: "inferred",
      workDepth: "inferred",
      agentName: "inferred",
      objective: "user-stated",
      background: "inferred",
      sourcesOverride: "user-stated",
      constraintsNonGoals: "user-stated",
      doneWhen: "user-stated",
      verification: "inferred",
    },
  };
}

function pick() {
  // The force-draft nudge / draft-now ramp wins over any embedded marker so that a post-proposal
  // correction which (wrongly) received the nudge still resolves to a proposal. This lets the
  // round-cap exemption test fail loudly if the route appends the nudge after a proposal.
  if (/produce the proposal now|good enough/i.test(userText)) return proposalTurn();
  if (scenario === "bad-schema" || /\[\[BAD\]\]/.test(userText)) {
    return { kind: "not-a-real-kind" };
  }
  // Invalid on the first invocation, valid on the resumed corrective re-ask: exercises
  // runGrillTurn's one-corrective-re-ask recovery path.
  if (scenario === "bad-then-good") {
    return hasResume ? questionsTurn(true) : { kind: "not-a-real-kind" };
  }
  if (/\[\[PROPOSAL\]\]/.test(userText)) return proposalTurn();
  if (/\[\[QUESTIONS_NO_NOTE\]\]/.test(userText)) return questionsTurn(false);
  if (/\[\[QUESTIONS\]\]/.test(userText)) return questionsTurn(true);
  if (/\[\[GAPPY\]\]/.test(userText) || scenario === "gappy-proposal") {
    return proposalTurn({ ticketFields: { verification: "" } });
  }
  if (scenario === "proposal-first") return proposalTurn();
  if (scenario === "revise-no-note") return hasResume ? proposalTurn() : questionsTurn(false);
  // Never carries a note, on every turn: the revise turn-1 note guard cannot recover -> 502.
  if (scenario === "revise-no-note-persistent") return questionsTurn(false);
  if (scenario === "always-questions") return questionsTurn(true);
  return hasResume ? proposalTurn() : questionsTurn(true);
}

const structured = pick();
const sessionId = `fixture-session-${process.pid}-${Date.now()}`;
process.stdout.write(
  JSON.stringify({
    session_id: sessionId,
    is_error: false,
    result: JSON.stringify(structured),
    structured_output: structured,
  }),
);
