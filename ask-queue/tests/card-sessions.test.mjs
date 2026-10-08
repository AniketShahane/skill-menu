import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CARD_BRIEF, TRANSITIONS, modelIn, routeToCard, updateItem } from "../scripts/aq.mjs";
import { cardPostMarker, execJob, runLimits, settingsFile, tick, workerPrompt } from "../scripts/dispatch.mjs";
import { decide as gateDecide } from "../scripts/gate.mjs";
import { decide as guardDecide, makeContext } from "../scripts/guard.mjs";
import { SELF_DM, USER, addItem, fakeBgClaude, makeHome, setStatus, withCard } from "./helpers.mjs";

const noSpawn = () => {};

// ---------- transitions ----------

test("transitions: card sessions can queue from resting statuses and end anywhere sensible", () => {
  for (const from of ["new", "asking", "approving", "drafted", "scoping", "review", "done", "skipped"]) {
    assert.ok(TRANSITIONS[from].includes("ready"), `${from} -> ready`);
  }
  for (const to of ["new", "asking", "approving", "drafted", "scoping", "ready", "review", "done", "skipped", "filtered"]) {
    assert.ok(TRANSITIONS.working.includes(to), `working -> ${to}`);
  }
  assert.ok(!TRANSITIONS.ready.includes("asking"), "ready only starts, goes back to scoping, or is skipped");
  assert.ok(!TRANSITIONS.filtered.includes("ready"), "filtered items come back through new");
});

test("transitions: ready still needs a brief, and job.kind is validated", () => {
  const { store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  assert.throws(() => updateItem(store, id, { status: "ready" }), /needs job.brief/);
  assert.throws(() => updateItem(store, id, { patch: { job: { kind: "boss" } } }), /job.kind/);
  updateItem(store, id, { patch: { job: { kind: "work", brief: "do it" } }, status: "ready" });
  assert.equal(store.getItem(id).status, "ready");
});

// ---------- routing ----------

test("route: a reply on a resting card is appended and queues its session", () => {
  const { store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id, "500.000100");
  routeToCard(store, id, { messages: [{ ts: "600.000001", text: "2 is the analytics repo" }], seenTs: "600.000001" });
  let item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.equal(item.job.kind, "card");
  assert.equal(item.job.brief, CARD_BRIEF);
  assert.equal(item.job.restingStatus, "asking");
  assert.match(item.job.followUp, /\[600\.000001\] 2 is the analytics repo/);
  assert.equal(item.card.lastSeenTs, "600.000001");

  // A second reply before the run starts keeps the first.
  routeToCard(store, id, { messages: [{ ts: "601.000001", text: "and say Friday" }], seenTs: "601.000001" });
  item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.match(item.job.followUp, /analytics repo\n\[601\.000001\] and say Friday/);
});

test("route: a reply while the session runs waits for the run to end; 'stop' stops it", () => {
  const { store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id);
  routeToCard(store, id, { messages: [{ ts: "600.1", text: "ok" }] });
  setStatus(store, id, "working");
  routeToCard(store, id, { messages: [{ ts: "602.1", text: "also add Q2" }] });
  let item = store.getItem(id);
  assert.equal(item.status, "working");
  assert.match(item.job.followUp, /also add Q2/);
  assert.equal(item.job.stopRequested, undefined);
  routeToCard(store, id, { messages: [{ ts: "603.1", text: "Stop!" }] });
  item = store.getItem(id);
  assert.ok(item.job.stopRequested);
});

test("route: filtered items are left to the replies run", () => {
  const { store } = makeHome();
  const id = addItem(store, { status: "filtered" });
  assert.throws(() => routeToCard(store, id, { messages: [{ text: "AQ-1 is mine" }] }), /filtered/);
});

// ---------- gate ----------

function fakeSlack({ threads = {}, history = [] }) {
  return async (url) => {
    const method = url.pathname.split("/").pop();
    const p = url.searchParams;
    let body;
    if (method === "conversations.replies") body = { ok: true, messages: threads[p.get("ts")] || [] };
    else if (method === "conversations.history") body = { ok: true, messages: history };
    else body = { ok: false, error: `unexpected ${method}` };
    return { status: 200, json: async () => body, headers: { get: () => null } };
  };
}

test("gate: a card-thread reply goes to its session without a Claude run", async () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "approving");
  withCard(store, id, "500.000100");
  const nowSec = 700;
  const fetchImpl = fakeSlack({
    threads: {
      "500.000100": [
        { ts: "500.000100", user: USER, text: "🤖 AQ card" },
        { ts: "650.000001", user: USER, text: "make it shorter" },
        { ts: "651.000001", user: USER, text: "🤖 AQ-1 · Revised:" },
      ],
    },
    history: [],
  });
  const result = await gateDecide("replies", { home, token: "xoxp-test", fetchImpl, clock: () => new Date(nowSec * 1000) });
  assert.equal(result.run, false, result.reason);
  assert.deepEqual(result.routed, [id]);
  const item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.equal(item.job.restingStatus, "approving");
  assert.match(item.job.followUp, /make it shorter/);
  assert.doesNotMatch(item.job.followUp, /Revised/);
  assert.equal(item.card.lastSeenTs, "650.000001");
  assert.ok(!fs.existsSync(path.join(home, "tmp", "inbox.json")));

  // Nothing new next time: the thread was marked seen.
  const again = await gateDecide("replies", { home, token: "xoxp-test", fetchImpl, clock: () => new Date(nowSec * 1000) });
  assert.equal(again.run, false);
  assert.deepEqual(again.routed, []);
});

test("gate: top-level messages and digest threads still start the replies run", async () => {
  const { home, store } = makeHome();
  const a = addItem(store, { status: "filtered" });
  const b = addItem(store, { status: "filtered" });
  withCard(store, a, "400.000100");
  withCard(store, b, "400.000100");
  const nowSec = 700;
  const fetchImpl = fakeSlack({
    threads: { "400.000100": [{ ts: "650.000001", user: USER, text: `${b} is mine` }] },
    history: [{ ts: "690.000001", user: USER, text: "draft a reply to Lee's email" }],
  });
  const result = await gateDecide("replies", { home, token: "xoxp-test", fetchImpl, clock: () => new Date(nowSec * 1000) });
  assert.equal(result.run, true);
  const inbox = JSON.parse(fs.readFileSync(path.join(home, "tmp", "inbox.json"), "utf8"));
  assert.equal(inbox.cards.length, 1, "the shared digest thread is not routed");
  assert.equal(inbox.topLevel.length, 1);
  assert.equal(store.getItem(b).status, "filtered");
});

// ---------- dispatch ----------

test("dispatch: a new ask gets its own card session (prep run)", () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  const started = [];
  const result = tick({ home, spawnSupervisor: (h, i) => started.push(i) });
  assert.deepEqual(result.prepQueued, [id]);
  assert.deepEqual(started, [id]);
  const item = store.getItem(id);
  assert.equal(item.status, "working");
  assert.equal(item.job.kind, "card");
  assert.ok(item.job.sessionId);
  assert.ok(fs.existsSync(settingsFile(home, id)), "guard settings live outside the job folder");
  assert.ok(!fs.existsSync(path.join(item.job.dir, "settings.json")));
  assert.match(workerPrompt(home, item, store.config()), /No card yet: post the card as ONE top-level message to channel D1/);
});

test("dispatch: an item brought back from the digest gets its own card", () => {
  const { home, store } = makeHome();
  const id = addItem(store, { status: "filtered" });
  withCard(store, id, "400.000100");
  setStatus(store, id, "new");
  tick({ home, spawnSupervisor: noSpawn });
  const item = store.getItem(id);
  assert.equal(item.card, null);
  assert.equal(item.previousCard.ts, "400.000100");
});

// A fake `claude`: records its arguments, then acts like a session that finished its run by
// setting the card's next status (FAKE_STATUS) through aq.mjs.
function fakeClaude(home) {
  const bin = path.join(home, "fake-claude.sh");
  const aq = path.resolve(import.meta.dirname, "..", "scripts", "aq.mjs");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${home}/claude-args.txt"\necho --- >> "${home}/claude-args.txt"\nnode "${aq}" update "$ASK_QUEUE_JOB" --status "\${FAKE_STATUS:-approving}" >/dev/null\n`,
  );
  fs.chmodSync(bin, 0o755);
  return fakeBgClaude(home, bin);
}

const runsOf = (home) =>
  fs.readFileSync(path.join(home, "claude-args.txt"), "utf8").split("---\n").filter(Boolean).map((r) => r.split("\n"));

test("dispatch: every reply resumes the same session", async () => {
  const { home, store } = makeHome();
  const claudeBin = fakeClaude(home);
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id, "500.000100");

  routeToCard(store, id, { messages: [{ ts: "600.1", text: "ok" }] });
  tick({ home, spawnSupervisor: noSpawn });
  await execJob(id, { home, claudeBin });
  const sessionId = store.getItem(id).job.sessionId;
  let item = store.getItem(id);
  assert.equal(item.status, "approving", "the run set the resting status");
  assert.equal(item.job.followUp, null);

  routeToCard(store, id, { messages: [{ ts: "601.1", text: "yes" }] });
  tick({ home, spawnSupervisor: noSpawn });
  assert.equal(store.getItem(id).job.sessionId, sessionId);
  await execJob(id, { home, claudeBin });

  const [first, second] = runsOf(home);
  assert.ok(!first.includes("--resume"));
  assert.equal(first[first.indexOf("--name") + 1], `${id} · ${item.title}`, "named after the card in the agent view");
  assert.equal(second[second.indexOf("--resume") + 1], sessionId);
  assert.ok(second.join("\n").includes("[601.1] yes"), "the new reply is in the resume prompt");
  assert.equal(first[first.indexOf("--model") + 1], "sonnet", "card runs default to sonnet");
  assert.equal(first[first.indexOf("--effort") + 1], "medium");
  item = store.getItem(id);
  assert.equal(item.job.runs, 2);
});

test("dispatch: 'go' moves the same session to a work run with the work budget", async () => {
  const { home, store } = makeHome();
  const claudeBin = fakeClaude(home);
  const id = addItem(store);
  setStatus(store, id, "scoping");
  withCard(store, id, "500.000100");
  routeToCard(store, id, { messages: [{ ts: "600.1", text: "go" }] });
  tick({ home, spawnSupervisor: noSpawn });
  // The card run writes the brief and queues the work (as card-session.md says).
  process.env.FAKE_STATUS = "working";
  await execJob(id, { home, claudeBin });
  const sessionId = store.getItem(id).job.sessionId;
  updateItem(store, id, { patch: { job: { kind: "work", brief: "Objective: the query" } }, status: "ready" });
  tick({ home, spawnSupervisor: noSpawn });
  process.env.FAKE_STATUS = "review";
  await execJob(id, { home, claudeBin });
  delete process.env.FAKE_STATUS;
  const runs = runsOf(home);
  const work = runs.at(-1);
  assert.equal(work[work.indexOf("--resume") + 1], sessionId);
  assert.ok(work.includes("--model"), "a work run starts with the work options");
  assert.ok(work.join("\n").includes("The user said go"));
  assert.equal(store.getItem(id).status, "review");
});

test("dispatch: a reply during a run re-queues the session when the run ends", async () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id);
  routeToCard(store, id, { messages: [{ ts: "600.1", text: "ok" }] });
  tick({ home, spawnSupervisor: noSpawn });
  // Arrives while the session runs; the fake session then ends in approving.
  const claudeBin = path.join(home, "slow-claude.sh");
  const aq = path.resolve(import.meta.dirname, "..", "scripts", "aq.mjs");
  const tmp = path.join(home, "tmp", "route.json");
  fs.writeFileSync(tmp, JSON.stringify({ messages: [{ ts: "605.1", text: "say Friday" }] }));
  fs.writeFileSync(
    claudeBin,
    `#!/usr/bin/env bash\nnode "${aq}" route "$ASK_QUEUE_JOB" --file tmp/route.json >/dev/null\nnode "${aq}" update "$ASK_QUEUE_JOB" --status approving >/dev/null\n`,
  );
  fs.chmodSync(claudeBin, 0o755);
  await execJob(id, { home, claudeBin: fakeBgClaude(home, claudeBin) });
  const item = store.getItem(id);
  assert.equal(item.status, "ready");
  assert.match(item.job.followUp, /say Friday/);
});

test("dispatch: a prep run that posts no card is retried, then reported", async () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  const claudeBin = path.join(home, "noop-claude.sh");
  fs.writeFileSync(claudeBin, "#!/usr/bin/env bash\nexit 0\n");
  fs.chmodSync(claudeBin, 0o755);
  for (let i = 0; i < 3; i += 1) {
    fs.mkdirSync(path.dirname(cardPostMarker(home, id)), { recursive: true });
    fs.writeFileSync(cardPostMarker(home, id), "x");
    tick({ home, spawnSupervisor: noSpawn });
    await execJob(id, { home, claudeBin: fakeBgClaude(home, claudeBin) });
    assert.ok(!fs.existsSync(cardPostMarker(home, id)), "marker cleared for the retry");
  }
  const item = store.getItem(id);
  assert.equal(item.status, "review");
  assert.match(item.job.notice, /after 3 tries/);
});

// ---------- guard ----------

function guardCtx(home, id) {
  return makeContext(home, id);
}

const post = (input) => ({
  tool_name: "mcp__claude_ai_Slack__slack_send_message",
  tool_input: input,
});

test("guard: a session posts its card once, top-level, only while it has no card", () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  const first = guardDecide(post({ channel_id: SELF_DM, message: "🤖 card" }), guardCtx(home, id));
  assert.equal(first.decision, "allow", first.reason);
  const second = guardDecide(post({ channel_id: SELF_DM, message: "🤖 card again" }), guardCtx(home, id));
  assert.equal(second.decision, "deny");
  const elsewhere = guardDecide(post({ channel_id: "C123", message: "hi" }), guardCtx(makeHome().home, id));
  assert.equal(elsewhere.decision, "deny");
  const inThread = guardDecide(post({ channel_id: SELF_DM, thread_ts: "1.1", message: "x" }), guardCtx(makeHome().home, id));
  assert.equal(inThread.decision, "deny", "no card yet, so no thread to post in");

  withCard(store, id, "500.000100");
  const topLevel = guardDecide(post({ channel_id: SELF_DM, message: "🤖 card" }), guardCtx(home, id));
  assert.equal(topLevel.decision, "deny");
  const reply = guardDecide(post({ channel_id: SELF_DM, thread_ts: "500.000100", message: "🤖 AQ" }), guardCtx(home, id));
  assert.equal(reply.decision, "allow");
});

test("guard: a session may change only its own item through aq.mjs", () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  const other = addItem(store);
  const aq = path.resolve(import.meta.dirname, "..", "scripts", "aq.mjs");
  const cwd = path.join(home, "jobs", id, "work");
  const bash = (command) => guardDecide({ tool_name: "Bash", tool_input: { command }, cwd }, guardCtx(home, id));
  assert.equal(bash(`node ${aq} update ${id} --status approving`).decision, "allow");
  assert.equal(bash(`node ${aq} get ${other}`).decision, "allow");
  assert.equal(bash(`node ${aq} update ${other} --status skipped`).decision, "deny");
  assert.equal(bash(`node ${aq} add --file ${cwd}/c.json`).decision, "deny");
  assert.equal(bash(`node ${aq} config set slack.selfDmId X`).decision, "deny");
  assert.equal(bash(`node ${aq} update ${id} && rm -rf x`).decision, "deny");
});

test("guard: sessions write memory notes but not their own settings", () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  const cwd = path.join(home, "jobs", id, "work");
  const write = (file_path) => guardDecide({ tool_name: "Write", tool_input: { file_path }, cwd }, guardCtx(home, id));
  assert.equal(write(path.join(home, "memory", "people.md")).decision, "allow");
  assert.equal(write(path.join(home, "memory", "x", "y.md")).decision, "deny");
  assert.equal(write(settingsFile(home, id)).decision, "deny");
  assert.equal(write(path.join(home, "items", `${id}.json`)).decision, "deny");
});

test("dispatch: a closed card keeps its session for 48 hours, then a reopen starts fresh", () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id);
  updateItem(store, id, { patch: { job: { sessionId: "S1", sessionStarted: true } }, internal: true });
  setStatus(store, id, "skipped");
  const soon = tick({ home, spawnSupervisor: noSpawn, clock: () => new Date(Date.now() + 47 * 3600 * 1000) });
  assert.deepEqual(soon.expired, []);
  const later = tick({ home, spawnSupervisor: noSpawn, clock: () => new Date(Date.now() + 49 * 3600 * 1000) });
  assert.deepEqual(later.expired, [id]);
  const item = store.getItem(id);
  assert.equal(item.job.sessionId, null);
  assert.equal(item.job.previousSessionId, "S1");
});

test("modelIn: the last model named in a reply, whole words only", () => {
  assert.equal(modelIn("go opus"), "opus");
  assert.equal(modelIn("Sonnet: make it shorter"), "sonnet");
  assert.equal(modelIn("try haiku, no wait, opus"), "opus");
  assert.equal(modelIn("make it shorter"), null);
  assert.equal(modelIn("magnum opuses"), null);
});

test("route: a model name in a reply switches the card's model; dispatch uses it", async () => {
  const { home, store } = makeHome();
  const id = addItem(store);
  setStatus(store, id, "asking");
  withCard(store, id);
  routeToCard(store, id, { messages: [{ ts: "600.1", text: "ok, use haiku for this" }] });
  assert.equal(store.getItem(id).job.model, "haiku");
  assert.equal(runLimits({ cardModel: "sonnet", model: "opus" }, "card", store.getItem(id).job).model, "haiku");
  assert.equal(runLimits({ cardModel: "sonnet", model: "opus" }, "work", {}).model, "opus");

  const claudeBin = fakeClaude(home);
  tick({ home, spawnSupervisor: noSpawn });
  await execJob(id, { home, claudeBin });
  routeToCard(store, id, { messages: [{ ts: "601.1", text: "shorter" }] });
  assert.equal(store.getItem(id).job.model, "haiku", "it sticks");
  tick({ home, spawnSupervisor: noSpawn });
  await execJob(id, { home, claudeBin });
  routeToCard(store, id, { messages: [{ ts: "602.1", text: "opus please" }] });
  tick({ home, spawnSupervisor: noSpawn });
  await execJob(id, { home, claudeBin });

  const [first, second, third] = runsOf(home);
  assert.equal(first[first.indexOf("--model") + 1], "haiku");
  assert.ok(!second.includes("--model"), "same model: resumed with its saved options");
  assert.equal(third[third.indexOf("--model") + 1], "opus", "new model: started with new options");
  assert.ok(third.join("\n").includes("This run uses opus"));
  assert.ok(third.join("\n").includes('react "eyes"'));
});
