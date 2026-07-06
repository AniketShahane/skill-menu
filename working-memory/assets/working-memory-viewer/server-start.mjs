import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.PORT ||= "3020";
process.env.HOSTNAME ||= process.env.WORKING_MEMORY_STUDIO_HOST || "127.0.0.1";

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

const appDir = path.dirname(fileURLToPath(import.meta.url));
const buildStaticDir = path.join(appDir, ".next", "static");
const standaloneStaticDir = path.join(appDir, ".next", "standalone", ".next", "static");

if (fs.existsSync(buildStaticDir)) {
  fs.rmSync(standaloneStaticDir, { force: true, recursive: true });
  fs.cpSync(buildStaticDir, standaloneStaticDir, { recursive: true });
}

await import("./.next/standalone/server.js");
