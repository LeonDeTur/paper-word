import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { releaseNotes } from "./release.mjs";

if (!process.env.CI || process.env.GITHUB_REF !== "refs/heads/main")
  throw new Error(
    "Publication runs only in CI on main after the required checks.",
  );
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const tag = `v${version}`;
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (head !== process.env.GITHUB_SHA)
  throw new Error("Checked-out commit differs from the commit verified by CI.");
const gh = (...args) =>
  execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
const files = [
  `release-assets/paperword-v${version}.tar.gz`,
  "release-assets/SHA256SUMS",
];
for (const file of files) readFileSync(file);
mkdirSync(".cache", { recursive: true });
const notes = ".cache/release-notes.md";
writeFileSync(
  notes,
  releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version),
);
// A failed API/auth call is fatal; only a confirmed missing tag permits creation.
const releases = JSON.parse(
  gh("release", "list", "--limit", "100", "--json", "tagName,isDraft"),
);
const existing = releases.find((release) => release.tagName === tag);
if (existing && !existing.isDraft) {
  const details = JSON.parse(gh("release", "view", tag, "--json", "assets"));
  if (
    !files.every((file) =>
      details.assets.some((asset) => asset.name === file.split("/").pop()),
    )
  )
    throw new Error(
      "Published release is missing assets. Review manually; published assets are not overwritten.",
    );
  console.log(`${tag} is already published; leaving its assets unchanged.`);
} else {
  if (existing) {
    const details = JSON.parse(
      gh("release", "view", tag, "--json", "targetCommitish"),
    );
    if (details.targetCommitish !== head)
      throw new Error(
        "Existing draft targets another revision. Refusing to publish it.",
      );
  }
  if (!existing)
    gh(
      "release",
      "create",
      tag,
      "--target",
      head,
      "--title",
      `Paperword ${version}`,
      "--notes-file",
      notes,
      "--draft",
    );
  gh("release", "upload", tag, ...files, "--clobber");
  gh("release", "edit", tag, "--draft=false");
  console.log(`Published ${tag} from tested commit ${head}.`);
}
