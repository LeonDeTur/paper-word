import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export function privatePath(file) {
  return (
    /(?:^|\/)paperword-data.*\.tar\.gz$/.test(file) ||
    /^paperword-\d{4}-\d{2}-\d{2}\.json$/.test(file) ||
    /^(?:data|artifacts|coverage|release-assets|node_modules|\.ssh|\.aws|secrets)\//.test(
      file,
    ) ||
    (/(?:^|\/)\.env(?:\.|$)/.test(file) &&
      ![".env.example", ".env.vps.example"].includes(file)) ||
    /(?:^|\/)(?:id_rsa|id_ed25519)$/.test(file) ||
    /\.(?:sqlite|db|pem|key|p12|pfx|bundle)(?:-|$)/.test(file)
  );
}
export function containsSecret(source) {
  return (
    /\b(?:pw|pwo|pwr)_[A-Za-z0-9_-]{43}\b/.test(source) ||
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(source) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)
  );
}
export function checkPublicFiles(files) {
  for (const file of files) {
    if (privatePath(file))
      throw new Error(`Private/generated file cannot be committed: ${file}`);
    if (/\.(?:png|jpe?g|pdf|woff2?)$/.test(file)) continue;
    const source = execFileSync("git", ["show", `:${file}`], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (containsSecret(source))
      throw new Error(
        `Possible credential in ${file}; remove it and rotate it before publication. Secret values are never logged.`,
      );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  checkPublicFiles(files);
  console.log(
    `Checked ${files.length} tracked files for private paths and known credential patterns. This does not replace GitHub secret scanning.`,
  );
}
