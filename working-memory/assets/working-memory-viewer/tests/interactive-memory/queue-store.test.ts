import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeQueueItem,
  dismissQueueItem,
  mergeSweep,
  QueueItemNotFoundError,
  QueueItemNotQueuedError,
  QueueSaveConflictError,
  readQueue,
} from "@/lib/interactive-memory/queue-store";
import type {
  QueueCandidate,
  QueueFile,
  QueueItem,
  QueueSweepMeta,
} from "@/lib/interactive-memory/types";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function withTempDir() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "queue-store-"));
  vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
  return rootDir;
}

const EMPTY_SWEEP: QueueSweepMeta = { sources: [] };

function candidate(overrides: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    title: "Fix login timeout",
    summary: "The login page times out after a short wait.",
    harvestedContext: "First context excerpt.",
    sourceRefs: [{ kind: "slack", label: "chan-one" }],
    fingerprints: ["slack:c1:1"],
    ...overrides,
  };
}

async function seedOne(overrides: Partial<QueueCandidate> = {}): Promise<QueueItem> {
  const file = await mergeSweep([candidate(overrides)], EMPTY_SWEEP);
  return file.items[file.items.length - 1];
}

function rawItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "queue-raw",
    status: "queued",
    title: "Raw item",
    summary: "",
    harvestedContext: "",
    sourceRefs: [],
    fingerprints: ["fp:raw"],
    seenCount: 1,
    firstSeenAt: "2099-01-01T00:00:00.000Z",
    lastSeenAt: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function queued(file: QueueFile) {
  return file.items.filter((item) => item.status === "queued");
}

async function writeRawQueue(rootDir: string, file: QueueFile) {
  await fs.writeFile(
    path.join(rootDir, "queue.json"),
    `${JSON.stringify(file, null, 2)}\n`,
    "utf8",
  );
}

describe("queue-store reads", () => {
  it("reads a missing file as a valid empty QueueFile", async () => {
    await withTempDir();
    const file = await readQueue();
    expect(file.schemaVersion).toBe(1);
    expect(file.items).toEqual([]);
    expect(file.sweep.sources).toEqual([]);
    expect(typeof file.updatedAt).toBe("string");
  });
});

describe("mergeSweep precedence", () => {
  it("rule 4: an unmatched candidate creates a new queued item with fresh counters", async () => {
    await withTempDir();
    const item = await seedOne({
      matchedTask: { taskId: "t1", taskDate: "2099-01-02", title: "T" },
    });
    expect(item.status).toBe("queued");
    expect(item.id.startsWith("queue-")).toBe(true);
    expect(item.seenCount).toBe(1);
    expect(item.firstSeenAt).toBe(item.lastSeenAt);
    expect(item.matchedTask?.taskId).toBe("t1");
  });

  it("rule 4: id fields pointing at missing or wrong-status items still create a new item", async () => {
    await withTempDir();
    const existing = await seedOne(); // a QUEUED item
    // mergeIntoItemId at a missing id + reAskOfItemId at a QUEUED (wrong-status) id.
    const file = await mergeSweep(
      [
        candidate({ fingerprints: ["x:1"], mergeIntoItemId: "queue-missing" }),
        candidate({ fingerprints: ["x:2"], reAskOfItemId: existing.id }),
      ],
      EMPTY_SWEEP,
    );
    // The two new candidates plus the pre-existing item => 3 queued items, none merged.
    expect(queued(file)).toHaveLength(3);
    expect(file.items.find((item) => item.id === existing.id)?.seenCount).toBe(1);
    expect(await readQueue()).toEqual(file); // persisted
  });

  it("rule 1: same event re-seen merges into a queued item (union, bump, keep title/summary)", async () => {
    await withTempDir();
    const first = await seedOne({
      title: "First title",
      summary: "First summary",
      harvestedContext: "First context.",
      sourceRefs: [{ kind: "slack", label: "chan-one" }],
      fingerprints: ["slack:c1:1"],
    });

    const file = await mergeSweep(
      [
        candidate({
          title: "Second title",
          summary: "Second summary",
          harvestedContext: "Second context.",
          sourceRefs: [
            { kind: "gmail", label: "mail-one" },
            { kind: "slack", label: "chan-one" }, // duplicate kind+label
          ],
          fingerprints: ["slack:c1:1", "slack:c1:2"],
          matchedTask: { taskId: "t9", taskDate: "2099-03-04", title: "Matched" },
        }),
      ],
      EMPTY_SWEEP,
    );

    expect(queued(file)).toHaveLength(1);
    const merged = file.items[0];
    expect(merged.id).toBe(first.id);
    expect(merged.seenCount).toBe(2);
    expect(merged.title).toBe("First title"); // kept
    expect(merged.summary).toBe("First summary"); // kept
    expect(merged.fingerprints.sort()).toEqual(["slack:c1:1", "slack:c1:2"]);
    expect(merged.sourceRefs).toHaveLength(2); // deduped by kind+label
    expect(merged.harvestedContext).toBe("First context.\n\nSecond context.");
    expect(merged.matchedTask?.taskId).toBe("t9"); // refreshed
    expect(merged.firstSeenAt).toBe(first.firstSeenAt); // earliest kept
  });

  it("rule 1: does not duplicate harvestedContext already contained", async () => {
    await withTempDir();
    await seedOne({ harvestedContext: "Shared excerpt.", fingerprints: ["fp:1"] });
    const file = await mergeSweep(
      [candidate({ harvestedContext: "Shared excerpt.", fingerprints: ["fp:1"] })],
      EMPTY_SWEEP,
    );
    expect(file.items[0].harvestedContext).toBe("Shared excerpt.");
  });

  it("rule 1: a fingerprint hit on a dismissed item drops the candidate silently", async () => {
    await withTempDir();
    const item = await seedOne({ fingerprints: ["fp:d"] });
    const dismissed = await dismissQueueItem(item.id, (await readQueue()).updatedAt);
    expect(dismissed.items[0].status).toBe("dismissed");

    const file = await mergeSweep([candidate({ fingerprints: ["fp:d"] })], EMPTY_SWEEP);
    expect(queued(file)).toHaveLength(0);
    expect(file.items).toHaveLength(1); // no new item created
    expect(file.items[0].status).toBe("dismissed");
  });

  it("rule 1: merges into the most recently seen when several items intersect", async () => {
    const rootDir = await withTempDir();
    await writeRawQueue(rootDir, {
      schemaVersion: 1,
      updatedAt: "2099-01-01T00:00:00.000Z",
      sweep: { sources: [] },
      items: [
        rawItem({
          id: "queue-old",
          fingerprints: ["shared"],
          lastSeenAt: "2000-01-01T00:00:00.000Z",
        }),
        rawItem({
          id: "queue-new",
          fingerprints: ["shared"],
          lastSeenAt: "2099-06-06T00:00:00.000Z",
        }),
      ],
    });

    const file = await mergeSweep([candidate({ fingerprints: ["shared"] })], EMPTY_SWEEP);
    expect(file.items.find((item) => item.id === "queue-new")?.seenCount).toBe(2);
    expect(file.items.find((item) => item.id === "queue-old")?.seenCount).toBe(1);
  });

  it("rule 1 beats the id fields: fingerprint identity wins over mergeIntoItemId", async () => {
    await withTempDir();
    const a = await seedOne({ fingerprints: ["fp:a"], title: "Item A" });
    const b = await seedOne({ fingerprints: ["fp:b"], title: "Item B" });

    const file = await mergeSweep(
      [candidate({ fingerprints: ["fp:a"], mergeIntoItemId: b.id, title: "Incoming" })],
      EMPTY_SWEEP,
    );
    const itemA = file.items.find((item) => item.id === a.id);
    const itemB = file.items.find((item) => item.id === b.id);
    expect(itemA?.seenCount).toBe(2); // fingerprint merge landed on A
    expect(itemB?.seenCount).toBe(1); // mergeIntoItemId target untouched
    expect(queued(file)).toHaveLength(2); // no third item created
  });

  it("rule 1 beats the id fields: a dismissed fingerprint hit drops even when reAskOfItemId is set", async () => {
    await withTempDir();
    const a = await seedOne({ fingerprints: ["fp:a"] });
    await dismissQueueItem(a.id, (await readQueue()).updatedAt);

    const file = await mergeSweep(
      [candidate({ fingerprints: ["fp:a"], reAskOfItemId: a.id })],
      EMPTY_SWEEP,
    );
    expect(file.items).toHaveLength(1);
    expect(file.items[0].status).toBe("dismissed");
    expect(queued(file)).toHaveLength(0); // reAsk did NOT fire; fingerprint drop won
  });

  it("rule 2: a re-ask of a dismissed item creates a new queued item carrying dismissedBefore", async () => {
    await withTempDir();
    const a = await seedOne({ fingerprints: ["fp:a"], title: "Original ask" });
    const afterDismiss = await dismissQueueItem(a.id, (await readQueue()).updatedAt);
    const dismissedAt = afterDismiss.items[0].dismissedAt;

    const file = await mergeSweep(
      [candidate({ fingerprints: ["fp:new"], reAskOfItemId: a.id, title: "Re-ask" })],
      EMPTY_SWEEP,
    );
    const newItem = queued(file)[0];
    expect(queued(file)).toHaveLength(1);
    expect(newItem.id).not.toBe(a.id);
    expect(newItem.dismissedBefore?.at).toBe(dismissedAt);
    expect(newItem.seenCount).toBe(1); // fresh counters
    expect(file.items.find((item) => item.id === a.id)?.status).toBe("dismissed");
  });

  it("rule 3: mergeIntoItemId merges the same ask arriving via a new event", async () => {
    await withTempDir();
    const a = await seedOne({
      fingerprints: ["fp:a"],
      sourceRefs: [{ kind: "jira", label: "J-1" }],
    });

    const file = await mergeSweep(
      [
        candidate({
          fingerprints: ["fp:new-event"],
          mergeIntoItemId: a.id,
          sourceRefs: [{ kind: "slack", label: "chan-two" }],
        }),
      ],
      EMPTY_SWEEP,
    );
    expect(queued(file)).toHaveLength(1);
    const merged = file.items[0];
    expect(merged.id).toBe(a.id);
    expect(merged.seenCount).toBe(2);
    expect(merged.fingerprints.sort()).toEqual(["fp:a", "fp:new-event"]);
    expect(merged.sourceRefs).toHaveLength(2);
  });

  it("applies candidates sequentially so a later one merges into an earlier one's new item", async () => {
    await withTempDir();
    const file = await mergeSweep(
      [
        candidate({ fingerprints: ["fp:seq"], title: "First" }),
        candidate({ fingerprints: ["fp:seq"], title: "Second" }),
      ],
      EMPTY_SWEEP,
    );
    expect(file.items).toHaveLength(1);
    expect(file.items[0].seenCount).toBe(2);
    expect(file.items[0].title).toBe("First");
  });

  it("replaces sweep meta wholesale and stamps updatedAt", async () => {
    await withTempDir();
    const sweep: QueueSweepMeta = {
      lastSweepAt: "2099-05-06T12:00:00.000Z",
      lastSweepKind: "scheduled",
      checkpoint: "2099-05-06T11:00:00.000Z",
      sources: [
        { source: "slack", status: "ok" },
        { source: "gmail", status: "failed", detail: "auth" },
      ],
    };
    const file = await mergeSweep([candidate()], sweep);
    expect(file.sweep).toEqual(sweep);
    expect(file.updatedAt).not.toBe(new Date(0).toISOString());
  });
});

describe("mergeSweep prune", () => {
  it("removes dismissed/consumed items older than 30 days, keeps recent and queued", async () => {
    const rootDir = await withTempDir();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const base: QueueItem = {
      id: "queue-base",
      status: "queued",
      title: "t",
      summary: "",
      harvestedContext: "",
      sourceRefs: [],
      fingerprints: ["fp:base"],
      seenCount: 1,
      firstSeenAt: old,
      lastSeenAt: old,
    };
    await writeRawQueue(rootDir, {
      schemaVersion: 1,
      updatedAt: old,
      sweep: { sources: [] },
      items: [
        {
          ...base,
          id: "queue-old-dismissed",
          status: "dismissed",
          dismissedAt: old,
          fingerprints: ["fp:od"],
        },
        {
          ...base,
          id: "queue-recent-dismissed",
          status: "dismissed",
          dismissedAt: recent,
          fingerprints: ["fp:rd"],
        },
        {
          ...base,
          id: "queue-old-consumed",
          status: "consumed",
          consumedAt: old,
          consumedTaskId: "task-x",
          fingerprints: ["fp:oc"],
        },
        { ...base, id: "queue-queued", status: "queued", fingerprints: ["fp:q"] },
      ],
    });

    const file = await mergeSweep([], EMPTY_SWEEP);
    const ids = file.items.map((item) => item.id).sort();
    expect(ids).toEqual(["queue-queued", "queue-recent-dismissed"]);
  });
});

describe("dismissQueueItem", () => {
  it("dismisses a queued item under a matching baseUpdatedAt", async () => {
    await withTempDir();
    const item = await seedOne();
    const before = await readQueue();
    const file = await dismissQueueItem(item.id, before.updatedAt);
    expect(file.items[0].status).toBe("dismissed");
    expect(typeof file.items[0].dismissedAt).toBe("string");
    // The dismissed file is what a subsequent read returns.
    expect(await readQueue()).toEqual(file);
  });

  it("throws QueueSaveConflictError on a stale baseUpdatedAt", async () => {
    await withTempDir();
    const item = await seedOne();
    await expect(dismissQueueItem(item.id, "1999-01-01T00:00:00.000Z")).rejects.toBeInstanceOf(
      QueueSaveConflictError,
    );
  });

  it("throws QueueItemNotFoundError for an unknown id", async () => {
    await withTempDir();
    await seedOne();
    const current = await readQueue();
    await expect(dismissQueueItem("queue-nope", current.updatedAt)).rejects.toBeInstanceOf(
      QueueItemNotFoundError,
    );
  });

  it("throws QueueItemNotQueuedError for an already-dismissed item", async () => {
    await withTempDir();
    const item = await seedOne();
    const dismissed = await dismissQueueItem(item.id, (await readQueue()).updatedAt);
    await expect(dismissQueueItem(item.id, dismissed.updatedAt)).rejects.toBeInstanceOf(
      QueueItemNotQueuedError,
    );
  });
});

describe("consumeQueueItem idempotency", () => {
  it("consumes a queued item and records the task id", async () => {
    await withTempDir();
    const item = await seedOne();
    const file = await consumeQueueItem(item.id, "task-42");
    expect(file.items[0].status).toBe("consumed");
    expect(file.items[0].consumedTaskId).toBe("task-42");
    expect(typeof file.items[0].consumedAt).toBe("string");
  });

  it("is a no-op for a missing id", async () => {
    await withTempDir();
    const item = await seedOne();
    const file = await consumeQueueItem("queue-missing", "task-1");
    expect(file.items).toHaveLength(1);
    expect(file.items[0].id).toBe(item.id);
    expect(file.items[0].status).toBe("queued");
  });

  it("is a no-op on double-consume and keeps the first task id", async () => {
    await withTempDir();
    const item = await seedOne();
    await consumeQueueItem(item.id, "task-first");
    const file = await consumeQueueItem(item.id, "task-second");
    expect(file.items[0].status).toBe("consumed");
    expect(file.items[0].consumedTaskId).toBe("task-first");
  });

  it("is a no-op when the item was dismissed while grilling", async () => {
    await withTempDir();
    const item = await seedOne();
    await dismissQueueItem(item.id, (await readQueue()).updatedAt);
    const file = await consumeQueueItem(item.id, "task-race");
    expect(file.items[0].status).toBe("dismissed");
    expect(file.items[0].consumedTaskId).toBeUndefined();
  });
});
