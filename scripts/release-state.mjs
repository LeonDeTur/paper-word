import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { releaseNotes } from "./release.mjs";

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${pkg.version}`;
let previous;
try {
  previous = JSON.parse(git("show", "HEAD^:package.json")).version;
} catch {
  previous = pkg.version;
}
let tagged;
try {
  tagged = git("rev-parse", `${tag}^{commit}`);
} catch {
  tagged = "";
}
const head = git("rev-parse", "HEAD");
const changed = previous !== pkg.version;
if (changed) {
  const next = pkg.version.split(".").map(BigInt),
    old = previous.split(".").map(BigInt);
  if (
    !next.some(
      (part, index) =>
        part > old[index] &&
        next.slice(0, index).every((value, i) => value === old[i]),
    )
  )
    throw new Error("A published release version must increase.");
}
if (changed && tagged && tagged !== head)
  throw new Error(
    `${tag} already identifies another commit. Release tags must never move.`,
  );
const publish = changed;
let prepare = false;
if (!publish) {
  const base = git("describe", "--tags", "--match", "v[0-9]*", "--abbrev=0");
  if (base !== tag)
    throw new Error(
      `Version ${pkg.version} has no published baseline tag. Finish its release before preparing another.`,
    );
  prepare = head === git("rev-parse", "origin/main");
}
if (publish) releaseNotes(readFileSync("CHANGELOG.md", "utf8"), pkg.version);
if (process.env.GITHUB_OUTPUT)
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `publish=${publish}\nprepare=${prepare}\nversion=${pkg.version}\n`,
  );
console.log(JSON.stringify({ publish, prepare, version: pkg.version, head }));
