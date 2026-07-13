import { NextResponse } from "next/server";
import { isSourceKind, mergeSweep } from "@/lib/interactive-memory/queue-store";
import { assertLocalOrigin, ForbiddenOriginError } from "@/lib/interactive-memory/route-guards";
import type {
  QueueCandidate,
  QueueSourceHealth,
  QueueSweepMeta,
} from "@/lib/interactive-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SWEEP_KINDS = new Set(["scheduled", "manual", "morning"]);
const SOURCE_STATUSES = new Set(["ok", "failed", "skipped"]);

type ValidationResult =
  | { ok: true; candidates: QueueCandidate[]; sweep: QueueSweepMeta }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSourceRefs(value: unknown, where: string): string | undefined {
  if (!Array.isArray(value)) return `${where}.sourceRefs must be an array.`;
  for (const source of value) {
    if (!isPlainObject(source)) return `${where}.sourceRefs entries must be objects.`;
    if (!isSourceKind(source.kind)) return `${where}.sourceRefs has an unknown source kind.`;
    if (!isNonEmptyString(source.label)) return `${where}.sourceRefs entries need a label.`;
    if (source.url !== undefined && typeof source.url !== "string") {
      return `${where}.sourceRefs url must be a string.`;
    }
  }
  return undefined;
}

function validateMatchedTask(value: unknown, where: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) return `${where}.matchedTask must be an object.`;
  if (
    !isNonEmptyString(value.taskId) ||
    !isNonEmptyString(value.taskDate) ||
    !isNonEmptyString(value.title)
  ) {
    return `${where}.matchedTask needs taskId, taskDate, and title.`;
  }
  return undefined;
}

function validateCandidate(value: unknown, index: number): string | undefined {
  const where = `candidates[${index}]`;
  if (!isPlainObject(value)) return `${where} must be an object.`;
  if (!isNonEmptyString(value.title)) return `${where}.title must be a non-empty string.`;
  if (typeof value.summary !== "string") return `${where}.summary must be a string.`;
  if (typeof value.harvestedContext !== "string") {
    return `${where}.harvestedContext must be a string.`;
  }
  const sourceRefsError = validateSourceRefs(value.sourceRefs, where);
  if (sourceRefsError) return sourceRefsError;
  if (!Array.isArray(value.fingerprints) || value.fingerprints.length === 0) {
    return `${where}.fingerprints must be a non-empty array.`;
  }
  if (!value.fingerprints.every((fingerprint) => isNonEmptyString(fingerprint))) {
    return `${where}.fingerprints must contain non-empty strings.`;
  }
  const matchedTaskError = validateMatchedTask(value.matchedTask, where);
  if (matchedTaskError) return matchedTaskError;
  if (value.mergeIntoItemId !== undefined && typeof value.mergeIntoItemId !== "string") {
    return `${where}.mergeIntoItemId must be a string.`;
  }
  if (value.reAskOfItemId !== undefined && typeof value.reAskOfItemId !== "string") {
    return `${where}.reAskOfItemId must be a string.`;
  }
  return undefined;
}

function validateSweepMeta(value: unknown): string | undefined {
  if (!isPlainObject(value)) return "sweep must be an object.";
  if (!Array.isArray(value.sources)) return "sweep.sources must be an array.";
  for (const source of value.sources) {
    if (!isPlainObject(source)) return "sweep.sources entries must be objects.";
    if (!isSourceKind(source.source)) return "sweep.sources has an unknown source kind.";
    if (typeof source.status !== "string" || !SOURCE_STATUSES.has(source.status)) {
      return "sweep.sources status must be ok, failed, or skipped.";
    }
    if (source.detail !== undefined && typeof source.detail !== "string") {
      return "sweep.sources detail must be a string.";
    }
  }
  if (value.lastSweepAt !== undefined && typeof value.lastSweepAt !== "string") {
    return "sweep.lastSweepAt must be a string.";
  }
  if (
    value.lastSweepKind !== undefined &&
    (typeof value.lastSweepKind !== "string" || !SWEEP_KINDS.has(value.lastSweepKind))
  ) {
    return "sweep.lastSweepKind must be scheduled, manual, or morning.";
  }
  if (value.checkpoint !== undefined && typeof value.checkpoint !== "string") {
    return "sweep.checkpoint must be a string.";
  }
  return undefined;
}

function validateSweepBody(body: unknown): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, error: "Body must be an object." };
  if (!Array.isArray(body.candidates)) {
    return { ok: false, error: "candidates must be an array." };
  }
  for (let index = 0; index < body.candidates.length; index += 1) {
    const error = validateCandidate(body.candidates[index], index);
    if (error) return { ok: false, error };
  }
  const sweepError = validateSweepMeta(body.sweep);
  if (sweepError) return { ok: false, error: sweepError };

  const sources = (body.sweep as { sources: unknown[] }).sources as QueueSourceHealth[];
  const sweep = body.sweep as Record<string, unknown>;
  return {
    ok: true,
    candidates: body.candidates as QueueCandidate[],
    sweep: {
      lastSweepAt: typeof sweep.lastSweepAt === "string" ? sweep.lastSweepAt : undefined,
      lastSweepKind: sweep.lastSweepKind as QueueSweepMeta["lastSweepKind"],
      checkpoint: typeof sweep.checkpoint === "string" ? sweep.checkpoint : undefined,
      sources,
    },
  };
}

export async function POST(request: Request) {
  try {
    assertLocalOrigin(request);
    const body = await request.json().catch(() => undefined);
    const validated = validateSweepBody(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const queue = await mergeSweep(validated.candidates, validated.sweep);
    return NextResponse.json(queue);
  } catch (error) {
    if (error instanceof ForbiddenOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to merge the sweep." },
      { status: 500 },
    );
  }
}
