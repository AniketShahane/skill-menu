#!/usr/bin/env node
// ask-queue state CLI. The only writer of items/, ledger.jsonl, state.json and config.json.
// Output: JSON on stdout. Errors: JSON {"error": "..."} on stderr and exit code 1.
// Pass long or free-form text through --file (a JSON file under tmp/), never as shell arguments.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every card lives in one Claude session (dispatch.mjs): `ready` = a run of that session is queued,
// `working` = it is running. Between runs the item rests in asking/approving/drafted (reply cards)
// or scoping/review (work cards). Work goes scoping → ready → working → review → done.
export const WORK_STATUSES = ["scoping", "ready", "working", "review"];
export const OPEN_STATUSES = ["new", "asking", "approving", "drafted", ...WORK_STATUSES];
export const TRANSITIONS = {
  // ready: dispatch.mjs queues the card session that preps the ask and posts its card.
  new: ["asking", "approving", "scoping", "ready", "filtered", "skipped"],
  asking: ["asking", "approving", "scoping", "ready", "filtered", "skipped"],
  approving: ["asking", "approving", "drafted", "scoping", "ready", "filtered", "skipped"],
  drafted: ["approving", "drafted", "done", "ready", "filtered", "skipped"],
  filtered: ["new", "asking", "approving", "scoping", "skipped"],
  scoping: ["scoping", "ready", "asking", "approving", "filtered", "skipped"],
  // ready = a reply or "go" is waiting for its card session; dispatch.mjs starts it.
  ready: ["working", "scoping", "skipped"],
  // A run ends by setting the card's resting status (or ready: "go" queues the work run).
  // new = the prep run could not post the card and will be retried.
  working: ["new", "asking", "approving", "drafted", "scoping", "ready", "review", "done", "filtered", "skipped"],
  // review: the worker posted a result or a question. A reply sends it back to ready (resume).
  review: ["ready", "scoping", "done", "skipped"],
  // A reply on a closed card reopens it (follow-up input must never be lost).
  done: ["asking", "approving", "scoping", "ready"],
  skipped: ["asking", "approving", "scoping", "ready"],
};
// Session kinds: a card session drafts replies and scopes work; after "go" it does the work itself
// (kind work), with the work model and time limit.
export const JOB_KINDS = ["card", "work"];
export const CARD_BRIEF = "Card session: prep this ask, post its card, then handle every reply in its thread (references/card-session.md).";
// "stop" in a card thread while its session runs stops the run (the gate can't read meaning).
// A model name in a card reply switches that card's sessions to it (it sticks until changed).
export function modelIn(text) {
  const found = String(text || "").toLowerCase().match(/\b(opus|sonnet|haiku)\b/g);
  return found ? found.at(-1) : null;
}
export const STOP_WORDS = /^\s*(stop|stop it|stop that|cancel|cancel that|hold on|pause)[\s.!]*$/i;

// ---------- repo edits ----------
// A card session edits files outside its job folder only when the user allowed that exact file
// (job.repoWrites). Only code grants: the user's own card-thread replies (gate.mjs) and prompts the
// user types into the session (guard.mjs prompt hook). A path named in that text is allowed at once;
// a file the user described loosely is proposed by the session (job.repoProposed) and allowed by the
// user's next reply if it is a yes. Any other reply drops the proposal. Files live under
// config.repoEdit.roots; secrets never count.
export const SECRET_FILE = /(^|\/)(\.env[^/]*|[^/]*\.env|credentials[^/]*|\.databricks-[^/]*)$/i;
export const APPROVE_WORDS = /^\s*(yes|yep|yeah|y|ok|okay|sure|approved?|go ahead|do it|lgtm)\b/i;

export function repoRoots(config) {
  const roots = config?.repoEdit?.roots;
  return Array.isArray(roots) ? roots.filter((r) => typeof r === "string" && path.isAbsolute(r)).map((r) => path.resolve(r)) : [];
}

const inside = (target, dir) => {
  const rel = path.relative(dir, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

// The real path of a file that may not exist yet (its folder must), so a symlink can't point elsewhere.
export function realTarget(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
    } catch {
      return path.resolve(file);
    }
  }
}

// A repo file a session may be allowed to edit: inside a root, not a secret, not under .git.
export function repoFile(file, roots) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.split("/").includes("..")) return null;
  const real = realTarget(file);
  if (!roots.some((root) => inside(real, realTarget(root)))) return null;
  if (SECRET_FILE.test(real) || real.split("/").includes(".git")) return null;
  return real;
}

// Paths named in a message: absolute ones inside a root (the file or its folder exists), relative ones
// that are existing files under a root.
export function pathsIn(text, roots) {
  const found = new Set();
  for (const raw of String(text || "").split(/[\s,;()<>`'"*]+/)) {
    const word = raw.replace(/^file:\/\//, "").replace(/[.:!?]+$/, "");
    if (!word || !(word.includes("/") || /\.[A-Za-z0-9]{1,8}$/.test(word))) continue;
    const candidates = path.isAbsolute(word) ? [word] : roots.map((root) => path.join(root, word));
    for (const candidate of candidates) {
      const file = repoFile(candidate, roots);
      if (!file) continue;
      const exists = fs.existsSync(file);
      if (exists ? fs.statSync(file).isFile() : path.isAbsolute(word) && fs.existsSync(path.dirname(file))) found.add(file);
    }
  }
  return [...found];
}

// The job patch for the user's new text: named paths allowed, a yes allows the proposal, and the
// proposal is cleared either way. Returns null when nothing changes.
export function repoGrantPatch(job, texts, config) {
  const roots = repoRoots(config);
  if (!roots.length) return null;
  const proposed = Array.isArray(job?.repoProposed) ? job.repoProposed : [];
  const allowed = new Set(Array.isArray(job?.repoWrites) ? job.repoWrites : []);
  const before = allowed.size;
  for (const text of texts) for (const file of pathsIn(text, roots)) allowed.add(file);
  if (proposed.length && texts.some((text) => APPROVE_WORDS.test(text))) {
    for (const file of proposed) {
      const real = repoFile(file, roots);
      if (real) allowed.add(real);
    }
  }
  if (allowed.size === before && !proposed.length) return null;
  return { repoWrites: [...allowed], repoProposed: [], granted: [...allowed].slice(before) };
}

// ---------- permissions ----------
// Anything else the guard won't let a card session do on its own (a skill, the databricks CLI, a
// write tool, a read outside its folders) needs the user's OK. The guard records the missing kinds
// (job.permProposed, with permProposedAt) and tells the session to ask in its card thread; the user's
// next reply allows them if it is a yes (or a ✅ reaction on the ask, gate.mjs), for this card only
// (job.perms). Any other reply drops the proposal. Like repo edits, only code grants.
export const PERM_KIND = /^(skill|tool|mcp|cmd|read|write):[A-Za-z0-9_.@ -]{1,80}$/;

export function permGrantPatch(job, texts) {
  const proposed = Array.isArray(job?.permProposed) ? job.permProposed : [];
  if (!proposed.length || !texts.length) return null;
  const perms = new Set(Array.isArray(job?.perms) ? job.perms : []);
  const before = perms.size;
  if (texts.some((text) => APPROVE_WORDS.test(text))) for (const kind of proposed) perms.add(kind);
  return { perms: [...perms], permProposed: [], permProposedAt: null, granted: [...perms].slice(before) };
}

// Called by the guard: adds kinds to the card's open proposal. Returns the full proposal.
export function proposePerms(store, id, kinds, clock) {
  const bad = kinds.find((kind) => !PERM_KIND.test(kind));
  if (bad) throw new AqError(`not a permission kind: ${bad}`);
  return withItemLock(store, id, () => {
    const item = store.getItem(id);
    const open = Array.isArray(item.job?.permProposed) ? item.job.permProposed : [];
    const added = kinds.filter((kind) => !open.includes(kind));
    if (!added.length) return open;
    const job = { permProposed: [...open, ...added], permProposedAt: item.job?.permProposedAt || nowIso(clock) };
    applyUpdate(store, id, { patch: { job }, note: `asks the user's OK: ${added.join(", ")}`, internal: true }, clock);
    return job.permProposed;
  });
}

// The user's text applied to both kinds of grant. Returns the job fields to set (or null) and the grants.
function grantPatch(job, texts, config) {
  const repo = repoGrantPatch(job, texts, config);
  const perm = permGrantPatch({ ...job, ...(repo || {}) }, texts);
  if (!repo && !perm) return null;
  const { granted: files = [], ...repoFields } = repo || {};
  const { granted: kinds = [], ...permFields } = perm || {};
  const notes = [];
  if (files.length) notes.push(`repo edits allowed: ${files.join(", ")}`);
  if (kinds.length) notes.push(`allowed: ${kinds.join(", ")}`);
  if (perm && !kinds.length) notes.push("permission request declined");
  return { fields: { ...repoFields, ...permFields }, granted: [...files, ...kinds], note: notes.join("; ") };
}

// Used by the prompt hook: applies the user's typed text to the card's grants.
export function grantRepoEdits(store, id, texts, clock) {
  return withItemLock(store, id, () => {
    const item = store.getItem(id);
    const grant = grantPatch(item.job, texts, store.config());
    if (!grant) return [];
    const note = grant.note || "repo edit proposal dropped";
    applyUpdate(store, id, { patch: { job: grant.fields }, note: `by the user: ${note}`, internal: true }, clock);
    return grant.granted;
  });
}
// Statuses whose card threads are checked for replies every run.
const WATCH_STATUSES = ["asking", "approving", "drafted", ...WORK_STATUSES];
// Job fields the model may set through `update --file`. The rest belong to dispatch.mjs.
const JOB_MODEL_KEYS = new Set(["brief", "repo", "base", "followUp", "notice", "result", "kind", "repoProposed"]);
// A type is offered for promotion after this many consecutive drafts went out unedited.
export const PROMOTE_STREAK = 5;
// Don't re-offer a declined promotion for a week.
const PROPOSAL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
// Filtered and closed items stay watchable for two days (unfilter, follow-ups after done/skip).
export const AFTER_CLOSE_WATCH_MS = 48 * 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  timezone: null,
  slack: { userId: null, selfDmId: null },
  jira: { cloudId: null, accountId: null, projects: [] },
  gmail: { account: null },
  sources: { slack: true, jira: false, zoom: false, gmail: false },
  models: { sweep: "sonnet", replies: "sonnet" },
  // gate.mjs: force a full sweep after this many quiet hours (reconcile drafts, learn).
  gate: { maxQuietHours: 6 },
  workers: {},
  // Folders whose files a card session may edit once the user allows each file (empty: never).
  repoEdit: { roots: [] },
};

// Background workers (dispatch.mjs). config.workers overrides any of these.
export const WORKER_DEFAULTS = {
  max: 5, // sessions running at once
  dailyRuns: 100, // session starts and resumes per day (every reply on a card is one)
  timeLimitMin: 60, // per work run; the session is stopped after this
  model: "opus", // work runs (after "go")
  cardTimeLimitMin: 20, // per card run (prep, a reply, a draft)
  cardModel: "sonnet", // card runs
  cardEffort: "medium", // card runs (claude --effort); work runs use the default effort
  prepDelayMin: 10, // a new ask waits this long before its card session starts, so the user can claim it
};

const DEFAULT_STATE = {
  schemaVersion: 1,
  nextId: 1,
  checkpoints: {},
  simpleTypes: [],
  proposals: {},
};

export function resolveHome(env = process.env) {
  if (env.ASK_QUEUE_HOME) return path.resolve(env.ASK_QUEUE_HOME);
  const dataHome = env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "ask-queue");
}

export class AqError extends Error {}

// ---------- file helpers ----------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return structuredClone(fallback);
    if (err.code === "ENOENT") throw new AqError(`Missing ${file}. Run: aq.mjs init`);
    throw new AqError(`Invalid JSON in ${file}: ${err.message}`);
  }
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function readInputFile(home, file) {
  if (typeof file !== "string" || !file) throw new AqError("--file is required");
  const resolved = path.resolve(home, file);
  const rel = path.relative(home, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new AqError("--file must be inside the data directory");
  return readJson(resolved);
}

// ---------- store ----------

export function createStore(home) {
  const p = {
    home,
    items: path.join(home, "items"),
    memory: path.join(home, "memory"),
    state: path.join(home, "state.json"),
    config: path.join(home, "config.json"),
    ledger: path.join(home, "ledger.jsonl"),
  };

  const itemFile = (id) => {
    if (!/^AQ-\d+$/.test(id)) throw new AqError(`Invalid item id: ${id}`);
    return path.join(p.items, `${id}.json`);
  };

  const store = {
    paths: p,

    init() {
      for (const dir of ["items", "memory", "tmp", "artifacts", "logs"]) {
        fs.mkdirSync(path.join(home, dir), { recursive: true });
      }
      const seeded = [];
      const templates = path.join(SKILL_DIR, "templates", "memory");
      for (const name of fs.readdirSync(templates)) {
        const target = path.join(p.memory, name);
        if (!fs.existsSync(target)) {
          fs.copyFileSync(path.join(templates, name), target);
          seeded.push(name);
        }
      }
      if (!fs.existsSync(p.state)) writeJsonAtomic(p.state, DEFAULT_STATE);
      if (!fs.existsSync(p.config)) writeJsonAtomic(p.config, DEFAULT_CONFIG);
      if (!fs.existsSync(p.ledger)) fs.writeFileSync(p.ledger, "");
      return { home, seededMemory: seeded };
    },

    config() {
      return readJson(p.config);
    },

    state() {
      return readJson(p.state);
    },

    saveState(state) {
      writeJsonAtomic(p.state, state);
    },

    allItems() {
      if (!fs.existsSync(p.items)) throw new AqError(`Missing ${p.items}. Run: aq.mjs init`);
      return fs
        .readdirSync(p.items)
        .filter((name) => /^AQ-\d+\.json$/.test(name))
        .map((name) => readJson(path.join(p.items, name)))
        .sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));
    },

    getItem(id) {
      const file = itemFile(id);
      if (!fs.existsSync(file)) throw new AqError(`No such item: ${id}`);
      return readJson(file);
    },

    saveItem(item) {
      writeJsonAtomic(itemFile(item.id), item);
    },

    // Exclusive create: never overwrites, so a chat session and a cron run can't clobber one id.
    createItem(item) {
      try {
        fs.writeFileSync(itemFile(item.id), `${JSON.stringify(item, null, 2)}\n`, { flag: "wx" });
        return true;
      } catch (err) {
        if (err.code === "EEXIST") return false;
        throw err;
      }
    },

    ledgerEntries() {
      if (!fs.existsSync(p.ledger)) return [];
      return fs
        .readFileSync(p.ledger, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    },

    appendLedger(entry) {
      fs.appendFileSync(p.ledger, `${JSON.stringify(entry)}\n`);
    },
  };
  return store;
}

// ---------- operations ----------

function nowIso(clock) {
  return (clock ? clock() : new Date()).toISOString();
}

function validateCandidate(c) {
  if (!c || typeof c !== "object") throw new AqError("Candidate must be a JSON object");
  if (typeof c.title !== "string" || !c.title.trim()) throw new AqError("Candidate needs a title");
  if (!c.source || typeof c.source.kind !== "string") throw new AqError("Candidate needs source.kind");
  if (!Array.isArray(c.fingerprints) || c.fingerprints.length === 0) {
    throw new AqError("Candidate needs at least one fingerprint");
  }
  for (const fp of c.fingerprints) {
    if (typeof fp !== "string" || !fp.trim()) throw new AqError("Fingerprints must be non-empty strings");
  }
  if (c.status !== undefined && c.status !== "new" && c.status !== "filtered") {
    throw new AqError("A new candidate's status must be 'new' or 'filtered'");
  }
}

export function addCandidate(store, candidate, clock) {
  validateCandidate(candidate);
  const at = nowIso(clock);
  const items = store.allItems();
  const fps = [...new Set(candidate.fingerprints)];

  const known = items.find((item) => item.fingerprints.some((fp) => fps.includes(fp)));
  if (known) {
    const fresh = fps.filter((fp) => !known.fingerprints.includes(fp));
    if (fresh.length === 0) return { action: "duplicate", id: known.id };
    return { action: "merged", id: mergeInto(store, known, candidate, fresh, at).id };
  }

  if (candidate.mergeInto) {
    const target = items.find((item) => item.id === candidate.mergeInto);
    if (target && OPEN_STATUSES.includes(target.status)) {
      return { action: "merged", id: mergeInto(store, target, candidate, fps, at).id };
    }
  }

  const state = store.state();
  const highest = items.reduce((max, item) => Math.max(max, Number(item.id.slice(3))), 0);
  let next = Math.max(state.nextId, highest + 1);
  const { mergeInto: related, status, ...rest } = candidate;
  const item = {
    ...rest,
    status: status || "new",
    fingerprints: fps,
    seenCount: 1,
    createdAt: at,
    updatedAt: at,
    history: [{ at, event: "created", status: status || "new" }],
  };
  if (related) item.relatedTo = related;
  while (!store.createItem({ ...item, id: `AQ-${next}` })) next += 1;
  state.nextId = next + 1;
  store.saveState(state);
  return { action: "created", id: `AQ-${next}` };
}

function mergeInto(store, target, candidate, freshFps, at) {
  target.fingerprints = [...target.fingerprints, ...freshFps];
  target.seenCount = (target.seenCount || 1) + 1;
  target.updates = [
    ...(target.updates || []),
    { at, excerpt: candidate.excerpt || candidate.summary || candidate.title, source: candidate.source },
  ];
  target.updatedAt = at;
  target.history.push({ at, event: "merged", fingerprints: freshFps });
  store.saveItem(target);
  return target;
}

const IMMUTABLE_KEYS = new Set(["id", "history", "createdAt", "fingerprints", "seenCount", "updates"]);

// Workers and scheduled runs write items at the same time: one writer per item via a lock dir.
export function withItemLock(store, id, fn) {
  const lock = path.join(store.paths.items, `.${id}.lock`);
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lock).mtimeMs;
      } catch {
        continue;
      }
      if (age > 30_000) fs.rmSync(lock, { recursive: true, force: true });
      else if (Date.now() > deadline) throw new AqError(`${id} is locked by another writer`);
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

export function updateItem(store, id, opts = {}, clock) {
  return withItemLock(store, id, () => applyUpdate(store, id, opts, clock));
}

function applyUpdate(store, id, { patch = {}, status, note, internal = false } = {}, clock) {
  const item = store.getItem(id);
  const at = nowIso(clock);
  for (const key of Object.keys(patch)) {
    if (IMMUTABLE_KEYS.has(key)) throw new AqError(`Cannot update ${key}`);
  }
  if (patch.job !== undefined) {
    if (typeof patch.job !== "object" || patch.job === null) throw new AqError("job must be an object");
    const bad = Object.keys(patch.job).filter((key) => !internal && !JOB_MODEL_KEYS.has(key));
    if (bad.length) throw new AqError(`job.${bad[0]} is managed by dispatch.mjs`);
    if (patch.job.kind !== undefined && !JOB_KINDS.includes(patch.job.kind)) {
      throw new AqError(`job.kind must be one of ${JOB_KINDS.join(", ")}`);
    }
    if (patch.job.repoProposed !== undefined && !internal) {
      const roots = repoRoots(store.config());
      const list = patch.job.repoProposed;
      if (!Array.isArray(list) || list.length > 20) throw new AqError("job.repoProposed must be a list of up to 20 absolute paths");
      const files = list.map((file) => repoFile(file, roots));
      const bad = list.find((file, i) => !files[i]);
      if (bad !== undefined) throw new AqError(`${bad} is not a repo file you can propose (config repoEdit.roots, no secrets)`);
      patch = { ...patch, job: { ...patch.job, repoProposed: files, repoProposedAt: at } };
    }
    // Merge, so setting job.followUp never wipes the session id.
    patch = { ...patch, job: { ...(item.job || {}), ...patch.job } };
  }
  const nextStatus = status || patch.status;
  if (nextStatus && !(nextStatus in TRANSITIONS)) throw new AqError(`Unknown status: ${nextStatus}`);
  if (nextStatus && nextStatus !== item.status && !TRANSITIONS[item.status].includes(nextStatus)) {
    throw new AqError(`Cannot move ${id} from ${item.status} to ${nextStatus}`);
  }
  const from = item.status;
  Object.assign(item, patch);
  if (nextStatus) item.status = nextStatus;
  if (nextStatus === "ready" && from !== "ready") {
    if (!item.job?.brief) throw new AqError(`${id} needs job.brief before it can be ready`);
    item.job = { ...item.job, readyAt: at };
  }
  item.updatedAt = at;
  const event = { at, event: "updated" };
  if (nextStatus && nextStatus !== from) Object.assign(event, { from, to: nextStatus });
  if (note) event.note = note;
  item.history.push(event);
  store.saveItem(item);
  return item;
}

export function summarize(item) {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    askType: item.askType || null,
    who: item.source?.who || null,
    source: item.source?.kind || null,
    card: item.card || null,
    updatedAt: item.updatedAt,
    ...(item.job ? { job: { running: Boolean(item.job.pid), notice: item.job.notice || null } } : {}),
  };
}

export function workerConfig(store) {
  let config = {};
  try {
    config = store.config();
  } catch {
    // not initialized: defaults
  }
  return { ...WORKER_DEFAULTS, ...(config.workers || {}) };
}

// Running and waiting work, in start order (oldest go first).
export function listJobs(store) {
  const items = store.allItems();
  const order = (item) => item.job?.readyAt || item.updatedAt;
  const queued = items
    .filter((item) => item.status === "ready")
    .sort((a, b) => order(a).localeCompare(order(b)))
    .map((item, i) => ({ id: item.id, title: item.title, position: i + 1 }));
  const running = items
    .filter((item) => item.status === "working")
    .map((item) => ({ id: item.id, title: item.title, startedAt: item.job?.startedAt || null }));
  const review = items.filter((item) => item.status === "review").map((item) => item.id);
  return { limit: workerConfig(store).max, running, queued, review };
}

// "stop": a running worker is stopped by its supervisor (dispatch.mjs), which polls for this flag.
// Work that has not started goes back to scoping.
export function stopJob(store, id, clock) {
  const item = store.getItem(id);
  if (item.status === "working") {
    return summarize(updateItem(store, id, { patch: { job: { stopRequested: nowIso(clock) } }, internal: true, note: "stop requested" }, clock));
  }
  if (item.status === "ready") return summarize(updateItem(store, id, { status: "scoping", note: "stopped before start" }, clock));
  throw new AqError(`${id} is ${item.status}: nothing is running`);
}

// When the item last entered its current status (not updatedAt, which every thread check bumps).
export function enteredStatusAt(item) {
  const event = [...item.history]
    .reverse()
    .find((h) => h.to === item.status || (h.event === "created" && h.status === item.status));
  return event?.at || item.updatedAt;
}

// Slack ts strings ("1727450000.1234") compared as numbers without float rounding.
export function compareTs(a, b) {
  const [as, af = ""] = String(a).split(".");
  const [bs, bf = ""] = String(b).split(".");
  if (Number(as) !== Number(bs)) return Number(as) < Number(bs) ? -1 : 1;
  const fa = af.padEnd(6, "0");
  const fb = bf.padEnd(6, "0");
  return fa === fb ? 0 : fa < fb ? -1 : 1;
}

export function listItems(store, { statuses, open, watch } = {}, clock) {
  const now = (clock ? clock() : new Date()).getTime();
  return store
    .allItems()
    .filter((item) => {
      if (statuses && !statuses.includes(item.status)) return false;
      if (open && !OPEN_STATUSES.includes(item.status)) return false;
      if (watch) {
        if (!item.card?.ts) return false;
        if (WATCH_STATUSES.includes(item.status)) return true;
        if (["filtered", "done", "skipped"].includes(item.status)) {
          return now - Date.parse(enteredStatusAt(item)) < AFTER_CLOSE_WATCH_MS;
        }
        return false;
      }
      return true;
    })
    .map(summarize);
}

// Record that the user's messages up to msgTs in one card thread were handled. Forward-only, and
// applied to every item whose card is that thread (a filtered digest thread is shared).
export function markSeen(store, channelId, threadTs, msgTs) {
  if (!channelId || !threadTs || !/^\d+(\.\d+)?$/.test(String(msgTs || ""))) {
    throw new AqError("usage: seen <channelId> <cardTs> <messageTs>");
  }
  const updated = [];
  for (const item of store.allItems()) {
    if (item.card?.channelId !== channelId || item.card?.ts !== threadTs) continue;
    const moved = withItemLock(store, item.id, () => {
      const fresh = store.getItem(item.id);
      if (fresh.card.lastSeenTs && compareTs(fresh.card.lastSeenTs, msgTs) >= 0) return false;
      fresh.card.lastSeenTs = String(msgTs);
      store.saveItem(fresh);
      return true;
    });
    if (moved) updated.push(item.id);
  }
  return { updated };
}

function formatMessage(m) {
  const stamp = m.ts ? `[${m.ts}${m.editedTs ? `, edited ${m.editedTs}` : ""}] ` : "";
  const files = (m.files || []).map((f) => `\n  file: ${f.name || "file"} ${f.url || ""}`.trimEnd()).join("");
  const cut = m.truncated ? "\n  (message cut off: read it in full from Slack)" : "";
  return `${stamp}${String(m.text || "").trim()}${files}${cut}`;
}

// Hands the user's new messages in a card thread to that card's session: appended to job.followUp
// (earlier text kept), and the item queued (ready) unless its session is already queued or running.
// seenTs (optional) marks the thread handled up to that message. Used by gate.mjs and `aq route`.
// grant: the messages are the user's own (gate.mjs only), so they may allow repo edits.
export function routeToCard(store, id, { messages, seenTs = null } = {}, clock, { grant = false } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) throw new AqError("route needs messages[]");
  for (const m of messages) {
    if (!m || typeof m.text !== "string") throw new AqError("each message needs text");
  }
  const text = messages.map(formatMessage).join("\n");
  const item = withItemLock(store, id, () => {
    const fresh = store.getItem(id);
    if (fresh.status === "filtered") throw new AqError(`${id} is filtered: the replies run handles digest threads`);
    const job = fresh.job || {};
    const patch = {
      job: {
        followUp: [job.followUp, text].filter(Boolean).join("\n"),
        kind: job.kind || "card",
        brief: job.brief || CARD_BRIEF,
      },
    };
    const model = messages.map((m) => modelIn(m.text)).filter(Boolean).at(-1);
    if (model) patch.job.model = model;
    let note = "user message for the card session";
    const given = grant ? grantPatch(job, messages.map((m) => m.text), store.config()) : null;
    if (given) {
      Object.assign(patch.job, given.fields);
      if (given.note) note += `; ${given.note}`;
    }
    let status;
    if (fresh.status === "working") {
      if (messages.some((m) => STOP_WORDS.test(m.text))) patch.job.stopRequested = nowIso(clock);
    } else if (fresh.status !== "ready" && fresh.status !== "new") {
      status = "ready";
      patch.job.restingStatus = fresh.status;
    }
    return applyUpdate(store, id, { patch, status, note, internal: true }, clock);
  });
  if (seenTs && item.card?.channelId && item.card?.ts) markSeen(store, item.card.channelId, item.card.ts, seenTs);
  return summarize(store.getItem(id));
}

export function addLedger(store, entry, clock) {
  if (!entry || typeof entry !== "object") throw new AqError("Ledger entry must be a JSON object");
  if (typeof entry.id !== "string") throw new AqError("Ledger entry needs the item id");
  if (!["sent", "skipped", "filtered", "unknown"].includes(entry.outcome)) {
    throw new AqError("Ledger outcome must be sent, skipped, filtered or unknown");
  }
  const record = { at: nowIso(clock), ...entry };
  store.appendLedger(record);
  return record;
}

export function findLedger(store, query, limit = 5) {
  const terms = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) throw new AqError("ledger find needs a query");
  return store
    .ledgerEntries()
    .filter((entry) => {
      const haystack = JSON.stringify(entry).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .reverse()
    .slice(0, limit);
}

export function computeStats(store, clock) {
  const now = (clock ? clock() : new Date()).getTime();
  const state = store.state();
  const byType = {};
  // A reopened item is closed twice; only its latest entry counts.
  const latest = new Map();
  for (const entry of store.ledgerEntries()) {
    latest.delete(entry.id);
    latest.set(entry.id, entry);
  }
  for (const entry of latest.values()) {
    const type = entry.askType || "unlabeled";
    byType[type] ||= [];
    byType[type].push(entry);
  }
  const types = {};
  for (const [type, entries] of Object.entries(byType)) {
    let streak = 0;
    for (const entry of [...entries].reverse()) {
      if (entry.outcome === "sent" && entry.edited === false) streak += 1;
      else if (entry.outcome === "sent" || entry.outcome === "skipped") break;
    }
    const sent = entries.filter((e) => e.outcome === "sent");
    const lastTwoSent = sent.slice(-2);
    const simple = state.simpleTypes.includes(type);
    const proposal = state.proposals[type];
    const cooling = proposal && now - Date.parse(proposal.at) < PROPOSAL_COOLDOWN_MS;
    types[type] = {
      closed: entries.length,
      sent: sent.length,
      edited: sent.filter((e) => e.edited === true).length,
      skipped: entries.filter((e) => e.outcome === "skipped").length,
      uneditedStreak: streak,
      simple,
      promotable: type !== "unlabeled" && !simple && streak >= PROMOTE_STREAK && !cooling,
      demoteSuggested: simple && lastTwoSent.length === 2 && lastTwoSent.every((e) => e.edited === true),
    };
  }
  const openProposals = Object.entries(state.proposals)
    .filter(([, proposal]) => proposal.open && proposal.ts)
    .map(([type, proposal]) => ({ type, ts: proposal.ts }));
  return { simpleTypes: state.simpleTypes, openProposals, types };
}

export function setSimple(store, type, simple) {
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(type)) throw new AqError(`Invalid askType: ${type}`);
  const state = store.state();
  const set = new Set(state.simpleTypes);
  if (simple) set.add(type);
  else set.delete(type);
  state.simpleTypes = [...set].sort();
  delete state.proposals[type];
  store.saveState(state);
  return { simpleTypes: state.simpleTypes };
}

export function recordProposal(store, type, ts, clock) {
  const state = store.state();
  state.proposals[type] = { at: nowIso(clock), ts: ts || null, open: true };
  store.saveState(state);
  return state.proposals[type];
}

// The user said no: stop watching the offer thread; `at` keeps the cooldown running.
export function declineProposal(store, type) {
  const state = store.state();
  if (!state.proposals[type]) throw new AqError(`No promotion offer for ${type}`);
  state.proposals[type].open = false;
  store.saveState(state);
  return state.proposals[type];
}

function getPath(obj, dotted) {
  return dotted.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let cursor = obj;
  for (const key of keys.slice(0, -1)) {
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

function parseValue(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function nowInfo(store, clock) {
  const date = clock ? clock() : new Date();
  let timezone = null;
  try {
    timezone = store.config().timezone;
  } catch {
    // config not initialized yet
  }
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    iso: date.toISOString(),
    epoch: Math.floor(date.getTime() / 1000),
    timezone: tz,
    timezoneConfirmed: Boolean(timezone),
    local: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
  };
}

// Settings JSON for headless runs: wires the guard hook with absolute paths, and points every command
// at this data directory (background sessions don't inherit the caller's environment).
// With workerId: the worker profile (guard.mjs --worker), which only polices outward actions.
export function headlessSettings(home, workerId) {
  const guard = path.join(SKILL_DIR, "scripts", "guard.mjs");
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  if (workerId !== undefined && !/^AQ-\d+$/.test(String(workerId))) throw new AqError(`Invalid item id: ${workerId}`);
  const worker = workerId ? ` --worker ${workerId}` : "";
  const hook = [{ hooks: [{ type: "command", command: `node ${quote(guard)} ${quote(home)}${worker}`, timeout: 20 }] }];
  // Workers also see the user's typed prompts, which may allow repo edits (guard.mjs promptHook).
  return { env: { ASK_QUEUE_HOME: home }, hooks: { PreToolUse: hook, ...(workerId ? { UserPromptSubmit: hook } : {}) } };
}

// ---------- CLI ----------

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
    } else positional.push(arg);
  }
  return { flags, positional };
}

const USAGE = `usage: aq.mjs <command>
  init                                  create the data dir and seed memory
  now                                   current time in the configured timezone
  config get [key] | config set <key> <json-or-string>
  checkpoint get <key> | checkpoint set <key> <value>
  add --file <candidate.json>           create, merge or de-duplicate an ask
  list [--open] [--watch] [--status a,b]
  seen <channelId> <cardTs> <messageTs> mark user messages up to messageTs handled (forward-only)
  route <id> --file <msgs.json>          pass card-thread messages to the card's session ({messages, seenTs})
  get <id>
  update <id> [--status s] [--file patch.json] [--note text]
  ledger add --file <entry.json> | ledger find <query> [--limit n]
  stats                                 per-askType outcomes and promotion flags
  promote <askType> | demote <askType> | propose <askType> [--ts cardTs] | decline <askType>
  jobs                                  running and queued workers
  stop <id>                             stop a running worker (or un-queue a ready item)
  settings [--worker <id>]              headless Claude settings (guard hook)`;

export function run(argv, env = process.env, clock) {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const home = resolveHome(env);
  const store = createStore(home);

  switch (command) {
    case "init":
      return store.init();
    case "now":
      return nowInfo(store, clock);
    case "config": {
      const [action, key, value] = positional;
      const config = store.config();
      if (action === "get") return key ? (getPath(config, key) ?? null) : config;
      if (action === "set" && key && value !== undefined) {
        if (key === "timezone") {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: value });
          } catch {
            throw new AqError(`Unknown IANA timezone: ${value}`);
          }
        }
        setPath(config, key, parseValue(value));
        writeJsonAtomic(store.paths.config, config);
        return { [key]: getPath(config, key) };
      }
      throw new AqError("usage: config get [key] | config set <key> <value>");
    }
    case "checkpoint": {
      const [action, key, value] = positional;
      const state = store.state();
      if (action === "get" && key) return { [key]: state.checkpoints[key] ?? null };
      if (action === "set" && key && value !== undefined) {
        state.checkpoints[key] = value;
        store.saveState(state);
        return { [key]: value };
      }
      throw new AqError("usage: checkpoint get <key> | checkpoint set <key> <value>");
    }
    case "add":
      return addCandidate(store, readInputFile(home, flags.file), clock);
    case "list":
      return listItems(
        store,
        {
          statuses: typeof flags.status === "string" ? flags.status.split(",") : undefined,
          open: Boolean(flags.open),
          watch: Boolean(flags.watch),
        },
        clock,
      );
    case "get":
      return store.getItem(positional[0]);
    case "seen":
      return markSeen(store, ...positional);
    case "route":
      return routeToCard(store, positional[0], readInputFile(home, flags.file), clock);
    case "update":
      return summarize(
        updateItem(
          store,
          positional[0],
          {
            patch: flags.file ? readInputFile(home, flags.file) : {},
            status: typeof flags.status === "string" ? flags.status : undefined,
            note: typeof flags.note === "string" ? flags.note : undefined,
          },
          clock,
        ),
      );
    case "ledger": {
      const [action, ...query] = positional;
      if (action === "add") return addLedger(store, readInputFile(home, flags.file), clock);
      if (action === "find") return findLedger(store, query.join(" "), Number(flags.limit) || 5);
      throw new AqError("usage: ledger add --file f | ledger find <query>");
    }
    case "stats":
      return computeStats(store, clock);
    case "promote":
      return setSimple(store, positional[0], true);
    case "demote":
      return setSimple(store, positional[0], false);
    case "propose":
      return recordProposal(store, positional[0], typeof flags.ts === "string" ? flags.ts : null, clock);
    case "decline":
      return declineProposal(store, positional[0]);
    case "jobs":
      return listJobs(store);
    case "stop":
      return stopJob(store, positional[0], clock);
    case "settings":
      return headlessSettings(home, typeof flags.worker === "string" ? flags.worker : undefined);
    default:
      throw new AqError(USAGE);
  }
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = run(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    const message = err instanceof AqError ? err.message : `${err.name}: ${err.message}`;
    process.stderr.write(`${JSON.stringify({ error: message })}\n`);
    process.exit(1);
  }
}
