import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Invalid release version.");
const output = resolve("release-assets");
mkdirSync(output, { recursive: true });
const stage = mkdtempSync(join(output, "stage-"));
const files = [
  "build",
  "dist",
  "package.json",
  "package-lock.json",
  "LICENSE",
  "NOTICE",
  "README.md",
  "CHANGELOG.md",
  ".env.example",
  ".env.vps.example",
  "docs",
];
function validate(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink())
    throw new Error(`Symlinks are not allowed in releases: ${path}`);
  if (stat.isDirectory())
    for (const name of readdirSync(path)) validate(join(path, name));
  else if (
    /\.(?:sqlite|db|pem|key|p12|pfx|bundle)(?:-|$)/.test(path) ||
    (/(?:^|[\\/])\.env(?:$|\.)/.test(path) &&
      !/\.env\.(?:example|vps\.example)$/.test(path))
  )
    throw new Error(`Private data cannot enter release assets: ${path}`);
}
try {
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Build first: ${file} is missing.`);
    validate(file);
    cpSync(file, join(stage, file), { recursive: true });
  }
  const filename = `paperword-v${version}.tar.gz`,
    archive = join(output, filename);
  execFileSync("tar", ["-czf", archive, "-C", stage, "."], {
    stdio: "inherit",
  });
  const hash = createHash("sha256").update(readFileSync(archive)).digest("hex");
  writeFileSync(join(output, "SHA256SUMS"), `${hash}  ${filename}\n`);
  console.log(
    `Packaged ${filename} and SHA256SUMS; no user database or secrets included.`,
  );
} finally {
  rmSync(stage, { recursive: true, force: true });
}
