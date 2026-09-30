import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const destination = await fs.mkdtemp(path.join(os.tmpdir(), "selvedge-clean-"));
if (!path.resolve(destination).startsWith(path.resolve(os.tmpdir()) + path.sep))
  throw new Error("Unexpected clean-install destination");
const entries = [
  "src",
  "public",
  "tests",
  "scripts",
  ".github",
  "docs",
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "playwright.config.ts",
  "eslint.config.js",
  "AGENTS.md",
  "LICENSE",
  "README.md",
  ".gitignore",
];
for (const entry of entries)
  await fs.cp(entry, path.join(destination, entry), { recursive: true });
const npm = process.env.SELVEDGE_NPM_CLI || process.env.npm_execpath;
if (!npm)
  throw new Error("Set SELVEDGE_NPM_CLI to the installed npm CLI script.");
const checks = [
  ["ci", "--ignore-scripts"],
  ["run", "lint"],
  ["run", "typecheck"],
  ["test"],
  ["run", "build"],
  ["audit", "--audit-level=high"],
];
for (const args of checks) {
  const r = spawnSync(process.execPath, [npm, ...args], {
    cwd: destination,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8_000_000,
  });
  if (r.status !== 0) {
    console.log((r.stdout || "") + (r.stderr || ""));
    throw new Error("Clean install failed: " + args.join(" "));
  }
  console.log("PASS clean " + args.join(" "));
}
await fs.mkdir(".private", { recursive: true });
await fs.writeFile(
  ".private/fresh-install.json",
  JSON.stringify(
    { destination, checks: checks.map((x) => x.join(" ")), passed: true },
    null,
    2,
  ),
);
console.log(JSON.stringify({ destination, passed: true }));
