// Render chapters to out/parts/<key>.<q>.mp4 (silent; the soundtrack is muxed by tools/assemble.py).
// usage: node scripts/render.mjs <l|h> [chapterKey ...]     l = 960x540 preview, h = 1920x1080 final
import {bundle} from "@remotion/bundler";
import {renderMedia, selectComposition} from "@remotion/renderer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const q = process.argv[2] || "l";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const timing = JSON.parse(fs.readFileSync(path.join(root, "video/src/timing.json"), "utf8"));
const keys = process.argv.slice(3).length ? process.argv.slice(3) : timing.map((c) => c.key);
const outDir = path.join(root, "out/parts");
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.join(root, "video/src/index.ts"), publicDir: path.join(root, "video/public")});
for (const key of keys) {
  const t0 = Date.now();
  const composition = await selectComposition({serveUrl, id: `ch-${key}`});
  const out = path.join(outDir, `${key}.${q}.mp4`);
  await renderMedia({serveUrl, composition, codec: "h264", outputLocation: out, muted: true, scale: q === "h" ? 1 : 0.5,
    crf: q === "h" ? 16 : 23, concurrency: Math.max(2, os.cpus().length - 2),
    // Measured on 300 heavy frames (M-series, 2026-10): png + x264 slow CRF14 = 4.2 fps; jpeg95 + x264 fast CRF16 =
    // 11.7 fps (2.8x) at SSIM 0.993 / PSNR 49 dB vs the png render, i.e. visually identical. VideoToolbox was slower here.
    imageFormat: "jpeg", jpegQuality: q === "h" ? 95 : 80, x264Preset: q === "h" ? "fast" : "veryfast"});
  console.log(`  ok ${key} (${composition.durationInFrames} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
