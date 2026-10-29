import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { releaseNotes } from "./release.mjs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const notes = releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version);
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/release-pr.md",
  `Подготовлен Paperword **${version}** на основе Conventional Commits.\n\nПроверьте описание и совместимость. После слияния этого PR и успешного CI автоматически появятся тег и GitHub Release с архивом и SHA-256. npm-пакет и VPS не публикуются.\n\n${notes}\n`,
);
