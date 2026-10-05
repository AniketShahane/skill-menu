// 300-frame render benchmark: which settings make our composition faster without losing crispness?
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import os from "node:os";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const serveUrl = await bundle({entryPoint: path.join(root, "video/src/index.ts"), publicDir: path.join(root, "video/public")});
const composition = await selectComposition({serveUrl, id: "ch-humours"});
const range = [1700, 1999]; // compass + roundels: our heaviest kind of frame
const cpus = os.cpus().length;
const runs = process.argv[2] === "one" ? [{name: "jpeg95 + x264 fast crf16 (no dust blur)", o: {imageFormat: "jpeg", jpegQuality: 95, x264Preset: "fast", crf: 16, concurrency: cpus - 2}}] : [
  {name: "current: png + x264 slow crf14", o: {imageFormat: "png", x264Preset: "slow", crf: 14, concurrency: cpus - 2}},
  {name: "jpeg95 + x264 fast crf16", o: {imageFormat: "jpeg", jpegQuality: 95, x264Preset: "fast", crf: 16, concurrency: cpus - 2}},
  {name: "jpeg95 + videotoolbox 12M", o: {imageFormat: "jpeg", jpegQuality: 95, hardwareAcceleration: "if-possible", videoBitrate: "12M", concurrency: cpus - 2}},
  {name: "jpeg95 + videotoolbox 12M, half threads", o: {imageFormat: "jpeg", jpegQuality: 95, hardwareAcceleration: "if-possible", videoBitrate: "12M", concurrency: Math.round(cpus / 2)}},
];
for (const r of runs) {
  const t = Date.now();
  const out = path.join(root, `qa/bench_${runs.indexOf(r)}.mp4`);
  await renderMedia({serveUrl, composition, codec: "h264", outputLocation: out, muted: true, frameRange: range, ...r.o});
  const s = (Date.now() - t) / 1000;
  console.log(`${r.name.padEnd(42)} ${s.toFixed(1)}s  ${(300 / s).toFixed(1)} fps`);
}
