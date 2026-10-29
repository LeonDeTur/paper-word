import { spawnSync, execFileSync } from "node:child_process";
if (!process.env.CI) {
  const result = spawnSync(
    "git",
    ["config", "--local", "--get", "core.hooksPath"],
    { encoding: "utf8" },
  );
  if (result.error || ![0, 1].includes(result.status))
    throw new Error("Run inside the Git repository.");
  const current = result.stdout.trim();
  if (current && current !== ".githooks")
    throw new Error(
      `Existing core.hooksPath=${current}. Keep it or explicitly change it to .githooks.`,
    );
  execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"], {
    stdio: "inherit",
  });
  console.log("Installed pre-commit, commit-msg and pre-push hooks.");
}
