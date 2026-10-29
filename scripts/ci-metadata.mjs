import { execFileSync, spawnSync } from "node:child_process";
if (process.env.PR_TITLE) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/@commitlint/cli/cli.js"],
    { input: process.env.PR_TITLE, stdio: ["pipe", "inherit", "inherit"] },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const branch = process.env.PR_BRANCH || "";
if (
  branch &&
  !/^(?:feat|fix|docs|chore|ci|build|test|refactor|perf|revert|dependabot)\/[a-z0-9][a-z0-9./_-]*$/.test(
    branch,
  )
)
  throw new Error(
    "Use a Conventional Commit branch prefix, e.g. feat/reader, fix/import, ci/checks.",
  );
const message = execFileSync("git", ["log", "-1", "--format=%B"], {
  encoding: "utf8",
});
if (process.env.PR_BASE_SHA || process.env.PR_HEAD_SHA) {
  if (
    ![process.env.PR_BASE_SHA, process.env.PR_HEAD_SHA].every((sha) =>
      /^[a-f0-9]{40}$/.test(sha || ""),
    )
  )
    throw new Error("Invalid PR revision metadata.");
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@commitlint/cli/cli.js",
      "--from",
      process.env.PR_BASE_SHA,
      "--to",
      process.env.PR_HEAD_SHA,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!process.env.PR_TITLE) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/@commitlint/cli/cli.js"],
    { input: message, stdio: ["pipe", "inherit", "inherit"] },
  );
  process.exitCode = result.status ?? 1;
}
