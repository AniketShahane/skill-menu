import fs from "node:fs";

const packageJsonPath = process.argv[2];

if (!packageJsonPath) {
  console.error("Usage: validate-studio-package.mjs <package.json>");
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

if (packageJson.name !== "working-memory-viewer") {
  console.error(`Unexpected package name: ${packageJson.name}`);
  process.exit(1);
}

for (const scriptName of ["dev", "build", "start", "typecheck", "test"]) {
  if (!packageJson.scripts?.[scriptName]) {
    console.error(`Missing package script: ${scriptName}`);
    process.exit(1);
  }
}
