import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version))
  throw new Error("package.json must contain a stable SemVer version.");
if (pkg.version !== lock.version || pkg.version !== lock.packages[""].version)
  throw new Error("package.json and package-lock.json versions differ.");
const pinned = readFileSync(".node-version", "utf8").trim();
if (pinned !== readFileSync(".nvmrc", "utf8").trim())
  throw new Error("Node version files differ.");
if (pkg.engines.node !== `>=${pinned}`)
  throw new Error("Node minimum must match .node-version.");
console.log(
  `Paperword ${pkg.version}; minimum Node ${pinned}; package versions match.`,
);
