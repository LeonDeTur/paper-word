import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
const group = process.argv[2] || "all";
const unit = ["tests/content.test.ts", "tests/scheduler.test.ts"];
const integration = readdirSync("tests")
  .filter((name) => name.endsWith(".test.ts"))
  .map((name) => `tests/${name}`)
  .filter((name) => !unit.includes(name));
const tooling = readdirSync("tests/tooling")
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => `tests/tooling/${name}`);
const groups = {
  unit,
  integration,
  tooling,
  all: [...unit, ...integration, ...tooling],
};
if (!Object.hasOwn(groups, group))
  throw new Error("Choose all, unit, integration or tooling.");
const args = ["--import", "tsx", "--test"];
if (process.argv.includes("--coverage")) {
  mkdirSync("coverage", { recursive: true });
  args.push(
    "--experimental-test-coverage",
    "--test-coverage-include=server/**",
    "--test-coverage-include=scripts/**",
    "--test-coverage-include=src/token-expiry.ts",
    "--test-coverage-include=src/agent-scopes.ts",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=lcov",
    "--test-reporter-destination=coverage/lcov.info",
  );
}
const result = spawnSync(process.execPath, [...args, ...groups[group]], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
