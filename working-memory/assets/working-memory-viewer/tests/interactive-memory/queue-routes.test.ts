import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as dismissRoute } from "@/app/api/studio/queue/[itemId]/dismiss/route";
import { GET as getQueue } from "@/app/api/studio/queue/route";
import { POST as sweepRoute } from "@/app/api/studio/queue/sweep/route";
import type { QueueCandidate, QueueFile } from "@/lib/interactive-memory/types";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function configureEnv() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "queue-routes-"));
  vi.stubEnv("INTERACTIVE_MEMORY_DIR", rootDir);
  return rootDir;
}

function candidate(overrides: Partial<QueueCandidate> = {}): QueueCandidate {
  return {
    title: "Fix login timeout",
    summary: "Login times out after a short wait.",
    harvestedContext: "excerpt",
    sourceRefs: [{ kind: "slack", label: "chan-one" }],
    fingerprints: ["slack:c1:1"],
    ...overrides,
  };
}

function get() {
  return getQueue();
}

function sweep(body: unknown, headers: Record<string, string> = {}) {
  return sweepRoute(
    new Request("http://localhost/api/studio/queue/sweep", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

function dismiss(itemId: string, body: unknown, headers: Record<string, string> = {}) {
  return dismissRoute(
    new Request(`http://localhost/api/studio/queue/${itemId}/dismiss`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ itemId }) },
  );
}

async function seedOneAndRead(overrides: Partial<QueueCandidate> = {}) {
  await sweep({ candidates: [candidate(overrides)], sweep: { sources: [] } });
  return (await (await get()).json()) as QueueFile;
}

describe("GET /api/studio/queue", () => {
  it("returns an empty QueueFile when no file exists", async () => {
    await configureEnv();
    const res = await get();
    expect(res.status).toBe(200);
    const file = (await res.json()) as QueueFile;
    expect(file.items).toEqual([]);
    expect(file.sweep.sources).toEqual([]);
  });

  it("returns the merged items after a sweep", async () => {
    await configureEnv();
    const file = await seedOneAndRead();
    expect(file.items).toHaveLength(1);
    expect(file.items[0].title).toBe("Fix login timeout");
    expect(file.items[0].status).toBe("queued");
  });
});

describe("POST /api/studio/queue/sweep validation", () => {
  it("403s a cross-origin request", async () => {
    await configureEnv();
    const res = await sweep(
      { candidates: [], sweep: { sources: [] } },
      { origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("400s when candidates is not an array", async () => {
    await configureEnv();
    expect((await sweep({ candidates: {}, sweep: { sources: [] } })).status).toBe(400);
  });

  it("400s a candidate with no fingerprints", async () => {
    await configureEnv();
    const res = await sweep({
      candidates: [candidate({ fingerprints: [] })],
      sweep: { sources: [] },
    });
    expect(res.status).toBe(400);
  });

  it("400s a candidate with an unknown source kind", async () => {
    await configureEnv();
    const res = await sweep({
      candidates: [candidate({ sourceRefs: [{ kind: "telegram", label: "x" }] as never })],
      sweep: { sources: [] },
    });
    expect(res.status).toBe(400);
  });

  it("400s an unknown source kind in sweep health", async () => {
    await configureEnv();
    const res = await sweep({
      candidates: [],
      sweep: { sources: [{ source: "telegram", status: "ok" }] },
    });
    expect(res.status).toBe(400);
  });

  it("400s when sweep.sources is not an array", async () => {
    await configureEnv();
    expect((await sweep({ candidates: [], sweep: {} })).status).toBe(400);
  });

  it("merges a valid body and returns the updated QueueFile", async () => {
    await configureEnv();
    const res = await sweep({
      candidates: [candidate()],
      sweep: {
        lastSweepAt: "2099-05-06T12:00:00.000Z",
        lastSweepKind: "scheduled",
        sources: [{ source: "slack", status: "ok" }],
      },
    });
    expect(res.status).toBe(200);
    const file = (await res.json()) as QueueFile;
    expect(file.items).toHaveLength(1);
    expect(file.sweep.lastSweepKind).toBe("scheduled");
    expect(file.sweep.sources[0]).toEqual({ source: "slack", status: "ok" });
  });
});

describe("POST /api/studio/queue/[itemId]/dismiss", () => {
  it("dismisses a queued item and returns the updated QueueFile", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    const res = await dismiss(seeded.items[0].id, { baseUpdatedAt: seeded.updatedAt });
    expect(res.status).toBe(200);
    const file = (await res.json()) as QueueFile;
    expect(file.items[0].status).toBe("dismissed");
    expect(typeof file.items[0].dismissedAt).toBe("string");
  });

  it("403s a cross-origin request", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    const res = await dismiss(
      seeded.items[0].id,
      { baseUpdatedAt: seeded.updatedAt },
      { origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
  });

  it("400s when baseUpdatedAt is missing", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    expect((await dismiss(seeded.items[0].id, {})).status).toBe(400);
  });

  it("404s an unknown item id", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    const res = await dismiss("queue-missing", { baseUpdatedAt: seeded.updatedAt });
    expect(res.status).toBe(404);
  });

  it("400s an item that is not queued", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    const dismissed = (await (
      await dismiss(seeded.items[0].id, { baseUpdatedAt: seeded.updatedAt })
    ).json()) as QueueFile;
    const res = await dismiss(seeded.items[0].id, { baseUpdatedAt: dismissed.updatedAt });
    expect(res.status).toBe(400);
  });

  it("409s a stale baseUpdatedAt", async () => {
    await configureEnv();
    const seeded = await seedOneAndRead();
    const res = await dismiss(seeded.items[0].id, {
      baseUpdatedAt: "1999-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("queue-conflict");
  });
});
