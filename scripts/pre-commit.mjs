import { execFileSync, spawnSync } from "node:child_process";
import { checkPublicFiles } from "./repository-policy.mjs";
const staged = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
if (!staged.length) process.exit(0);
checkPublicFiles(staged);
const checked = staged.filter(
  (file) =>
    /\.(?:[cm]?js|tsx?|json|css|md|ya?ml)$/.test(file) &&
    file !== "package-lock.json",
);
if (checked.length) {
  const prettier = await import("prettier");
  for (const file of checked) {
    const source = execFileSync("git", ["show", `:${file}`], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    const config = await prettier.resolveConfig(file);
    if (!(await prettier.check(source, { ...config, filepath: file })))
      throw new Error(
        `Format staged changes in ${file} with npm run format, then stage them again.`,
      );
  }
}
const result = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
