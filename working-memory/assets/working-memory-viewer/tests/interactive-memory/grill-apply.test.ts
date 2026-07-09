import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as applyGrill } from "@/app/api/studio/day/[date]/grill/[grillId]/apply/route";
import { DaySaveConflictError, normalizeDayPlan } from "@/lib/interactive-memory/fs";
import {
  type GrillProposal,
  GrillProposalSchema,
  type GrillSession,
  getGrillSessions,
} from "@/lib/interactive-memory/grill";
import {
  applyProposal,
  buildTaskFromProposal,
  grillErrorResponse,
} from "@/lib/interactive-memory/grill-routes";
import { buildNewTask } from "@/lib/interactive-memory/task-factory";
import type { TaskRecord } from "@/lib/interactive-memory/types";

// Route-level day-conflict coverage (spec 6.2) lives here because a dedicated test file is not in
// this fixer's editable set. The fs module is partially mocked with importOriginal, overriding
// ONLY saveDay; readOrCreateDay, readExistingDay, normalizeDayPlan, and DaySaveConflictError stay
// real. The other tests in this file never call saveDay, so their behavior is unchanged.
const { saveDayMock } = vi.hoisted(() => ({ saveDayMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/interactive-memory/fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interactive-memory/fs")>();
  return { ...actual, saveDay: saveDayMock };
});

function proposal(overrides: Partial<GrillProposal["ticket"]> = {}): GrillProposal {
  return {
    kind: "proposal",
    impactLine: "The deploy agent will refactor the reporting module.",
    ticket: {
      title: "Refactor the reporting module",
      kind: "task",
      estimateMinutes: 60,
      workDepth: "deep",
      agentName: "refactor-reporting",
      ticketFields: {
        objective: "Refactor the reporting module.",
        background: "It duplicates helpers.",
        sourcesOverride: "main branch.",
        constraintsNonGoals: "Keep the public API.",
        doneWhen: "Helpers deduplicated.",
        verification: "Unit suite green.",
      },
      ...overrides,
    },
    provenance: {},
  };
}

function existingTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Old title",
    agentName: "old-agent",
    status: "in_progress",
    kind: "focus",
    estimateMinutes: 30,
    workDepth: "shallow",
    agentReadiness: "warning",
    readinessWarnings: ["missing sources for deep or delegated work"],
    project: "reporting",
    sourceRefs: [{ kind: "jira", label: "TCK-1", url: "https://example.test/TCK-1" }],
    trackerIds: ["tracker-1"],
    ticketFields: {
      objective: "Old objective.",
      background: "",
      constraintsNonGoals: "",
      doneWhen: "",
      verification: "",
    },
    agentRuns: [
      {
        id: "run-1",
        model: "sonnet",
        name: "old-agent",
        cwd: "/tmp/agent-work",
        launchedAt: "2026-06-26T12:00:00Z",
        status: "launched",
        promptSha256: "abc123",
      },
    ],
    scheduledStart: "2026-06-26T09:00:00",
    scheduledEnd: "2026-06-26T10:00:00",
    createdAt: "2026-06-26T00:00:00Z",
    updatedAt: "2026-06-26T00:00:00Z",
    completedAt: "2026-06-26T11:00:00Z",
    ...overrides,
  };
}

describe("buildNewTask", () => {
  it("applies the capture defaults not sourced from the proposal", () => {
    const task = buildNewTask();
    expect(task.status).toBe("todo");
    expect(task.sourceRefs).toEqual([]);
    expect(task.trackerIds).toEqual([]);
    expect(task.agentRuns).toEqual([]);
    expect(task.scheduledStart).toBeUndefined();
    expect(task.scheduledEnd).toBeUndefined();
    expect(task.completedAt).toBeUndefined();
    expect(task.createdAt).toBe(task.updatedAt);
    expect(task.id.length).toBeGreaterThan(0);
  });

  it("generates a distinct id per call", () => {
    expect(buildNewTask().id).not.toBe(buildNewTask().id);
  });

  it("produces a record normalizeDayPlan accepts unchanged", () => {
    const task = buildNewTask({ title: "Do the thing", kind: "task" });
    const day = normalizeDayPlan({ date: "2099-01-01", tasks: [task] });
    const found = day.tasks.find((candidate) => candidate.id === task.id);
    expect(found).toBeDefined();
    expect(found?.title).toBe("Do the thing");
  });
});

describe("buildTaskFromProposal", () => {
  it("maps every proposal field onto a fresh task", () => {
    const task = buildTaskFromProposal(proposal());
    expect(task.title).toBe("Refactor the reporting module");
    expect(task.kind).toBe("task");
    expect(task.estimateMinutes).toBe(60);
    expect(task.workDepth).toBe("deep");
    expect(task.agentName).toBe("refactor-reporting");
    expect(task.ticketFields.objective).toBe("Refactor the reporting module.");
    expect(task.status).toBe("todo");
    expect(task.sourceRefs).toEqual([]);
  });
});

describe("applyProposal (revise full-body replace)", () => {
  it("replaces title, estimate, work depth, agentName, and all ticketFields", () => {
    const merged = applyProposal(existingTask(), proposal());
    expect(merged.title).toBe("Refactor the reporting module");
    expect(merged.estimateMinutes).toBe(60);
    expect(merged.workDepth).toBe("deep");
    expect(merged.agentName).toBe("refactor-reporting");
    expect(merged.ticketFields).toEqual(proposal().ticket.ticketFields);
  });

  it("preserves id, kind, createdAt, status, schedule, sourceRefs, trackerIds, agentRuns, completedAt", () => {
    const before = existingTask();
    const merged = applyProposal(before, proposal());
    expect(merged.id).toBe(before.id);
    expect(merged.kind).toBe(before.kind);
    expect(merged.createdAt).toBe(before.createdAt);
    expect(merged.status).toBe(before.status);
    expect(merged.scheduledStart).toBe(before.scheduledStart);
    expect(merged.scheduledEnd).toBe(before.scheduledEnd);
    expect(merged.sourceRefs).toEqual(before.sourceRefs);
    expect(merged.trackerIds).toEqual(before.trackerIds);
    expect(merged.agentRuns).toEqual(before.agentRuns);
    expect(merged.completedAt).toBe(before.completedAt);
  });

  it("preserves the existing agentName when the proposal omits it", () => {
    const p = proposal();
    delete (p.ticket as { agentName?: string }).agentName;
    const merged = applyProposal(existingTask({ agentName: "keep-me" }), p);
    expect(merged.agentName).toBe("keep-me");
  });

  it("bumps updatedAt past the pre-merge value", () => {
    const before = existingTask({ updatedAt: "2000-01-01T00:00:00.000Z" });
    const merged = applyProposal(before, proposal());
    expect(new Date(merged.updatedAt).getTime()).toBeGreaterThan(
      new Date(before.updatedAt).getTime(),
    );
  });
});

describe("grillErrorResponse day-conflict mapping", () => {
  // A lost saveDay baseUpdatedAt is not deterministically triggerable through the apply route
  // (it reads the day fresh then saves with no interleave window), so the coded-409 mapping is
  // covered here directly (spec 6.2 day-conflict).
  it("maps DaySaveConflictError to a 409 with code day-conflict", async () => {
    const response = grillErrorResponse(new DaySaveConflictError());
    expect(response).toBeDefined();
    expect(response?.status).toBe(409);
    const body = await response?.json();
    expect(body.code).toBe("day-conflict");
  });
});

describe("apply route day-conflict (409 through the route)", () => {
  afterEach(() => {
    saveDayMock.mockReset();
    getGrillSessions().clear();
    vi.unstubAllEnvs();
  });

  it("maps a lost saveDay baseUpdatedAt to a 409 day-conflict with a non-empty error", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "grill-apply-conflict-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    vi.stubEnv("WORKING_MEMORY_ENABLE_GRILL", "true");
    saveDayMock.mockImplementation(() => {
      throw new DaySaveConflictError();
    });

    const date = "2099-07-08";
    const grillId = "grill-day-conflict";
    const displayed = GrillProposalSchema.parse(proposal());
    const session: GrillSession = {
      grillId,
      date,
      mode: "create",
      questionRounds: 0,
      busy: false,
      lastProposal: displayed,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    getGrillSessions().set(grillId, session);

    const res = await applyGrill(
      new Request(`http://localhost/api/studio/day/${date}/grill/${grillId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal: displayed }),
      }),
      { params: Promise.resolve({ date, grillId }) },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("day-conflict");
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(saveDayMock).toHaveBeenCalledTimes(1);
  });
});
