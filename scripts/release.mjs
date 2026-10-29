import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import commitAndTagVersion from "commit-and-tag-version";

export function releaseNotes(changelog, version) {
  const escaped = version.replaceAll(".", "\\.");
  const match = changelog.match(
    new RegExp(
      `^##? \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=^##? \\[|$(?![\\s\\S]))`,
      "m",
    ),
  );
  if (!match)
    throw new Error(`CHANGELOG.md has no release section for ${version}.`);
  return match[1].trim();
}
export async function prepareRelease({ dryRun = false, target } = {}) {
  const git = (...args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
  if (git("status", "--porcelain"))
    throw new Error(
      "Commit changes first; release preparation requires a clean worktree.",
    );
  const current = JSON.parse(readFileSync("package.json", "utf8")).version;
  const base = git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0");
  if (base !== `v${current}`)
    throw new Error(
      `Current package version ${current} must match latest release tag ${base}. Fetch tags or publish the pending release first.`,
    );
  const commits = git("log", `${base}..HEAD`, "--format=%B%x00");
  if (!commits) {
    console.log("No changes since the last release.");
    return { changed: false };
  }
  if (
    target &&
    !/^(?:patch|minor|major|(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.test(
      target,
    )
  )
    throw new Error("Use patch, minor, major or X.Y.Z.");
  if (target?.includes(".")) {
    const next = target.split(".").map(BigInt),
      previous = current.split(".").map(BigInt);
    if (
      !next.some(
        (part, index) =>
          part > previous[index] &&
          next.slice(0, index).every((value, i) => value === previous[i]),
      )
    )
      throw new Error("Release version must increase.");
  }
  const config = JSON.parse(readFileSync(".versionrc.json", "utf8"));
  const preMajorFeature =
    current.startsWith("0.") &&
    /^(?:feat(?:\([^\n)]+\))?!?:|[a-z]+(?:\([^\n)]+\))?!:|BREAKING[ -]CHANGE:)/m.test(
      commits,
    );
  const original = readFileSync("CHANGELOG.md", "utf8");
  const originalPackage = readFileSync("package.json", "utf8");
  const originalLock = readFileSync("package-lock.json", "utf8");
  const unreleased = original.match(
    /^## \[Unreleased\][^\n]*\n([\s\S]*?)(?=^## \[|$(?![\s\S]))/m,
  );
  if (!dryRun && unreleased)
    writeFileSync("CHANGELOG.md", original.replace(unreleased[0], ""));
  try {
    await commitAndTagVersion({
      ...config,
      skip: { commit: true, tag: true },
      dryRun,
      ...(target || preMajorFeature ? { releaseAs: target || "minor" } : {}),
    });
    if (dryRun) return { changed: true };
    const version = JSON.parse(readFileSync("package.json", "utf8")).version;
    if (version === current) {
      writeFileSync("CHANGELOG.md", original);
      return { changed: false };
    }
    let changelog = readFileSync("CHANGELOG.md", "utf8");
    if (unreleased?.[1].trim()) {
      const heading = new RegExp(
        `(^##? \\[${version.replaceAll(".", "\\.")}\\][^\\n]*\\n)`,
        "m",
      );
      changelog = changelog.replace(
        heading,
        `$1\n### Дополнительные сведения\n\n${unreleased[1].trim()}\n\n`,
      );
    }
    const prettier = await import("prettier");
    for (const file of ["package.json", "CHANGELOG.md"]) {
      const source =
        file === "CHANGELOG.md" ? changelog : readFileSync(file, "utf8");
      writeFileSync(file, await prettier.format(source, { filepath: file }));
    }
    const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${version}\nchanged=true\n`,
      );
    console.log(
      `Prepared ${version}; review package files and CHANGELOG.md. No commit, tag, push or publication was performed.`,
    );
    return { changed: true, version, notes };
  } catch (error) {
    if (!dryRun) {
      writeFileSync("CHANGELOG.md", original);
      writeFileSync("package.json", originalPackage);
      writeFileSync("package-lock.json", originalLock);
    }
    throw error;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await prepareRelease({
      dryRun: process.argv.includes("--dry-run"),
      target: process.argv.slice(2).find((arg) => !arg.startsWith("--")),
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
