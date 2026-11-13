import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = mkdtempSync(join(tmpdir(), "floodvisor-route-tests-"));
try {
  const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", 
    "--target", "ES2020", "--module", "commonjs", "--moduleResolution", "node",
    "--esModuleInterop", "--skipLibCheck", "--outDir", output,
    "tests/route-planner.test.ts",
  ], { cwd: root, stdio: "inherit" });
  if (compile.status !== 0) process.exit(compile.status ?? 1);
  const run = spawnSync(process.execPath, ["--test", join(output, "tests", "route-planner.test.js")], { stdio: "inherit" });
  process.exit(run.status ?? 1);
} finally {
  rmSync(output, { recursive: true, force: true });
}
