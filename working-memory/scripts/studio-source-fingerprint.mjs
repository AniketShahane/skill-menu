import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];

if (!root) {
  console.error("Usage: studio-source-fingerprint.mjs <studio-source-dir>");
  process.exit(1);
}

const skippedDirectories = new Set([".git", ".next", "coverage", "node_modules"]);
const skippedFiles = new Set(["tsconfig.tsbuildinfo"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      files.push(...walk(path.join(dir, entry.name)));
      continue;
    }

    if (!entry.isFile()) continue;
    if (skippedFiles.has(entry.name)) continue;
    if (entry.name.endsWith(".log") || entry.name.endsWith(".env")) continue;
    files.push(path.join(dir, entry.name));
  }

  return files;
}

const hash = crypto.createHash("sha256");
for (const file of walk(root).sort()) {
  const relativePath = path.relative(root, file);
  hash.update(relativePath);
  hash.update("\0");
  hash.update(fs.readFileSync(file));
  hash.update("\0");
}

console.log(hash.digest("hex"));
