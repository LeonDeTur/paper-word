import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const run = (cmd, args) =>
  execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
const git = (...args) => run("git", args);
const npm = (...args) =>
  run(process.execPath, [process.env.npm_execpath, ...args]);
try {
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const arg = process.argv[2];
  const parts = current.split(".").map(Number);
  const targets = {
    patch: `${parts[0]}.${parts[1]}.${parts[2] + 1}`,
    minor: `${parts[0]}.${parts[1] + 1}.0`,
    major: `${parts[0] + 1}.0.0`,
  };
  const target = targets[arg] || arg;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(target || ""))
    throw Error(
      "Usage: npm run release -- patch|minor|major|X.Y.Z [--dry-run]",
    );
  const next = target.split(".").map(Number);
  if (
    !next.some(
      (n, i) =>
        n > parts[i] && next.slice(0, i).every((v, j) => v === parts[j]),
    )
  )
    throw Error("The release must be newer than " + current);
  git("rev-parse", "--verify", "HEAD");
  if (git("status", "--porcelain"))
    throw Error("Commit your changes first; the working tree must be clean.");
  if (git("tag", "--list", `v${target}`))
    throw Error("This release tag already exists.");
  if (!readFileSync("CHANGELOG.md", "utf8").includes(`## [${target}] - `))
    throw Error(
      `Add and commit a dated CHANGELOG.md entry for ${target} first.`,
    );
  console.log(
    `Release ${current} → ${target}; run checks, commit package files and create annotated tag v${target}. No push.`,
  );
  if (!process.argv.includes("--dry-run")) {
    npm("version", target, "--no-git-tag-version", "--ignore-scripts");
    console.log(npm("run", "check"));
    git("add", "--", "package.json", "package-lock.json");
    git("commit", "-m", `chore(release): ${target}`);
    git("tag", "-a", `v${target}`, "-m", `Paperword ${target}`);
    console.log(`Created v${target}. Review before pushing.`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
