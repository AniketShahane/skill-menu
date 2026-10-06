// Render QA stills: the settled frame of each narrated beat (just before the next beat starts).
// usage: node ../tools/stills.mjs <chapterKey> [--at=frame,frame] [--scale=0.5]
import {bundle} from "@remotion/bundler";
import {renderStill, selectComposition} from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const keys = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const at = (process.argv.find((a) => a.startsWith("--at=")) || "").slice(5);
const scale = Number((process.argv.find((a) => a.startsWith("--scale=")) || "--scale=0.5").slice(8));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const timing = JSON.parse(fs.readFileSync(path.join(root, "video/src/timing.json"), "utf8"));
const K = JSON.parse(fs.readFileSync(path.join(root, "video/src/constants.json"), "utf8"));
const serveUrl = await bundle({entryPoint: path.join(root, "video/src/index.ts"), publicDir: path.join(root, "video/public")});
for (const key of keys) {
const ch = timing.find((c) => c.key === key);
const f = (s) => Math.round(s * K.fps);
let t = (ch.title ? f(K.card) : 0) + f(K.lead);
const shots = [];
if (ch.title) shots.push({id: "card", frame: Math.round(f(K.card) * 0.6), text: ch.title});
for (const b of ch.beats) {
  const s = t, d = f(b.dur);
  t = s + d + f(b.pad ?? K.gap);
  shots.push({id: b.id, frame: Math.max(s, t - 2), text: b.t});
}
const list = at ? at.split(",").map((x) => ({id: `f${x}`, frame: Number(x), text: ""})) : shots;
const out = path.join(root, "qa", key);
fs.mkdirSync(out, {recursive: true});
const comp = await selectComposition({serveUrl, id: `ch-${key}`});
for (const s of list) {
  await renderStill({serveUrl, composition: comp, frame: Math.min(s.frame, comp.durationInFrames - 1), output: path.join(out, `${s.id}.png`), scale});
}
fs.writeFileSync(path.join(out, "shots.json"), JSON.stringify(list, null, 1));
console.log(`rendered ${list.length} stills -> qa/${key}`);
}
