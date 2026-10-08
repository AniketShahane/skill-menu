import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addCandidate, createStore, updateItem } from "../scripts/aq.mjs";

// Never touch the real claude config (folder trust) from tests.
process.env.ASK_QUEUE_CLAUDE_JSON = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aq-claude-")), ".claude.json");

process.env.ASK_QUEUE_POLL_MS = "50";

export const USER = "U1";
export const SELF_DM = "D1";

// A fresh data directory with Slack configured. Set TMPDIR to keep these out of /tmp.
export function makeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "aq-test-"));
  const store = createStore(home);
  store.init();
  const config = store.config();
  config.slack = { userId: USER, selfDmId: SELF_DM };
  fs.writeFileSync(store.paths.config, JSON.stringify(config));
  return { home, store };
}

let n = 0;
export function addItem(store, extra = {}) {
  n += 1;
  const { id } = addCandidate(store, {
    title: `Ask ${n}`,
    source: { kind: "slack", who: "Sam", channelId: "C9", ts: `100.${n}` },
    fingerprints: [`slack:C9:100.${n}:${Math.random()}`],
    ...extra,
  });
  return id;
}

// Moves an item to a status through legal steps, as a session would.
export function setStatus(store, id, status, patch = {}) {
  return updateItem(store, id, { status, patch, internal: true });
}

export function withCard(store, id, ts = "500.000100") {
  return updateItem(store, id, { patch: { card: { channelId: SELF_DM, ts, lastSeenTs: ts } } });
}

// A stand-in for the claude CLI's background mode, wrapping a fake session program: `--bg` starts the
// program detached (with the same args and env) and prints its id, `agents --json --all` lists runs,
// `stop` ends one. Resuming a known session keeps its id, like the real thing.
export function fakeBgClaude(home, sessionBin) {
  const dir = path.join(home, "fake-bg");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(home, "fake-bg-claude.mjs");
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const dir = ${JSON.stringify(dir)};
const read = () => fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
const save = (entry) => fs.writeFileSync(path.join(dir, entry.id + ".json"), JSON.stringify(entry));
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "agents") {
  process.stdout.write(JSON.stringify(read()));
} else if (cmd === "stop") {
  const entry = read().find((e) => e.id === rest[0]);
  if (entry?.pid) try { process.kill(-entry.pid, "SIGKILL"); } catch {}
  if (entry) save({ ...entry, pid: null, state: "done" });
} else if (cmd === "--run") {
  // internal: run the session program, then mark the entry done
  const [id, ...args] = rest;
  save({ ...read().find((e) => e.id === id), pid: process.pid });
  const result = spawnSync(${JSON.stringify(sessionBin)}, args, { stdio: "ignore" });
  const entry = read().find((e) => e.id === id);
  save({ ...entry, state: "done", exitCode: result.status }); // stays "idle" (pid kept) until stopped
} else {
  const args = process.argv.slice(2);
  const resumed = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
  const known = resumed && read().find((e) => e.sessionId === resumed);
  const sessionId = resumed || randomUUID();
  const id = known && !args.includes("--model") ? known.id : sessionId.slice(0, 8) + (known ? "c" : "");
  const name = args.includes("--name") ? args[args.indexOf("--name") + 1] : known?.name;
  const copy = known && id !== known.id ? randomUUID() : sessionId;
  save({ id, sessionId: copy, name, state: "working", pid: null, cwd: process.cwd() });
  const child = spawn(process.execPath, [process.argv[1], "--run", id, ...args], { detached: true, stdio: "ignore" });
  child.unref();
  console.log("backgrounded · " + id + " · " + name);
}
`,
  );
  fs.chmodSync(file, 0o755);
  return file;
}
