import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as answerGrill } from "@/app/api/studio/day/[date]/grill/[grillId]/answer/route";
import { POST as applyGrill } from "@/app/api/studio/day/[date]/grill/[grillId]/apply/route";
import {
  DELETE as cancelGrill,
  GET as getGrill,
} from "@/app/api/studio/day/[date]/grill/[grillId]/route";
import { POST as startGrill } from "@/app/api/studio/day/[date]/grill/route";
import { normalizeDayPlan, readExistingDay, saveDay } from "@/lib/interactive-memory/fs";
import { getGrillSessions, PRE_PROPOSAL_ROUND_CAP } from "@/lib/interactive-memory/grill";
import { buildQueueGrillIntent } from "@/lib/interactive-memory/grill-routes";
import { dismissQueueItem, mergeSweep, readQueue } from "@/lib/interactive-memory/queue-store";
import type { QueueCandidate, QueueItem, TaskRecord } from "@/lib/interactive-memory/types";

// consumeQueueItem is partially mocked so one test can force the server-internal consume to REJECT
// (a genuine disk failure, not the idempotent no-op) and prove the best-effort failure path (spec
// 6). It defaults to the REAL implementation, so every other test in this file (including the real
// consume and double-apply cases) is unchanged.
const { consumeQueueItemMock } = vi.hoisted(() => ({ consumeQueueItemMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/interactive-memory/queue-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interactive-memory/queue-store")>();
  consumeQueueItemMock.mockImplementation(actual.consumeQueueItem);
  return { ...actual, consumeQueueItem: consumeQueueItemMock };
});

const FIXTURE_BIN = path.resolve(process.cwd(), "tests/interactive-memory/fixtures/grill-cli.mjs");
const DATE = "2099-07-08";

afterEach(() => {
  vi.unstubAllEnvs();
  getGrillSessions().clear();
});

async function configureEnv(opts: { enableGrill?: boolean; fixture?: string } = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "grill-v2-"));
  vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
  vi.stubEnv("WORKING_MEMORY_CLAUDE_BIN", FIXTURE_BIN);
  if (opts.enableGrill) vi.stubEnv("WORKING_MEMORY_ENABLE_GRILL", "true");
  if (opts.fixture) vi.stubEnv("WM_GRILL_FIXTURE", opts.fixture);
  return rootDir;
}

function reviseTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: "task-1",
    title: "Original reporting task",
    status: "in_progress",
    kind: "task",
    estimateMinutes: 30,
    workDepth: "shallow",
    agentReadiness: "warning",
    readinessWarnings: [],
    sourceRefs: [{ kind: "jira", label: "TCK-9", url: "https://example.test/TCK-9" }],
    trackerIds: ["tracker-1"],
    ticketFields: {
      objective: "Original objective.",
      background: "",
      constraintsNonGoals: "",
      doneWhen: "",
      verification: "",
    },
    scheduledStart: "2099-07-08T09:00:00",
    scheduledEnd: "2099-07-08T10:00:00",
    createdAt: "2099-07-08T00:00:00Z",
    updatedAt: "2099-07-08T00:00:00Z",
    ...overrides,
  };
}

async function seedDay(tasks: TaskRecord[]) {
  return saveDay(DATE, normalizeDayPlan({ date: DATE, tasks }));
}

async function readDay() {
  const bundle = await readExistingDay(DATE);
  if (!bundle) throw new Error("day not found");
  return bundle;
}

function start(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return startGrill(
    new Request(`http://localhost/api/studio/day/${DATE}/grill`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ date: DATE }) },
  );
}

function answer(grillId: string, body: Record<string, unknown>) {
  return answerGrill(
    new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}/answer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ date: DATE, grillId }) },
  );
}

function apply(grillId: string, body: Record<string, unknown>) {
  return applyGrill(
    new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ date: DATE, grillId }) },
  );
}

function getSession(grillId: string) {
  return getGrill(new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}`), {
    params: Promise.resolve({ date: DATE, grillId }),
  });
}

function cancel(grillId: string) {
  return cancelGrill(
    new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}`, { method: "DELETE" }),
    { params: Promise.resolve({ date: DATE, grillId }) },
  );
}

async function startToProposal(mode: "create" | "revise", taskId?: string) {
  const startBody =
    mode === "create" ? { mode, intent: "Refactor the reporting module" } : { mode, taskId };
  const startRes = await start(startBody);
  const startJson = await startRes.json();
  const { grillId } = startJson;
  if (startJson.turn.kind === "proposal") {
    return { grillId, proposal: startJson.turn };
  }
  const answerRes = await answer(grillId, { message: "It should dedupe helpers and add a test." });
  const answerJson = await answerRes.json();
  return { grillId, proposal: answerJson.turn, computedWarnings: answerJson.computedWarnings };
}

describe("grill v2 guards and start", () => {
  it("returns 403 when the flag is off", async () => {
    await configureEnv();
    await seedDay([reviseTask()]);
    const res = await start({ mode: "create", intent: "x" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for a cross-origin request", async () => {
    await configureEnv({ enableGrill: true });
    const res = await start(
      { mode: "create", intent: "x" },
      { origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for an unknown mode, missing intent, or missing taskId", async () => {
    await configureEnv({ enableGrill: true });
    expect((await start({ mode: "bogus" })).status).toBe(400);
    expect((await start({ mode: "create" })).status).toBe(400);
    expect((await start({ mode: "create", intent: "   " })).status).toBe(400);
    expect((await start({ mode: "revise" })).status).toBe(400);
  });

  it("returns 404 for a revise start on an unknown task", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const res = await start({ mode: "revise", taskId: "does-not-exist" });
    expect(res.status).toBe(404);
    // The revise branch registers the session BEFORE reading the day (finding 1); the 404 path
    // must delete it again so no busy session leaks for a task that does not exist.
    expect(getGrillSessions().size).toBe(0);
  });

  it("recovers a revise turn-1 note miss with one corrective re-ask (spec 6.1)", async () => {
    await configureEnv({ enableGrill: true, fixture: "revise-no-note" });
    await seedDay([reviseTask()]);
    const res = await start({ mode: "revise", taskId: "task-1" });
    expect(res.status).toBe(200);
    expect((await res.json()).turn.kind).toBe("proposal");
    expect(getGrillSessions().size).toBe(1);
  });

  it("502s a persistent revise turn-1 note miss and registers no session", async () => {
    await configureEnv({ enableGrill: true, fixture: "revise-no-note-persistent" });
    await seedDay([reviseTask()]);
    const res = await start({ mode: "revise", taskId: "task-1" });
    expect(res.status).toBe(502);
    expect(getGrillSessions().size).toBe(0);
  });
});

describe("grill v2 guard coverage on every route", () => {
  // Every route must run assertGrillRouteAllowed (flag gate + local-origin) BEFORE it touches the
  // session, so a disabled flag or a cross-origin request is 403 even with an arbitrary grillId
  // and no live session. The two cases fail for DIFFERENT reasons on purpose: flag-off exercises
  // the flag gate, cross-origin exercises assertLocalOrigin. Removing the guard call from any one
  // route makes its cases fall through to the session lookup (410, or 200 for DELETE) and fail.
  const grillId = "guard-probe";
  const cases: Array<{
    name: string;
    call: (headers: Record<string, string>) => Promise<Response>;
  }> = [
    {
      name: "answer",
      call: (headers) =>
        answerGrill(
          new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}/answer`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify({ message: "hi" }),
          }),
          { params: Promise.resolve({ date: DATE, grillId }) },
        ),
    },
    {
      name: "apply",
      call: (headers) =>
        applyGrill(
          new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}/apply`, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify({ proposal: {} }),
          }),
          { params: Promise.resolve({ date: DATE, grillId }) },
        ),
    },
    {
      name: "GET",
      call: (headers) => getSessionWith(headers),
    },
    {
      name: "DELETE",
      call: (headers) =>
        cancelGrill(
          new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}`, {
            method: "DELETE",
            headers,
          }),
          { params: Promise.resolve({ date: DATE, grillId }) },
        ),
    },
  ];

  function getSessionWith(headers: Record<string, string>) {
    return getGrill(
      new Request(`http://localhost/api/studio/day/${DATE}/grill/${grillId}`, { headers }),
      { params: Promise.resolve({ date: DATE, grillId }) },
    );
  }

  it.each(cases)("403s the $name route when the flag is off", async ({ call }) => {
    await configureEnv(); // grill flag off
    expect((await call({})).status).toBe(403);
  });

  it.each(cases)("403s the $name route for a cross-origin request (flag on)", async ({ call }) => {
    await configureEnv({ enableGrill: true });
    expect((await call({ origin: "https://evil.example.com" })).status).toBe(403);
  });
});

describe("grill v2 create flow", () => {
  it("runs start -> answer -> apply and appends a ready task", async () => {
    await configureEnv({ enableGrill: true });
    const seeded = await seedDay([reviseTask({ id: "existing-1", title: "Existing" })]);

    const startRes = await start({ mode: "create", intent: "Refactor the reporting module" });
    expect(startRes.status).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.turn.kind).toBe("questions");
    expect(startJson.grillId).toBeTruthy();

    const answerRes = await answer(startJson.grillId, { message: "Dedupe the helpers." });
    expect(answerRes.status).toBe(200);
    const answerJson = await answerRes.json();
    expect(answerJson.turn.kind).toBe("proposal");
    expect(Array.isArray(answerJson.computedWarnings)).toBe(true);
    expect(answerJson.computedWarnings).toEqual([]);

    const applyRes = await apply(startJson.grillId, { proposal: answerJson.turn });
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    expect(applyJson.day.tasks).toHaveLength(2);
    const created = applyJson.day.tasks.find((t: TaskRecord) => t.id === applyJson.task.id);
    expect(created.status).toBe("todo");
    expect(created.sourceRefs).toEqual([]);
    expect(created.agentReadiness).toBe("ready");
    expect(created.readinessWarnings).toEqual([]);
    expect(created.title).toBe("Refactor the reporting module");
    expect(seeded.day.tasks).toHaveLength(1);

    const session = getGrillSessions().get(startJson.grillId);
    expect(session?.appliedTombstone?.taskId).toBe(applyJson.task.id);
  });

  it("applies onto a date with no existing day.json (readOrCreateDay)", async () => {
    await configureEnv({ enableGrill: true });
    // No seedDay: the date has no day.json yet.
    const { grillId, proposal } = await startToProposal("create");
    const applyRes = await apply(grillId, { proposal });
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    expect(applyJson.day.tasks).toHaveLength(1);
    const persisted = await readDay();
    expect(persisted.day.tasks.find((t) => t.id === applyJson.task.id)).toBeDefined();
  });

  it("replays a double-apply from the tombstone without creating a duplicate", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([]);
    const { grillId, proposal } = await startToProposal("create");

    const first = await apply(grillId, { proposal });
    const firstJson = await first.json();
    const second = await apply(grillId, { proposal });
    const secondJson = await second.json();

    expect(second.status).toBe(200);
    expect(secondJson.task.id).toBe(firstJson.task.id);
    const matches = secondJson.day.tasks.filter((t: TaskRecord) => t.id === firstJson.task.id);
    expect(matches).toHaveLength(1);
  });

  it("drafts immediately on the draft-now exit ramp", async () => {
    await configureEnv({ enableGrill: true });
    const startRes = await start({ mode: "create", intent: "Something small" });
    const { grillId } = await startRes.json();
    const res = await answer(grillId, { draftNow: true });
    expect(res.status).toBe(200);
    expect((await res.json()).turn.kind).toBe("proposal");
  });

  it("returns computedWarnings that reflect a real gap in the proposal", async () => {
    await configureEnv({ enableGrill: true, fixture: "gappy-proposal" });
    const startRes = await start({ mode: "create", intent: "Deep task with a gap" });
    expect(startRes.status).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.turn.kind).toBe("proposal");
    expect(startJson.computedWarnings).toContain("missing verification for deep or delegated work");
  });

  it("returns a proposal on the first turn when the intent is already complete", async () => {
    await configureEnv({ enableGrill: true, fixture: "proposal-first" });
    const res = await start({ mode: "create", intent: "Fully specified task" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.turn.kind).toBe("proposal");
    expect(Array.isArray(json.computedWarnings)).toBe(true);
  });

  it("502s with a stdout tail when the model never matches the schema (persistent)", async () => {
    await configureEnv({ enableGrill: true, fixture: "bad-schema" });
    const res = await start({ mode: "create", intent: "x" });
    expect(res.status).toBe(502);
    expect(typeof (await res.json()).stdoutTail).toBe("string");
    expect(getGrillSessions().size).toBe(0);
  });

  it("recovers a first-turn schema miss with one corrective re-ask (bad then good)", async () => {
    await configureEnv({ enableGrill: true, fixture: "bad-then-good" });
    const res = await start({ mode: "create", intent: "x" });
    expect(res.status).toBe(200);
    expect((await res.json()).turn.kind).toBe("questions");
    expect(getGrillSessions().size).toBe(1);
  });
});

describe("grill v2 revise flow", () => {
  it("replaces the body and preserves the non-writable fields", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const before = (await readDay()).day.tasks[0];

    const { grillId, proposal, computedWarnings } = await startToProposal("revise", "task-1");
    expect(proposal.kind).toBe("proposal");
    expect(Array.isArray(computedWarnings)).toBe(true);

    const applyRes = await apply(grillId, { proposal });
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    const saved = applyJson.day.tasks.find((t: TaskRecord) => t.id === "task-1");

    // Replaced.
    expect(saved.title).toBe("Refactor the reporting module");
    expect(saved.estimateMinutes).toBe(60);
    expect(saved.workDepth).toBe("deep");
    expect(saved.ticketFields.objective).toBe(
      "Refactor the reporting module to remove duplicated helpers.",
    );
    // Preserved.
    expect(saved.kind).toBe(before.kind);
    expect(saved.status).toBe(before.status);
    expect(saved.createdAt).toBe(before.createdAt);
    expect(saved.sourceRefs).toEqual(before.sourceRefs);
    expect(saved.trackerIds).toEqual(before.trackerIds);
    expect(saved.scheduledStart).toBe(before.scheduledStart);
  });

  it("rejects a kind flip at apply with 400 kind-mismatch", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask({ kind: "focus" })]); // fixture proposal kind is "task"
    const { grillId, proposal } = await startToProposal("revise", "task-1");
    const res = await apply(grillId, { proposal });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("kind-mismatch");
  });

  it("returns 409 session-exists on a double-start and honors restart", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const firstRes = await start({ mode: "revise", taskId: "task-1" });
    const { grillId: firstId } = await firstRes.json();

    const dupe = await start({ mode: "revise", taskId: "task-1" });
    expect(dupe.status).toBe(409);
    const dupeJson = await dupe.json();
    expect(dupeJson.code).toBe("session-exists");
    expect(dupeJson.grillId).toBe(firstId);

    const restarted = await start({ mode: "revise", taskId: "task-1", restart: true });
    expect(restarted.status).toBe(200);
    const { grillId: newId } = await restarted.json();
    expect(newId).not.toBe(firstId);
    expect(getGrillSessions().has(firstId)).toBe(false);
  });

  it("returns 409 turn-in-flight on restart while the existing session is mid-turn (no silent fork)", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const firstRes = await start({ mode: "revise", taskId: "task-1" });
    const { grillId: firstId } = await firstRes.json();
    const session = getGrillSessions().get(firstId);
    if (session) session.busy = true;

    // restart:true must NOT tear down a session mid-turn (spec 6.2 turn lock); it waits.
    const res = await start({ mode: "revise", taskId: "task-1", restart: true });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("turn-in-flight");
    // The busy session survives and no second session was forked.
    expect(getGrillSessions().has(firstId)).toBe(true);
    expect(getGrillSessions().size).toBe(1);
  });

  it("lets exactly one of two concurrent revise starts register (double-start TOCTOU closed)", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    // Fire two revise starts on the same task without awaiting the first. The live-session check
    // and the (busy) session registration must be one synchronous block (finding 1), so exactly
    // one wins with 200 and the other 409s session-exists. If registration sat after the
    // readExistingDay await, both would pass the check and both would register -> [200,200], size 2.
    const [first, second] = await Promise.all([
      start({ mode: "revise", taskId: "task-1" }),
      start({ mode: "revise", taskId: "task-1" }),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const conflicted = first.status === 409 ? first : second;
    expect((await conflicted.json()).code).toBe("session-exists");
    expect(getGrillSessions().size).toBe(1);
  });

  it("allows a fresh revise start after a prior grill applied (tombstone does not block)", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const { grillId, proposal } = await startToProposal("revise", "task-1");
    const applyRes = await apply(grillId, { proposal });
    expect(applyRes.status).toBe(200);
    // The applied session keeps a tombstone for replay; it must NOT block a new revise grill.
    expect(getGrillSessions().get(grillId)?.appliedTombstone?.taskId).toBe("task-1");

    const restart = await start({ mode: "revise", taskId: "task-1" });
    expect(restart.status).toBe(200);
    const restartJson = await restart.json();
    expect(restartJson.grillId).not.toBe(grillId);
    expect(restartJson.turn.kind).toBe("questions");
  });

  it("returns 409 task-changed with freshTask, then applies after acknowledge", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    const { grillId, proposal } = await startToProposal("revise", "task-1");

    // Out-of-band edit bumps the task updatedAt.
    const bundle = await readDay();
    const edited = {
      ...bundle.day,
      tasks: bundle.day.tasks.map((t) =>
        t.id === "task-1"
          ? { ...t, title: "Edited mid-grill", updatedAt: "2099-07-08T12:00:00.000Z" }
          : t,
      ),
    };
    await saveDay(DATE, edited, { baseUpdatedAt: bundle.day.updatedAt });

    const stale = await apply(grillId, { proposal });
    expect(stale.status).toBe(409);
    const staleJson = await stale.json();
    expect(staleJson.code).toBe("task-changed");
    expect(staleJson.freshTask.title).toBe("Edited mid-grill");
    expect(typeof staleJson.error).toBe("string");
    expect(staleJson.error.length).toBeGreaterThan(0);

    const acked = await apply(grillId, {
      proposal,
      acknowledgeTaskUpdatedAt: staleJson.freshTask.updatedAt,
    });
    expect(acked.status).toBe(200);
    expect((await acked.json()).task.title).toBe("Refactor the reporting module");
  });
});

describe("grill v2 conflict, lock, and lifecycle", () => {
  it("returns 400 for malformed answer payloads", async () => {
    await configureEnv({ enableGrill: true });
    const startRes = await start({ mode: "create", intent: "x" });
    const { grillId } = await startRes.json();
    expect((await answer(grillId, { message: "   " })).status).toBe(400);
    expect((await answer(grillId, { message: "x", draftNow: true })).status).toBe(400);
    expect((await answer(grillId, {})).status).toBe(400);
  });

  it("returns 409 turn-in-flight when the session is busy", async () => {
    await configureEnv({ enableGrill: true });
    const startRes = await start({ mode: "create", intent: "x" });
    const { grillId } = await startRes.json();
    const session = getGrillSessions().get(grillId);
    if (session) session.busy = true;
    const res = await answer(grillId, { message: "valid message" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("turn-in-flight");
  });

  it("sets the busy lock so exactly one of two concurrent answers wins", async () => {
    await configureEnv({ enableGrill: true });
    const startRes = await start({ mode: "create", intent: "x" });
    const { grillId } = await startRes.json();
    // Fire two answers without awaiting the first. The route's synchronous check-and-set of
    // session.busy must let exactly one through and 409 the other (spec 6.2 per-session lock);
    // the winner holds busy across a real fixture-process spawn, guaranteeing overlap.
    const [first, second] = await Promise.all([
      answer(grillId, { message: "first message" }),
      answer(grillId, { message: "second message" }),
    ]);
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const conflicted = first.status === 409 ? first : second;
    expect((await conflicted.json()).code).toBe("turn-in-flight");
  });

  it("returns 409 proposal-stale when the applied proposal is tampered", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([]);
    const { grillId, proposal } = await startToProposal("create");
    const tampered = { ...proposal, impactLine: "Tampered impact line." };
    const res = await apply(grillId, { proposal: tampered });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("proposal-stale");
  });

  it("returns 410 on answer, apply, and GET after the registry is wiped", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([]);
    const { grillId, proposal } = await startToProposal("create");
    getGrillSessions().clear();
    expect((await answer(grillId, { message: "x" })).status).toBe(410);
    expect((await apply(grillId, { proposal })).status).toBe(410);
    expect((await getSession(grillId)).status).toBe(410);
  });

  it("leaves the board byte-identical after start + cancel (nothing written without apply)", async () => {
    const rootDir = await configureEnv({ enableGrill: true });
    await seedDay([reviseTask()]);
    // Compare the raw day.json bytes and the day directory listing, not normalized JSON: a
    // normalization-repairable rewrite or a sibling-file write would slip past readExistingDay.
    const dayDir = path.join(rootDir, DATE);
    const dayJsonPath = path.join(dayDir, "day.json");
    const before = await fs.readFile(dayJsonPath);
    const listingBefore = (await fs.readdir(dayDir)).sort();

    const startRes = await start({ mode: "revise", taskId: "task-1" });
    const { grillId } = await startRes.json();
    const cancelRes = await cancel(grillId);
    expect(cancelRes.status).toBe(200);

    const after = await fs.readFile(dayJsonPath);
    const listingAfter = (await fs.readdir(dayDir)).sort();
    expect(after.equals(before)).toBe(true);
    expect(listingAfter).toEqual(listingBefore);
    expect(getGrillSessions().has(grillId)).toBe(false);
  });
});

describe("grill v2 round cap and corrections", () => {
  it("increments questionRounds on each pre-proposal question turn", async () => {
    await configureEnv({ enableGrill: true, fixture: "always-questions" });
    const startRes = await start({ mode: "create", intent: "Keep asking" });
    const { grillId } = await startRes.json();
    expect(getGrillSessions().get(grillId)?.questionRounds).toBe(1);
    await answer(grillId, { message: "more context" });
    expect(getGrillSessions().get(grillId)?.questionRounds).toBe(2);
  });

  it("forces a proposal once the pre-proposal round cap is reached", async () => {
    await configureEnv({ enableGrill: true, fixture: "always-questions" });
    const startRes = await start({ mode: "create", intent: "Keep asking" });
    const { grillId } = await startRes.json();
    const session = getGrillSessions().get(grillId);
    if (session) session.questionRounds = PRE_PROPOSAL_ROUND_CAP;
    const res = await answer(grillId, { message: "still going" });
    expect(res.status).toBe(200);
    expect((await res.json()).turn.kind).toBe("proposal");
  });

  it("exempts correction turns after a proposal from the round cap", async () => {
    await configureEnv({ enableGrill: true });
    const { grillId } = await startToProposal("create");
    const session = getGrillSessions().get(grillId);
    if (session) session.questionRounds = PRE_PROPOSAL_ROUND_CAP + 3;
    // A post-proposal correction that yields a clarifying question must NOT be force-drafted.
    const res = await answer(grillId, { message: "Wait, clarify this [[QUESTIONS]]" });
    expect(res.status).toBe(200);
    expect((await res.json()).turn.kind).toBe("questions");
  });

  it("accepts a correction after a proposal and returns a revised proposal", async () => {
    await configureEnv({ enableGrill: true });
    await seedDay([]);
    const { grillId } = await startToProposal("create");
    const res = await answer(grillId, { message: "Make the estimate 30 [[PROPOSAL]]" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.turn.kind).toBe("proposal");
    expect(Array.isArray(json.computedWarnings)).toBe(true);
  });
});

async function seedQueueItem(overrides: Partial<QueueCandidate> = {}): Promise<QueueItem> {
  const file = await mergeSweep(
    [
      {
        title: "Fix login timeout",
        summary: "Login times out after a short wait.",
        harvestedContext: "The teammate flagged repeated timeouts on the login page.",
        sourceRefs: [{ kind: "slack", label: "chan-one", url: "https://example.test/thread" }],
        fingerprints: ["slack:c1:1"],
        ...overrides,
      },
    ],
    { sources: [] },
  );
  return file.items[file.items.length - 1];
}

describe("grill v2 from the monitoring queue (spec 6)", () => {
  it("builds a create-intent that carries the candidate title, summary, context, and sources", () => {
    const intent = buildQueueGrillIntent(
      {
        id: "queue-1",
        status: "queued",
        title: "Fix login timeout",
        summary: "Login times out after a short wait.",
        harvestedContext: "The teammate flagged repeated timeouts.",
        sourceRefs: [{ kind: "slack", label: "chan-one", url: "https://example.test/thread" }],
        fingerprints: ["slack:c1:1"],
        seenCount: 1,
        firstSeenAt: "2099-07-08T00:00:00.000Z",
        lastSeenAt: "2099-07-08T00:00:00.000Z",
      },
      "Also confirm the retry budget.",
    );
    expect(intent).toContain("Fix login timeout");
    expect(intent).toContain("Login times out after a short wait.");
    expect(intent).toContain("The teammate flagged repeated timeouts.");
    expect(intent).toContain("slack: chan-one (https://example.test/thread)");
    expect(intent).toContain("Also confirm the retry budget.");
  });

  it("seeds the session with queueItemId and consumes the item on apply (no day yet)", async () => {
    await configureEnv({ enableGrill: true });
    // No seedDay: grilling from the queue must work with no existing day plan (readOrCreateDay).
    const item = await seedQueueItem();

    const startRes = await start({ mode: "create", queueItemId: item.id });
    expect(startRes.status).toBe(200);
    const startJson = await startRes.json();
    expect(startJson.turn.kind).toBe("questions");
    expect(getGrillSessions().get(startJson.grillId)?.queueItemId).toBe(item.id);

    const answerRes = await answer(startJson.grillId, { message: "Dedupe the helpers." });
    const answerJson = await answerRes.json();
    expect(answerJson.turn.kind).toBe("proposal");

    const applyRes = await apply(startJson.grillId, { proposal: answerJson.turn });
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    expect(applyJson.day.tasks).toHaveLength(1);

    const consumed = (await readQueue()).items.find((entry) => entry.id === item.id);
    expect(consumed?.status).toBe("consumed");
    expect(consumed?.consumedTaskId).toBe(applyJson.task.id);
  });

  it("replays a double-apply from the tombstone and leaves the item consumed once", async () => {
    await configureEnv({ enableGrill: true });
    const item = await seedQueueItem();
    const startRes = await start({ mode: "create", queueItemId: item.id });
    const { grillId } = await startRes.json();
    const answerJson = await (await answer(grillId, { message: "Dedupe." })).json();

    const first = await apply(grillId, { proposal: answerJson.turn });
    const firstJson = await first.json();
    const second = await apply(grillId, { proposal: answerJson.turn });
    expect(second.status).toBe(200);
    expect((await second.json()).task.id).toBe(firstJson.task.id);

    const consumed = (await readQueue()).items.find((entry) => entry.id === item.id);
    expect(consumed?.status).toBe("consumed");
    expect(consumed?.consumedTaskId).toBe(firstJson.task.id);
  });

  it("returns 404 for an unknown queueItemId and leaks no session", async () => {
    await configureEnv({ enableGrill: true });
    const res = await start({ mode: "create", queueItemId: "queue-does-not-exist" });
    expect(res.status).toBe(404);
    expect(getGrillSessions().size).toBe(0);
  });

  it("returns 409 not-queued when the queue item is already dismissed", async () => {
    await configureEnv({ enableGrill: true });
    const item = await seedQueueItem();
    await dismissQueueItem(item.id, (await readQueue()).updatedAt);
    const res = await start({ mode: "create", queueItemId: item.id });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not-queued");
    expect(getGrillSessions().size).toBe(0);
  });

  it("apply still succeeds when the item was dismissed mid-grill (best-effort consume no-ops)", async () => {
    await configureEnv({ enableGrill: true });
    const item = await seedQueueItem();
    const startRes = await start({ mode: "create", queueItemId: item.id });
    const { grillId } = await startRes.json();

    // Out-of-band dismiss while the grill is in progress (dismiss-while-grilling race).
    await dismissQueueItem(item.id, (await readQueue()).updatedAt);

    const answerJson = await (await answer(grillId, { message: "Dedupe." })).json();
    const applyRes = await apply(grillId, { proposal: answerJson.turn });
    expect(applyRes.status).toBe(200); // consume no-ops but never fails the apply
    expect((await applyRes.json()).day.tasks).toHaveLength(1);

    const stillDismissed = (await readQueue()).items.find((entry) => entry.id === item.id);
    expect(stillDismissed?.status).toBe("dismissed");
    expect(stillDismissed?.consumedTaskId).toBeUndefined();
  });

  it("keeps the apply a 200 and leaves the item queued when the best-effort consume rejects", async () => {
    await configureEnv({ enableGrill: true });
    const item = await seedQueueItem();
    const startRes = await start({ mode: "create", queueItemId: item.id });
    const { grillId } = await startRes.json();
    const answerJson = await (await answer(grillId, { message: "Dedupe." })).json();

    // Force the server-internal consume to reject once (e.g. a disk error mid read-modify-write).
    // Spec 6: a consume failure is logged and leaves the item queued but MUST NOT fail the apply.
    // If a refactor dropped the .catch (or ran consume before saveDay), the created task would come
    // back as a 500 and double-charge the retry; this test pins the guard.
    consumeQueueItemMock.mockClear();
    consumeQueueItemMock.mockRejectedValueOnce(new Error("queue write failed"));

    const applyRes = await apply(grillId, { proposal: answerJson.turn });
    expect(applyRes.status).toBe(200);
    const applyJson = await applyRes.json();
    expect(applyJson.day.tasks).toHaveLength(1);
    expect(applyJson.task.id).toBeTruthy();
    expect(consumeQueueItemMock).toHaveBeenCalledWith(item.id, applyJson.task.id);

    // The rejection means the real consume never ran, so the candidate is still awaiting triage.
    const stillQueued = (await readQueue()).items.find((entry) => entry.id === item.id);
    expect(stillQueued?.status).toBe("queued");
    expect(stillQueued?.consumedTaskId).toBeUndefined();
  });
});
