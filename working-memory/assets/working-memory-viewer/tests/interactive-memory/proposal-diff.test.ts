import { describe, expect, it, vi } from "vitest";
import type { GrillProposal } from "@/lib/interactive-memory/grill";
import { diffProposalAgainstTask } from "@/lib/interactive-memory/proposal-diff";
import type { TaskRecord } from "@/lib/interactive-memory/types";

vi.mock("server-only", () => ({}));

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Old title",
    agentName: "old-agent",
    status: "todo",
    kind: "task",
    estimateMinutes: 30,
    workDepth: "shallow",
    agentReadiness: "warning",
    readinessWarnings: [],
    sourceRefs: [],
    ticketFields: {
      objective: "Old objective.",
      background: "",
      sourcesOverride: "Old source.",
      constraintsNonGoals: "",
      doneWhen: "Old done.",
      verification: "",
    },
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function proposal(overrides: Partial<GrillProposal["ticket"]> = {}): GrillProposal {
  return {
    kind: "proposal",
    impactLine: "impact",
    ticket: {
      title: "Old title",
      kind: "task",
      estimateMinutes: 30,
      workDepth: "shallow",
      agentName: "old-agent",
      ticketFields: {
        objective: "Old objective.",
        background: "",
        sourcesOverride: "Old source.",
        constraintsNonGoals: "",
        doneWhen: "Old done.",
        verification: "",
      },
      ...overrides,
    },
    provenance: {},
  };
}

describe("diffProposalAgainstTask", () => {
  it("marks every field unchanged when the proposal echoes the task", () => {
    const marks = diffProposalAgainstTask(proposal(), task());
    for (const value of Object.values(marks)) {
      expect(value).toBe("unchanged");
    }
  });

  it("marks a differing scalar field as changed", () => {
    const marks = diffProposalAgainstTask(
      proposal({ title: "New title", estimateMinutes: 60 }),
      task(),
    );
    expect(marks.title).toBe("changed");
    expect(marks.estimateMinutes).toBe("changed");
    expect(marks.workDepth).toBe("unchanged");
  });

  it("marks a newly filled field as added and a cleared field as removed", () => {
    const marks = diffProposalAgainstTask(
      proposal({
        ticketFields: {
          objective: "Old objective.",
          background: "Now has background.",
          sourcesOverride: "",
          constraintsNonGoals: "",
          doneWhen: "Old done.",
          verification: "",
        },
      }),
      task(),
    );
    expect(marks["ticketFields.background"]).toBe("added");
    expect(marks["ticketFields.sourcesOverride"]).toBe("removed");
    expect(marks["ticketFields.objective"]).toBe("unchanged");
  });

  it("treats an absent proposal agentName as unchanged (preserve semantics)", () => {
    const p = proposal();
    delete (p.ticket as { agentName?: string }).agentName;
    const marks = diffProposalAgainstTask(p, task({ agentName: "old-agent" }));
    expect(marks.agentName).toBe("unchanged");
  });

  it("exposes all six ticketFields keys plus the scalar keys", () => {
    const marks = diffProposalAgainstTask(proposal(), task());
    for (const key of [
      "title",
      "kind",
      "estimateMinutes",
      "workDepth",
      "agentName",
      "ticketFields.objective",
      "ticketFields.background",
      "ticketFields.sourcesOverride",
      "ticketFields.constraintsNonGoals",
      "ticketFields.doneWhen",
      "ticketFields.verification",
    ]) {
      expect(marks).toHaveProperty(key);
    }
  });
});
