import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addCandidate, createStore, updateItem } from "../scripts/aq.mjs";

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
