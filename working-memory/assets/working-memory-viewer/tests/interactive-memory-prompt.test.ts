import { describe, expect, it } from "vitest";
import {
  buildAgentPrompt,
  buildCaptureSummary,
  buildTicketBody,
  getPromptWarnings,
  getTaskReadiness,
  renderAgentPrompt,
  renderPromptTemplate,
  validatePromptTemplate,
} from "@/lib/interactive-memory/prompt";
import type { TaskRecord } from "@/lib/interactive-memory/types";

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Ship interactive daily planner",
    status: "in_progress",
    kind: "focus",
    estimateMinutes: 120,
    workDepth: "deep",
    agentReadiness: "ready",
    readinessWarnings: [],
    project: "personal-notes",
    sourceRefs: [{ kind: "manual", label: "User request" }],
    ticketFields: {
      objective: "Build the file-backed daily planner prototype.",
      background: "The user wants to replace Markdown daily notes.",
      constraintsNonGoals: "Persist state to JSON files and keep the scope local.",
      doneWhen: "Tasks can be marked done, in progress, and review.",
      verification: "Run npm run typecheck.",
    },
    scheduledStart: "2026-05-22T09:00:00",
    scheduledEnd: "2026-05-22T11:00:00",
    createdAt: "2026-05-22T00:00:00Z",
    updatedAt: "2026-05-22T00:00:00Z",
    ...overrides,
  };
}

describe("interactive memory prompt rendering", () => {
  it("generates the ticket body from structured fields", () => {
    const ticketBody = buildTicketBody(task());

    expect(ticketBody).toContain("## Objective");
    expect(ticketBody).toContain("Build the file-backed daily planner prototype.");
    expect(ticketBody).toContain("## Background");
    expect(ticketBody).toContain("## Constraints / Non-goals");
    expect(ticketBody).toContain("## Done When");
    expect(ticketBody).toContain("Run npm run typecheck.");
    expect(ticketBody).toContain("120 minutes, deep work.");
  });

  it("uses the generated ticket body as the canonical prompt content", () => {
    const prompt = buildAgentPrompt(task());

    expect(prompt).toContain("Build the file-backed daily planner prototype.");
    expect(prompt).toContain("## Source Links");
    expect(prompt).toContain("- Work depth: deep");
    expect(prompt).toContain("Tasks can be marked done, in progress, and review.");
    expect(prompt).toContain("Run npm run typecheck.");
    expect(prompt).toContain("- manual: User request");
    expect(prompt).not.toContain("- Status: in_progress");
  });

  it("prepends explicit warnings for non-ready delegated prompts", () => {
    const rendered = renderAgentPrompt(
      task({
        title: "Investigate dashboard issue",
        kind: "task",
        estimateMinutes: 60,
        workDepth: "shallow",
        sourceRefs: [],
        ticketFields: {
          objective: "Investigate dashboard issue.",
          background: "",
          constraintsNonGoals: "",
          doneWhen: "The cause is known.",
          verification: "",
        },
      }),
    );

    expect(rendered.readiness).toBe("warning");
    expect(rendered.text).toContain("## Delegation Warning");
    expect(rendered.warnings).toContain("missing background for deep or delegated work");
    expect(rendered.warnings).toContain("missing sources for deep or delegated work");
    expect(rendered.warnings).toContain("missing verification for deep or delegated work");
  });

  it("keeps missing objective or done-when captures out of executable prompt flow", () => {
    const capture = task({
      title: "Capture vague thing",
      kind: "quick",
      estimateMinutes: 15,
      workDepth: "shallow",
      sourceRefs: [{ kind: "manual", label: "Manual capture" }],
      ticketFields: {
        objective: "Capture vague thing",
        background: "",
        constraintsNonGoals: "",
        doneWhen: "",
        verification: "",
      },
    });

    expect(getTaskReadiness(capture)).toBe("incomplete");
    expect(buildCaptureSummary(capture)).toContain("not ready for delegation");
  });

  it("allows simple shallow work to omit heavyweight fields", () => {
    const simple = task({
      title: "Send status note",
      kind: "comms",
      estimateMinutes: 15,
      workDepth: "shallow",
      sourceRefs: [],
      ticketFields: {
        objective: "Send the status note.",
        background: "",
        constraintsNonGoals: "",
        doneWhen: "The note is sent.",
        verification: "",
      },
    });

    expect(getPromptWarnings(simple)).toEqual([]);
    expect(getTaskReadiness(simple)).toBe("ready");
    expect(buildTicketBody(simple)).toContain("None needed");
    expect(buildTicketBody(simple)).toContain("None specified");
  });

  it("does not force full qualification for ordinary short shallow tasks", () => {
    const simpleTask = task({
      title: "Tidy dashboard copy",
      kind: "task",
      estimateMinutes: 20,
      workDepth: "shallow",
      sourceRefs: [],
      ticketFields: {
        objective: "Tidy the dashboard copy.",
        background: "",
        constraintsNonGoals: "",
        doneWhen: "The copy is clearer.",
        verification: "",
      },
    });

    expect(getPromptWarnings(simpleTask)).toEqual([]);
    expect(getTaskReadiness(simpleTask)).toBe("ready");
  });

  it("requires full qualification for risky shallow tasks", () => {
    const risky = task({
      title: "Delete the old production table",
      kind: "quick",
      estimateMinutes: 15,
      workDepth: "shallow",
      sourceRefs: [],
      ticketFields: {
        objective: "Delete the old production table.",
        background: "",
        constraintsNonGoals: "",
        doneWhen: "The table is gone.",
        verification: "",
      },
    });

    expect(getPromptWarnings(risky)).toContain("missing background for deep or delegated work");
    expect(getPromptWarnings(risky)).toContain("missing sources for deep or delegated work");
    expect(getPromptWarnings(risky)).toContain("missing verification for deep or delegated work");
  });

  it("renders empty readiness warnings as none instead of a missing marker", () => {
    const rendered = renderAgentPrompt(task(), {
      promptTemplate: "{{ticketBody}}\n\nWarnings:\n{{readinessWarnings}}",
    });

    expect(rendered.readiness).toBe("ready");
    expect(rendered.text).toContain("Warnings:\nNone");
    expect(rendered.text).not.toContain("[missing: readinessWarnings]");
  });

  it("accepts spaced ticket body placeholders in editable templates", () => {
    expect(validatePromptTemplate("{{ ticketBody }}\n{{title}}")).toEqual([]);
    const rendered = renderPromptTemplate("{{ ticketBody }}", {
      ticketBody: "Generated body",
    });
    expect(rendered.text).toBe("Generated body");
  });

  it("warns when an editable template drops the ticket body or uses unknown placeholders", () => {
    expect(validatePromptTemplate("{{title}}\n{{bogus}}")).toEqual([
      "Template should include {{ticketBody}} (or {{objectiveBody}} and {{doneWhenBody}}) so the agent receives the qualified work order.",
      "Unknown placeholder: {{bogus}}",
    ]);
  });

  it("treats invalid editable templates as warning prompts", () => {
    const rendered = renderAgentPrompt(task(), { promptTemplate: "{{title}}\n{{bogus}}" });

    expect(rendered.readiness).toBe("warning");
    expect(rendered.warnings).toContain(
      "Template should include {{ticketBody}} (or {{objectiveBody}} and {{doneWhenBody}}) so the agent receives the qualified work order.",
    );
    expect(rendered.warnings).toContain("Unknown placeholder: {{bogus}}");
    expect(rendered.text).toContain("## Delegation Warning");
  });

  it("accepts granular section placeholders without the legacy ticketBody warning", () => {
    expect(
      validatePromptTemplate("{{objectiveBody}}\n{{backgroundBody}}\n{{doneWhenBody}}"),
    ).toEqual([]);
  });

  it("renders the default template's granular placeholders", () => {
    const rendered = renderAgentPrompt(task());

    expect(rendered.readiness).toBe("ready");
    expect(rendered.text).toContain("Build the file-backed daily planner prototype.");
    expect(rendered.text).toContain("The user wants to replace Markdown daily notes.");
    expect(rendered.text).toContain("Persist state to JSON files and keep the scope local.");
    expect(rendered.text).toContain("Tasks can be marked done, in progress, and review.");
    expect(rendered.text).toContain("Run npm run typecheck.");
    expect(rendered.text).toContain("120 minutes, deep work.");
  });
});
