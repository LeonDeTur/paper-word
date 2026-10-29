import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { releaseNotes } from "./release.mjs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/release-pr.md",
  `Paperword **${version}** is prepared from Conventional Commits.\n\nReview the release notes and compatibility. Merging this PR and passing CI publishes a tag and GitHub Release with a runtime archive and SHA-256 checksum. This does not publish an npm package or deploy to a VPS.\n\n${notes}\n`,
);
