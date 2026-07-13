import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getInteractiveMemoryDir } from "./paths";
import {
  QUEUE_SCHEMA_VERSION,
  type QueueCandidate,
  type QueueFile,
  type QueueItem,
  type QueueItemStatus,
  type QueueMatchedTask,
  type QueueSourceHealth,
  type QueueSweepMeta,
  type SourceKind,
  type SourceRef,
} from "./types";

export const QUEUE_FILE_NAME = "queue.json";

// The five sweep sources are described in the spec, but a SourceRef/QueueSourceHealth.source is
// typed as SourceKind (which also allows "doc" and "manual"), so validation accepts any SourceKind.
export const SOURCE_KINDS: SourceKind[] = [
  "jira",
  "slack",
  "gmail",
  "calendar",
  "meeting",
  "doc",
  "manual",
];

const QUEUE_SOURCE_STATUSES: QueueSourceHealth["status"][] = ["ok", "failed", "skipped"];

// Dismissed/consumed items older than this fall out of the file on the next sweep. Accepted
// trade-off (spec 4): dismissal memory is bounded to 30 days.
const PRUNE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// A non-existent queue.json reads as this empty file. The epoch updatedAt is deterministic and is
// never persisted: the first real mutation stamps a live updatedAt before writing.
const EMPTY_QUEUE_UPDATED_AT = new Date(0).toISOString();

// Mirrors DaySaveConflictError: the UI dismiss carries the QueueFile.updatedAt it saw; a newer file
// on disk means the client's view is stale and it must refetch.
export class QueueSaveConflictError extends Error {
  constructor() {
    super("A newer version of the monitoring queue already exists on disk.");
    this.name = "QueueSaveConflictError";
  }
}

export class QueueItemNotFoundError extends Error {
  constructor() {
    super("Queue item not found.");
    this.name = "QueueItemNotFoundError";
  }
}

export class QueueItemNotQueuedError extends Error {
  constructor() {
    super("Queue item is not in the queued state.");
    this.name = "QueueItemNotQueuedError";
  }
}

function queueFilePath() {
  return path.join(path.resolve(getInteractiveMemoryDir()), QUEUE_FILE_NAME);
}

// Serialize ALL queue.json mutations through one module-level promise chain (spec 4) so concurrent
// route handlers (sweep POST vs dismiss vs consume) never interleave their read-modify-write. The
// chain swallows rejections so one failed mutation does not wedge the queue.
let queueWriteChain: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(task: () => Promise<T>): Promise<T> {
  const result = queueWriteChain.then(task);
  queueWriteChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// Reads are lock-free: writes are atomic (tmp + rename), so a concurrent read sees either the whole
// old file or the whole new one, never a partial write.
export async function readQueue(): Promise<QueueFile> {
  return readQueueFromDisk();
}

async function readQueueFromDisk(): Promise<QueueFile> {
  try {
    const raw = JSON.parse(await fs.readFile(queueFilePath(), "utf8")) as unknown;
    return normalizeQueueFile(raw);
  } catch (error) {
    if (isNotFoundError(error)) return buildEmptyQueue();
    throw error;
  }
}

function buildEmptyQueue(): QueueFile {
  return {
    schemaVersion: QUEUE_SCHEMA_VERSION,
    updatedAt: EMPTY_QUEUE_UPDATED_AT,
    sweep: { sources: [] },
    items: [],
  };
}

// Defensive normalization: the store is the single writer, but this guards a hand-edited or
// partially migrated file so the merge logic always runs against a well-formed shape.
function normalizeQueueFile(raw: unknown): QueueFile {
  if (!raw || typeof raw !== "object") return buildEmptyQueue();
  const record = raw as Partial<QueueFile>;
  return {
    schemaVersion:
      typeof record.schemaVersion === "number" ? record.schemaVersion : QUEUE_SCHEMA_VERSION,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt
        ? record.updatedAt
        : EMPTY_QUEUE_UPDATED_AT,
    sweep: normalizeSweepMeta(record.sweep),
    items: Array.isArray(record.items)
      ? record.items
          .map((item) => normalizeItem(item))
          .filter((item): item is QueueItem => Boolean(item))
      : [],
  };
}

function normalizeSweepMeta(sweep: unknown): QueueSweepMeta {
  const record = (sweep && typeof sweep === "object" ? sweep : {}) as Partial<QueueSweepMeta>;
  return {
    lastSweepAt: optionalString(record.lastSweepAt),
    lastSweepKind:
      record.lastSweepKind === "scheduled" ||
      record.lastSweepKind === "manual" ||
      record.lastSweepKind === "morning"
        ? record.lastSweepKind
        : undefined,
    checkpoint: optionalString(record.checkpoint),
    sources: Array.isArray(record.sources)
      ? record.sources
          .map((source) => normalizeSourceHealth(source))
          .filter((source): source is QueueSourceHealth => Boolean(source))
      : [],
  };
}

function normalizeSourceHealth(source: unknown): QueueSourceHealth | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Partial<QueueSourceHealth>;
  if (!isSourceKind(record.source)) return undefined;
  if (!record.status || !QUEUE_SOURCE_STATUSES.includes(record.status)) return undefined;
  return {
    source: record.source,
    status: record.status,
    detail: optionalString(record.detail),
  };
}

function normalizeItem(raw: unknown): QueueItem | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Partial<QueueItem>;
  const id = optionalString(record.id);
  if (!id) return undefined;
  const status = isItemStatus(record.status) ? record.status : "queued";
  return {
    id,
    status,
    title: typeof record.title === "string" ? record.title : "",
    summary: typeof record.summary === "string" ? record.summary : "",
    harvestedContext: typeof record.harvestedContext === "string" ? record.harvestedContext : "",
    sourceRefs: normalizeSourceRefs(record.sourceRefs),
    fingerprints: normalizeFingerprints(record.fingerprints),
    matchedTask: normalizeMatchedTask(record.matchedTask),
    dismissedBefore:
      record.dismissedBefore && typeof record.dismissedBefore.at === "string"
        ? { at: record.dismissedBefore.at }
        : undefined,
    seenCount:
      typeof record.seenCount === "number" && Number.isFinite(record.seenCount)
        ? record.seenCount
        : 1,
    firstSeenAt: optionalString(record.firstSeenAt) || EMPTY_QUEUE_UPDATED_AT,
    lastSeenAt:
      optionalString(record.lastSeenAt) ||
      optionalString(record.firstSeenAt) ||
      EMPTY_QUEUE_UPDATED_AT,
    dismissedAt: optionalString(record.dismissedAt),
    consumedAt: optionalString(record.consumedAt),
    consumedTaskId: optionalString(record.consumedTaskId),
  };
}

function normalizeMatchedTask(matchedTask: unknown): QueueMatchedTask | undefined {
  if (!matchedTask || typeof matchedTask !== "object") return undefined;
  const record = matchedTask as Partial<QueueMatchedTask>;
  const taskId = optionalString(record.taskId);
  const taskDate = optionalString(record.taskDate);
  const title = optionalString(record.title);
  if (!taskId || !taskDate || !title) return undefined;
  return { taskId, taskDate, title };
}

function normalizeSourceRefs(sourceRefs: unknown): SourceRef[] {
  if (!Array.isArray(sourceRefs)) return [];
  return sourceRefs
    .map((source): SourceRef | undefined => {
      if (!source || typeof source !== "object") return undefined;
      const record = source as Partial<SourceRef>;
      const label = optionalString(record.label);
      if (!isSourceKind(record.kind) || !label) return undefined;
      return { kind: record.kind, label, url: optionalString(record.url) };
    })
    .filter((source): source is SourceRef => Boolean(source));
}

function normalizeFingerprints(fingerprints: unknown): string[] {
  if (!Array.isArray(fingerprints)) return [];
  const seen = new Set<string>();
  for (const fingerprint of fingerprints) {
    if (typeof fingerprint === "string" && fingerprint.trim()) seen.add(fingerprint.trim());
  }
  return Array.from(seen);
}

// Merge a sweep's candidates into the queue (spec 4). Sequential per candidate, so a later
// candidate in the same sweep sees items created/merged by earlier ones.
export async function mergeSweep(
  candidates: QueueCandidate[],
  sweep: QueueSweepMeta,
): Promise<QueueFile> {
  return withQueueLock(async () => {
    const queue = await readQueueFromDisk();
    const now = new Date().toISOString();
    for (const candidate of candidates) {
      applyCandidate(queue.items, candidate, now);
    }
    const next: QueueFile = {
      schemaVersion: QUEUE_SCHEMA_VERSION,
      updatedAt: now,
      sweep: normalizeSweepMeta(sweep),
      items: pruneItems(queue.items, now),
    };
    await writeQueueFile(next);
    return next;
  });
}

// One candidate, first matching rule wins (spec 4 precedence).
function applyCandidate(items: QueueItem[], candidate: QueueCandidate, now: string) {
  const fingerprints = normalizeFingerprints(candidate.fingerprints);

  // Rule 1: fingerprint intersection with ANY existing item (same event re-seen). Fingerprint
  // identity always wins, even when the id fields are also set.
  const intersecting = mostRecentlySeen(
    items.filter((item) => item.fingerprints.some((fp) => fingerprints.includes(fp))),
  );
  if (intersecting) {
    if (intersecting.status === "queued") {
      mergeIntoItem(intersecting, candidate, fingerprints, now);
    }
    // dismissed/consumed: drop the candidate silently.
    return;
  }

  // Rule 2: reAskOfItemId points at a DISMISSED item -> a NEW queued item that remembers it.
  if (candidate.reAskOfItemId) {
    const target = items.find((item) => item.id === candidate.reAskOfItemId);
    if (target && target.status === "dismissed") {
      items.push(
        buildItem(candidate, fingerprints, now, {
          dismissedBefore: { at: target.dismissedAt || now },
        }),
      );
      return;
    }
  }

  // Rule 3: mergeIntoItemId points at a QUEUED item -> topic-level merge (same ask, new event).
  if (candidate.mergeIntoItemId) {
    const target = items.find((item) => item.id === candidate.mergeIntoItemId);
    if (target && target.status === "queued") {
      mergeIntoItem(target, candidate, fingerprints, now);
      return;
    }
  }

  // Rule 4: otherwise (including id fields pointing at missing or wrong-status items) -> new item.
  items.push(buildItem(candidate, fingerprints, now));
}

function mostRecentlySeen(items: QueueItem[]): QueueItem | undefined {
  if (items.length === 0) return undefined;
  return items.reduce((best, item) =>
    parseTime(item.lastSeenAt) > parseTime(best.lastSeenAt) ? item : best,
  );
}

function mergeIntoItem(
  item: QueueItem,
  candidate: QueueCandidate,
  fingerprints: string[],
  now: string,
) {
  item.fingerprints = unionFingerprints(item.fingerprints, fingerprints);
  item.sourceRefs = unionSourceRefs(item.sourceRefs, normalizeSourceRefs(candidate.sourceRefs));
  item.seenCount += 1;
  item.lastSeenAt = now;
  if (candidate.matchedTask) {
    const matched = normalizeMatchedTask(candidate.matchedTask);
    if (matched) item.matchedTask = matched;
  }
  item.harvestedContext = appendContext(item.harvestedContext, candidate.harvestedContext);
  // firstSeenAt, title, summary are kept as-is (earliest firstSeenAt, existing title/summary).
}

function buildItem(
  candidate: QueueCandidate,
  fingerprints: string[],
  now: string,
  extra: { dismissedBefore?: { at: string } } = {},
): QueueItem {
  return {
    id: `queue-${randomUUID()}`,
    status: "queued",
    title: typeof candidate.title === "string" ? candidate.title : "",
    summary: typeof candidate.summary === "string" ? candidate.summary : "",
    harvestedContext:
      typeof candidate.harvestedContext === "string" ? candidate.harvestedContext : "",
    sourceRefs: normalizeSourceRefs(candidate.sourceRefs),
    fingerprints,
    matchedTask: normalizeMatchedTask(candidate.matchedTask),
    ...(extra.dismissedBefore ? { dismissedBefore: extra.dismissedBefore } : {}),
    seenCount: 1,
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function unionFingerprints(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

// Dedupe by kind + label (spec 4). Keep existing entries first, then any new ones.
function unionSourceRefs(existing: SourceRef[], incoming: SourceRef[]): SourceRef[] {
  const seen = new Set(existing.map((source) => `${source.kind} ${source.label}`));
  const merged = [...existing];
  for (const source of incoming) {
    const key = `${source.kind} ${source.label}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(source);
    }
  }
  return merged;
}

// Append incoming context separated by a blank line, unless it is empty or already contained.
function appendContext(existing: string, incoming: string): string {
  const addition = typeof incoming === "string" ? incoming.trim() : "";
  if (!addition) return existing;
  if (existing.includes(addition)) return existing;
  if (!existing.trim()) return addition;
  return `${existing}\n\n${addition}`;
}

function pruneItems(items: QueueItem[], now: string): QueueItem[] {
  const cutoff = parseTime(now) - PRUNE_MAX_AGE_MS;
  return items.filter((item) => {
    if (item.status === "queued") return true;
    const terminal = item.status === "dismissed" ? item.dismissedAt : item.consumedAt;
    const terminalTime = terminal ? parseTime(terminal) : Number.NaN;
    // Keep anything without a parseable terminal timestamp; only prune confirmed-old items.
    if (!Number.isFinite(terminalTime)) return true;
    return terminalTime >= cutoff;
  });
}

// UI mutation: sets an item to dismissed under an optimistic whole-file check (spec 4/5).
export async function dismissQueueItem(id: string, baseUpdatedAt: string): Promise<QueueFile> {
  return withQueueLock(async () => {
    const queue = await readQueueFromDisk();
    if (queue.updatedAt !== baseUpdatedAt) throw new QueueSaveConflictError();
    const item = queue.items.find((candidate) => candidate.id === id);
    if (!item) throw new QueueItemNotFoundError();
    if (item.status !== "queued") throw new QueueItemNotQueuedError();
    item.status = "dismissed";
    item.dismissedAt = new Date().toISOString();
    const next: QueueFile = { ...queue, updatedAt: new Date().toISOString() };
    await writeQueueFile(next);
    return next;
  });
}

// Server-internal, called from grill apply. Idempotent: a missing or non-queued item is a no-op
// (covers double-apply and dismiss-while-grilling races). No baseUpdatedAt: it must never fail the
// apply on staleness, so it re-reads then writes inside the lock.
export async function consumeQueueItem(id: string, taskId: string): Promise<QueueFile> {
  return withQueueLock(async () => {
    const queue = await readQueueFromDisk();
    const item = queue.items.find((candidate) => candidate.id === id);
    if (!item || item.status !== "queued") return queue;
    item.status = "consumed";
    item.consumedAt = new Date().toISOString();
    item.consumedTaskId = taskId;
    const next: QueueFile = { ...queue, updatedAt: new Date().toISOString() };
    await writeQueueFile(next);
    return next;
  });
}

function isItemStatus(value: unknown): value is QueueItemStatus {
  return value === "queued" || value === "dismissed" || value === "consumed";
}

export function isSourceKind(value: unknown): value is SourceKind {
  return typeof value === "string" && SOURCE_KINDS.includes(value as SourceKind);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// Atomic write (spec 4): tmp file + rename, mirroring fs.ts. A .bak copy is kept for recovery.
async function writeQueueFile(data: QueueFile) {
  const filePath = queueFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const backupPath = `${filePath}.bak`;
  const content = `${JSON.stringify(data, null, 2)}\n`;

  await fs.writeFile(tempPath, content, "utf8");
  JSON.parse(await fs.readFile(tempPath, "utf8"));
  try {
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  await fs.rename(tempPath, filePath);
}
