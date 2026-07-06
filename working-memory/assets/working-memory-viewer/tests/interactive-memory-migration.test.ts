import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DaySaveConflictError,
  getCurrentStudioResponse,
  isMorningRunComplete,
  listInteractiveDays,
  normalizeDayPlan,
  readOrCreateDay,
  readPromptSettings,
  saveDay,
  savePromptSettings,
  selectCurrentInteractiveDay,
} from "@/lib/interactive-memory/fs";
import {
  dayFilePaths,
  interactiveMemoryIndexPath,
  interactiveMemorySettingsPath,
} from "@/lib/interactive-memory/paths";
import {
  DAY_SCHEMA_VERSION,
  INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION,
  type InteractiveDayIndex,
  PROMPT_SETTINGS_SCHEMA_VERSION,
} from "@/lib/interactive-memory/types";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("interactive memory structured task migration", () => {
  it("collapses v1 agent context into structured ticket fields", () => {
    const day = normalizeDayPlan({
      schemaVersion: 1,
      date: "2026-05-22",
      timezone: "America/New_York",
      title: "2026-05-22: Working Memory",
      status: "active",
      settings: {
        startHour: 8,
        endHour: 18,
        slotMinutes: 30,
        completionTargetPercent: 100,
      },
      tasks: [
        {
          id: "task-1",
          title: "Ship interactive daily planner",
          status: "in_progress",
          kind: "focus",
          priority: "high",
          estimateMinutes: 120,
          project: "personal-notes",
          sourceRefs: [{ kind: "manual", label: "User request" }],
          agentContext: {
            objective: "Build the file-backed daily planner prototype.",
            context: "The user wants to replace Markdown daily notes.",
            constraints: ["Persist state to JSON files."],
            files: ["apps/working-memory-viewer"],
            dataSources: ["Google Calendar"],
            acceptanceCriteria: ["Tasks can be marked done, in progress, and review."],
            verification: ["npm run typecheck"],
            definitionOfDone: ["Prototype runs locally."],
          },
          rawThoughts: "Keep it delightful.",
          createdAt: "2026-05-22T00:00:00Z",
          updatedAt: "2026-05-22T00:00:00Z",
        },
      ],
      dayNotes: "",
      ideas: { text: "" },
      generatedAt: "2026-05-22T00:00:00Z",
      updatedAt: "2026-05-22T00:00:00Z",
    });

    expect(day.schemaVersion).toBe(DAY_SCHEMA_VERSION);
    expect(day.lifecycle).toEqual({});
    expect(isMorningRunComplete(day)).toBe(false);
    expect(day.tasks[0].ticketFields.objective).toBe(
      "Build the file-backed daily planner prototype.",
    );
    expect(day.tasks[0].ticketFields.background).toContain("apps/working-memory-viewer");
    expect(day.tasks[0].ticketFields.background).toContain("Google Calendar");
    expect(day.tasks[0].ticketFields.constraintsNonGoals).toContain("Persist state to JSON files.");
    expect(day.tasks[0].ticketFields.doneWhen).toContain(
      "Tasks can be marked done, in progress, and review.",
    );
    expect(day.tasks[0].ticketFields.doneWhen).toContain("Prototype runs locally.");
    expect(day.tasks[0].ticketFields.verification).toContain("npm run typecheck");
    expect(day.tasks[0].workDepth).toBe("deep");
    expect(day.tasks[0].agentReadiness).toBe("ready");
    expect(day.tasks[0].readinessWarnings).toEqual([]);
    expect("priority" in day.tasks[0]).toBe(false);
    expect("agentContext" in day.tasks[0]).toBe(false);
    expect("brief" in day.tasks[0]).toBe(false);
    expect("rawThoughts" in day.tasks[0]).toBe(false);
    expect("ticketBody" in day.tasks[0]).toBe(false);
  });

  it("keeps sparse v2 tasks readable", () => {
    const day = normalizeDayPlan({
      date: "2026-05-22",
      tasks: [
        {
          title: "Small task",
          brief: {
            task: "Small task",
            doneWhen: "It works.",
          },
        },
      ],
    });

    expect(day.tasks[0].title).toBe("Small task");
    expect(day.tasks[0].ticketFields.objective).toBe("Small task");
    expect(day.tasks[0].ticketFields.background).toBe("");
    expect(day.tasks[0].ticketFields.doneWhen).toBe("It works.");
    expect(day.tasks[0].kind).toBe("task");
    expect(day.tasks[0].estimateMinutes).toBe(30);
    expect(day.tasks[0].workDepth).toBe("shallow");
    expect(day.tasks[0].agentReadiness).toBe("ready");
    expect(day.tasks[0].readinessWarnings).toEqual([]);
    expect(day.lifecycle).toEqual({});
  });

  it("migrates v5 ticket body sections to structured fields", () => {
    const ticketBody = [
      "## Objective",
      "",
      "Ship a qualified work order.",
      "",
      "## Background",
      "",
      "The user confirmed the task has enough context.",
      "",
      "## Sources",
      "",
      "None needed",
      "",
      "## Constraints / Non-goals",
      "",
      "Keep the change scoped.",
      "",
      "## Done When",
      "",
      "The task copies a complete prompt.",
      "",
      "## Verification",
      "",
      "Prompt test passes.",
      "",
      "## Estimate",
      "",
      "45 minutes, deep work.",
    ].join("\n");
    const day = normalizeDayPlan({
      schemaVersion: 5,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Qualified task",
          status: "todo",
          kind: "task",
          estimateMinutes: 45,
          workDepth: "deep",
          agentReadiness: "ready",
          readinessWarnings: [],
          ticketBody,
          sourceRefs: [{ kind: "manual", label: "Manual" }],
          brief: {
            task: "Qualified task",
            context: "",
            doneWhen: "Prompt copies cleanly.",
          },
        },
      ],
      breaks: [
        {
          id: "break-1",
          label: "Lunch",
          start: "2026-05-22T12:30:00",
          end: "2026-05-22T13:00:00",
          kind: "lunch",
        },
      ],
    });

    expect(day.schemaVersion).toBe(DAY_SCHEMA_VERSION);
    expect(day.tasks[0]).toMatchObject({
      workDepth: "deep",
      agentReadiness: "ready",
      readinessWarnings: [],
      ticketFields: {
        objective: "Ship a qualified work order.",
        background: "The user confirmed the task has enough context.",
        sourcesOverride: "None needed",
        constraintsNonGoals: "Keep the change scoped.",
        doneWhen: "The task copies a complete prompt.",
        verification: "Prompt test passes.",
      },
    });
    expect("ticketBody" in day.tasks[0]).toBe(false);
    expect(day.breaks).toEqual([
      {
        id: "break-1",
        label: "Lunch",
        start: "2026-05-22T12:30:00",
        end: "2026-05-22T13:00:00",
        kind: "lunch",
      },
    ]);
  });

  it("downgrades v5 ready tasks when ticket body sections are missing", () => {
    const day = normalizeDayPlan({
      schemaVersion: 5,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Too optimistic",
          status: "todo",
          kind: "task",
          estimateMinutes: 45,
          workDepth: "deep",
          agentReadiness: "ready",
          readinessWarnings: [],
          ticketBody: [
            "## Objective",
            "",
            "Do the task.",
            "",
            "## Sources",
            "",
            "Unknown",
            "",
            "## Done When",
            "",
            "It is done.",
            "",
            "## Verification",
            "",
            "Unknown",
            "",
            "## Estimate",
            "",
            "45 minutes.",
          ].join("\n"),
          brief: {
            task: "Do the task.",
            context: "",
            doneWhen: "It is done.",
          },
        },
      ],
    });

    expect(day.tasks[0].agentReadiness).toBe("warning");
    expect(day.tasks[0].readinessWarnings).toContain(
      "missing background for deep or delegated work",
    );
    expect(day.tasks[0].readinessWarnings).toContain(
      "missing constraints / non-goals for deep or delegated work",
    );
    expect(day.tasks[0].readinessWarnings).toContain("missing sources for deep or delegated work");
    expect(day.tasks[0].readinessWarnings).toContain(
      "missing verification for deep or delegated work",
    );
  });

  it("marks complete-looking legacy tasks ready after structured validation", () => {
    const ticketBody = [
      "## Objective",
      "",
      "Do the legacy task.",
      "",
      "## Background",
      "",
      "Existing context.",
      "",
      "## Sources",
      "",
      "None needed",
      "",
      "## Constraints / Non-goals",
      "",
      "Keep it small.",
      "",
      "## Done When",
      "",
      "It is complete.",
      "",
      "## Verification",
      "",
      "Read the result.",
      "",
      "## Estimate",
      "",
      "30 minutes, shallow work.",
    ].join("\n");

    const day = normalizeDayPlan({
      schemaVersion: 4,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Legacy task",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          workDepth: "shallow",
          agentReadiness: "ready",
          readinessWarnings: [],
          ticketBody,
          brief: {
            task: "Do the legacy task.",
            context: "Existing context.",
            doneWhen: "It is complete.",
          },
        },
      ],
    });

    expect(day.tasks[0].agentReadiness).toBe("ready");
    expect(day.tasks[0].readinessWarnings).toEqual([]);
  });

  it("ignores stale legacy text fields on schema v6 tasks after the v7 migration", () => {
    const day = normalizeDayPlan({
      schemaVersion: 6,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Current v6 task",
          status: "todo",
          kind: "focus",
          estimateMinutes: 90,
          workDepth: "deep",
          agentReadiness: "ready",
          readinessWarnings: [],
          sourceRefs: [],
          ticketFields: {
            objective: "",
            background: "",
            constraintsNonGoals: "",
            doneWhen: "",
            verification: "",
          },
          ticketBody: [
            "## Objective",
            "",
            "Legacy objective should not be reused.",
            "",
            "## Background",
            "",
            "Legacy background should not be reused.",
            "",
            "## Sources",
            "",
            "None needed",
            "",
            "## Constraints / Non-goals",
            "",
            "Legacy constraints should not be reused.",
            "",
            "## Done When",
            "",
            "Legacy done-when should not be reused.",
            "",
            "## Verification",
            "",
            "Legacy verification should not be reused.",
            "",
            "## Estimate",
            "",
            "90 minutes, deep work.",
          ].join("\n"),
          brief: {
            task: "Legacy brief should not be reused.",
            context: "Legacy brief context should not be reused.",
            doneWhen: "Legacy brief done-when should not be reused.",
          },
        },
      ],
    });

    expect(day.tasks[0].ticketFields).toMatchObject({
      objective: "Current v6 task",
      background: "",
      constraintsNonGoals: "",
      doneWhen: "",
      verification: "",
    });
    expect(day.tasks[0].agentReadiness).toBe("incomplete");
    expect(day.tasks[0].readinessWarnings).toContain("missing done when");
  });

  it("preserves valid agent run metadata and strips malformed runs", () => {
    const day = normalizeDayPlan({
      schemaVersion: 6,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Current task",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          workDepth: "shallow",
          sourceRefs: [{ kind: "manual", label: "Manual" }],
          ticketFields: {
            objective: "Keep the valid run metadata.",
            background: "",
            constraintsNonGoals: "",
            doneWhen: "The valid run is still visible.",
            verification: "",
          },
          agentRuns: [
            {
              id: "agent-run-1",
              model: "sonnet",
              name: "current-task",
              cwd: "/tmp",
              launchedAt: "2026-05-22T10:00:00Z",
              status: "launched",
              promptSha256: "abc123",
              prompt: "must not persist",
            },
            {
              id: "agent-run-bad",
              model: "bogus",
              name: "bad",
              launchedAt: "2026-05-22T10:00:00Z",
              status: "launched",
              promptSha256: "def456",
            },
          ],
        },
      ],
    });

    expect(day.schemaVersion).toBe(DAY_SCHEMA_VERSION);
    expect(day.tasks[0].agentRuns).toEqual([
      {
        id: "agent-run-1",
        model: "sonnet",
        name: "current-task",
        cwd: "/tmp",
        launchedAt: "2026-05-22T10:00:00Z",
        status: "launched",
        promptSha256: "abc123",
      },
    ]);
    expect(JSON.stringify(day.tasks[0].agentRuns)).not.toContain("must not persist");
  });

  it("normalizes task agent names for deploy", () => {
    const day = normalizeDayPlan({
      schemaVersion: 7,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-stored",
          title: "Noisy task",
          agentName: " Fix: Account Balance!!! ",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          workDepth: "shallow",
          sourceRefs: [{ kind: "manual", label: "Manual" }],
          ticketFields: {
            objective: "Use the stored name.",
            background: "",
            constraintsNonGoals: "",
            doneWhen: "Name is stored.",
            verification: "",
          },
        },
        {
          id: "task-run",
          title: "Already deployed",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          workDepth: "shallow",
          sourceRefs: [{ kind: "manual", label: "Manual" }],
          ticketFields: {
            objective: "Reuse the latest run name.",
            background: "",
            constraintsNonGoals: "",
            doneWhen: "Name is reused.",
            verification: "",
          },
          agentRuns: [
            {
              id: "agent-run-1",
              model: "sonnet",
              name: "old-name",
              cwd: "/home/user/project",
              launchedAt: "2026-05-22T10:00:00Z",
              status: "launched",
              promptSha256: "abc123",
            },
          ],
        },
        {
          id: "task-generated",
          title: "Fix account balance rollup",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          workDepth: "shallow",
          sourceRefs: [{ kind: "manual", label: "Manual" }],
          ticketFields: {
            objective: "Fix the account balance rollup calculation.",
            background: "",
            constraintsNonGoals: "",
            doneWhen: "The balance is fixed.",
            verification: "",
          },
        },
      ],
    });

    expect(day.schemaVersion).toBe(DAY_SCHEMA_VERSION);
    expect(day.tasks.map((task) => task.agentName)).toEqual([
      "fix-account-balance",
      "old-name",
      "fix-account-balance",
    ]);
  });

  it("falls back from legacy Unknown ticket sections to useful brief fields", () => {
    const day = normalizeDayPlan({
      schemaVersion: 5,
      date: "2026-05-22",
      tasks: [
        {
          id: "task-1",
          title: "Legacy task",
          status: "todo",
          kind: "comms",
          estimateMinutes: 15,
          workDepth: "shallow",
          sourceRefs: [],
          ticketBody: ["## Objective", "", "Unknown", "", "## Done When", "", "Unknown"].join("\n"),
          brief: {
            task: "Send the useful update.",
            context: "Use the known thread.",
            doneWhen: "The update is sent.",
          },
        },
      ],
    });

    expect(day.tasks[0].ticketFields.objective).toBe("Send the useful update.");
    expect(day.tasks[0].ticketFields.background).toBe("Use the known thread.");
    expect(day.tasks[0].ticketFields.doneWhen).toBe("The update is sent.");
  });

  it("normalizes lifecycle metadata and source statuses", () => {
    const day = normalizeDayPlan({
      schemaVersion: 2,
      date: "2026-05-22",
      tasks: [],
      lifecycle: {
        morningRunAt: " 2026-05-22T12:00:00.000Z ",
        generatedBy: " working-memory-skill ",
        morningSources: {
          slack: "ok",
          gmail: " failed ",
          jira: 3,
          " ": "ignored",
        },
      },
    });

    expect(day.schemaVersion).toBe(DAY_SCHEMA_VERSION);
    expect(day.lifecycle).toEqual({
      morningRunAt: "2026-05-22T12:00:00.000Z",
      generatedBy: "working-memory-skill",
      morningSources: {
        slack: "ok",
        gmail: "failed",
      },
    });
    expect(isMorningRunComplete(day)).toBe(true);
  });

  it("normalizes explicit tracker records separately from tasks", () => {
    const day = normalizeDayPlan({
      date: "2026-05-28",
      tasks: [
        {
          id: "task-1",
          title: "Review Sam's one-pager",
          trackerIds: [" tracker-1 ", "tracker-1"],
          brief: {
            task: "Review the current one-pager when Sam sends it.",
            doneWhen: "Reply with notes.",
          },
        },
      ],
      trackers: [
        {
          id: " tracker-1 ",
          person: " Sam ",
          work: " one-pager ",
          status: "waiting",
          originalAskDate: "2026-05-24T12:00:00Z",
          sourceRefs: [{ kind: "slack", label: " Slack: DM " }],
          notes: " Waiting on draft. ",
          relatedTaskIds: ["task-1", "task-1"],
          createdAt: "2026-05-28T13:00:00Z",
          updatedAt: "2026-05-28T13:00:00Z",
        },
      ],
    });

    expect(day.trackers).toEqual([
      {
        id: "tracker-1",
        person: "Sam",
        work: "one-pager",
        status: "waiting",
        originalAskDate: "2026-05-24",
        sourceRefs: [{ kind: "slack", label: "Slack: DM" }],
        notes: "Waiting on draft.",
        relatedTaskIds: ["task-1"],
        createdAt: "2026-05-28T13:00:00Z",
        updatedAt: "2026-05-28T13:00:00Z",
        completedAt: undefined,
      },
    ]);
    expect(day.tasks[0].trackerIds).toEqual(["tracker-1"]);
  });

  it("migrates legacy title-derived trackers into day-level trackers", () => {
    const day = normalizeDayPlan({
      schemaVersion: 3,
      date: "2026-05-28",
      tasks: [
        {
          id: "task-1",
          title: "Review Sam's North-Star screenshot + track Sam's one-pager",
          status: "todo",
          kind: "task",
          estimateMinutes: 30,
          sourceRefs: [{ kind: "slack", label: "Slack: DM" }],
          brief: {
            task: "Review screenshot and track Sam's one-pager.",
            context: "Sam is working on the one-pager.",
            doneWhen: "Tracker is visible.",
          },
          rawThoughts: "",
          createdAt: "2026-05-26T00:00:00Z",
          updatedAt: "2026-05-28T00:00:00Z",
        },
      ],
    });

    expect(day.trackers).toHaveLength(1);
    expect(day.trackers[0]).toMatchObject({
      id: "tracker-task-1",
      person: "Sam",
      work: "one-pager",
      status: "active",
      originalAskDate: "2026-05-26",
      relatedTaskIds: ["task-1"],
    });
  });
});

describe("interactive memory archive index and current day helpers", () => {
  it("keeps day paths JSON-only and uses a root index path", () => {
    const paths = dayFilePaths("/tmp/interactive-memory", "2026-05-22");

    expect(paths).toEqual({
      dayDir: path.join("/tmp/interactive-memory", "2026-05-22"),
      dayJson: path.join("/tmp/interactive-memory", "2026-05-22", "day.json"),
      calendarJson: path.join("/tmp/interactive-memory", "2026-05-22", "calendar.json"),
    });
    expect("indexHtml" in paths).toBe(false);
    expect(interactiveMemoryIndexPath("/tmp/interactive-memory")).toBe(
      path.join("/tmp/interactive-memory", "_index.json"),
    );
  });

  it("selects today first, otherwise the latest available prior day", () => {
    expect(
      selectCurrentInteractiveDay({
        today: "2026-05-26",
        availableDays: ["2026-05-24", "2026-05-26", "2026-05-20"],
      }),
    ).toEqual({
      selectedDate: "2026-05-26",
      todayExists: true,
      isFallback: false,
    });

    expect(
      selectCurrentInteractiveDay({
        today: "2026-05-26",
        availableDays: ["2026-05-24", "2026-05-28", "2026-05-20"],
      }),
    ).toEqual({
      selectedDate: "2026-05-24",
      todayExists: false,
      isFallback: true,
    });

    expect(
      selectCurrentInteractiveDay({
        today: "2026-05-26",
        availableDays: ["2026-05-28"],
      }),
    ).toEqual({
      selectedDate: null,
      todayExists: false,
      isFallback: false,
    });
  });

  it("updates the root index on save", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);

    const bundle = await saveDay(
      "2026-05-25",
      normalizeDayPlan({
        date: "2026-05-25",
        tasks: [],
        lifecycle: {
          morningRunAt: "2026-05-25T12:00:00.000Z",
          morningSources: { slack: "ok" },
        },
      }),
    );
    const index = JSON.parse(
      await fs.readFile(interactiveMemoryIndexPath(rootDir), "utf8"),
    ) as InteractiveDayIndex;

    expect(bundle.paths).not.toHaveProperty("indexHtml");
    expect(index.schemaVersion).toBe(INTERACTIVE_MEMORY_INDEX_SCHEMA_VERSION);
    expect(index.days).toHaveLength(1);
    expect(index.days[0]).toMatchObject({
      date: "2026-05-25",
      schemaVersion: DAY_SCHEMA_VERSION,
      taskCount: 0,
      morningRunComplete: true,
      morningRunAt: "2026-05-25T12:00:00.000Z",
    });
    await expect(listInteractiveDays()).resolves.toEqual(["2026-05-25"]);
  });

  it("round-trips v7 ticket fields through save and read", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);

    await saveDay(
      "2026-05-25",
      normalizeDayPlan({
        schemaVersion: DAY_SCHEMA_VERSION,
        date: "2026-05-25",
        tasks: [
          {
            id: "task-1",
            title: "Round-trip readiness",
            status: "todo",
            kind: "focus",
            estimateMinutes: 45,
            workDepth: "deep",
            agentReadiness: "ready",
            readinessWarnings: [],
            sourceRefs: [{ kind: "manual", label: "Manual" }],
            ticketFields: {
              objective: "Keep the work order intact.",
              background: "The task was already qualified.",
              constraintsNonGoals: "Do not drop readiness fields.",
              doneWhen: "Saved task still has a structured ticket body.",
              verification: "Read the day back from disk.",
            },
          },
        ],
        breaks: [
          {
            id: "break-1",
            label: "Break",
            start: "2026-05-25T10:00:00",
            end: "2026-05-25T10:05:00",
            kind: "break",
          },
        ],
      }),
    );

    const bundle = await readOrCreateDay("2026-05-25");

    expect(bundle.day.tasks[0].ticketFields).toMatchObject({
      objective: "Keep the work order intact.",
      background: "The task was already qualified.",
      constraintsNonGoals: "Do not drop readiness fields.",
      doneWhen: "Saved task still has a structured ticket body.",
      verification: "Read the day back from disk.",
    });
    expect("ticketBody" in bundle.day.tasks[0]).toBe(false);
    expect("brief" in bundle.day.tasks[0]).toBe(false);
    expect(bundle.day.tasks[0].agentReadiness).toBe("ready");
    expect(bundle.day.tasks[0].workDepth).toBe("deep");
    expect(bundle.day.breaks[0]).toMatchObject({ id: "break-1", kind: "break" });
  });

  it("persists recomputed readiness for stale schema v6 files", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    const paths = dayFilePaths(rootDir, "2026-05-25");
    await fs.mkdir(paths.dayDir, { recursive: true });
    await fs.writeFile(
      paths.dayJson,
      JSON.stringify(
        {
          schemaVersion: DAY_SCHEMA_VERSION,
          date: "2026-05-25",
          timezone: "America/New_York",
          title: "2026-05-25: Working Memory",
          status: "active",
          settings: {
            startHour: 8,
            endHour: 18,
            slotMinutes: 30,
            completionTargetPercent: 100,
          },
          tasks: [
            {
              id: "task-1",
              title: "Stale ready task",
              status: "todo",
              kind: "focus",
              estimateMinutes: 90,
              workDepth: "deep",
              agentReadiness: "ready",
              readinessWarnings: [],
              sourceRefs: [],
              ticketFields: {
                objective: "Do the stale task.",
                background: "",
                constraintsNonGoals: "",
                doneWhen: "",
                verification: "",
              },
              createdAt: "2026-05-25T00:00:00Z",
              updatedAt: "2026-05-25T00:00:00Z",
            },
          ],
          trackers: [],
          breaks: [],
          dayNotes: "",
          ideas: { text: "" },
          lifecycle: {},
          generatedAt: "2026-05-25T00:00:00Z",
          updatedAt: "2026-05-25T00:00:00Z",
        },
        null,
        2,
      ),
    );

    const bundle = await readOrCreateDay("2026-05-25");
    const persisted = JSON.parse(await fs.readFile(paths.dayJson, "utf8"));

    expect(bundle.day.tasks[0].agentReadiness).toBe("incomplete");
    expect(bundle.day.tasks[0].readinessWarnings).toContain("missing done when");
    expect(persisted.tasks[0].agentReadiness).toBe("incomplete");
    expect(persisted.tasks[0].readinessWarnings).toContain("missing done when");
  });

  it("rejects stale saves using the loaded base updatedAt", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);

    const first = await saveDay(
      "2026-05-25",
      normalizeDayPlan({
        date: "2026-05-25",
        tasks: [],
        dayNotes: "first",
      }),
    );
    const baseUpdatedAt = first.day.updatedAt;

    await saveDay(
      "2026-05-25",
      {
        ...first.day,
        dayNotes: "newer save",
      },
      { baseUpdatedAt },
    );

    await expect(
      saveDay(
        "2026-05-25",
        {
          ...first.day,
          dayNotes: "stale save",
        },
        { baseUpdatedAt },
      ),
    ).rejects.toBeInstanceOf(DaySaveConflictError);
  });

  it("saves prompt settings in the archive root", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);

    await savePromptSettings({
      schemaVersion: PROMPT_SETTINGS_SCHEMA_VERSION,
      promptTemplate: "{{ticketBody}}\n\n{{sources}}",
      updatedAt: "2026-05-25T00:00:00Z",
    });

    await expect(readPromptSettings()).resolves.toMatchObject({
      schemaVersion: PROMPT_SETTINGS_SCHEMA_VERSION,
      promptTemplate: "{{ticketBody}}\n\n{{sources}}",
    });
    await expect(fs.readFile(interactiveMemorySettingsPath(rootDir), "utf8")).resolves.toContain(
      "{{ticketBody}}",
    );
  });

  it("creates a missing interactive day without importing daily markdown", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    const markdownDir = await fs.mkdtemp(path.join(os.tmpdir(), "working-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    vi.stubEnv("WORKING_MEMORY_DIR", markdownDir);
    await fs.writeFile(
      path.join(markdownDir, "2026-05-25.md"),
      "- [ ] This old task must not import\n",
      "utf8",
    );

    const bundle = await readOrCreateDay("2026-05-25");

    expect(bundle.day.tasks).toEqual([]);
    await expect(fs.readFile(bundle.paths.dayJson, "utf8")).resolves.toContain('"tasks": []');
  });

  it("loads the latest prior day for current without creating today's archive", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
    await saveDay(
      "2026-05-24",
      normalizeDayPlan({
        date: "2026-05-24",
        tasks: [],
        lifecycle: {
          morningRunAt: "2026-05-24T12:00:00.000Z",
        },
      }),
    );

    const response = await getCurrentStudioResponse(new Date("2026-05-26T16:00:00.000Z"));

    expect(response.today).toBe("2026-05-26");
    expect(response.selectedDate).toBe("2026-05-24");
    expect(response.todayExists).toBe(false);
    expect(response.morningRunComplete).toBe(false);
    expect(response.isFallback).toBe(true);
    expect(response.availableDays).toEqual(["2026-05-24"]);
    expect(response.bundle?.day.date).toBe("2026-05-24");
    await expect(fs.access(path.join(rootDir, "2026-05-26"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns an empty current response without creating today when no archive exists", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "interactive-memory-"));
    vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);

    const response = await getCurrentStudioResponse(new Date("2026-05-26T16:00:00.000Z"));

    expect(response).toMatchObject({
      today: "2026-05-26",
      selectedDate: null,
      todayExists: false,
      morningRunComplete: false,
      isFallback: false,
      availableDays: [],
      bundle: null,
    });
    await expect(fs.access(path.join(rootDir, "2026-05-26"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(interactiveMemoryIndexPath(rootDir))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
