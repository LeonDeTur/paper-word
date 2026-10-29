import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
const script = resolve("scripts/package-release.mjs");
test("runtime archive includes only distributable files, has a correct checksum and refuses private data", () => {
  const cwd = mkdtempSync(join(tmpdir(), "paperword-package-"));
  try {
    for (const dir of ["build", "dist", "docs", "data"])
      mkdirSync(join(cwd, dir));
    writeFileSync(join(cwd, "package.json"), '{"version":"0.3.0"}');
    for (const file of [
      "package-lock.json",
      "LICENSE",
      "NOTICE",
      "README.md",
      "CHANGELOG.md",
      ".env.example",
      ".env.vps.example",
      "build/server.mjs",
      "dist/index.html",
      "docs/run.md",
      "data/private.sqlite",
      ".env",
    ])
      writeFileSync(join(cwd, file), "fixture");
    const result = spawnSync(process.execPath, [script], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const archive = join(cwd, "release-assets", "paperword-v0.3.0.tar.gz");
    const entries = execFileSync("tar", ["-tzf", basename(archive)], {
      cwd: dirname(archive),
      encoding: "utf8",
    });
    assert.match(entries, /build\/server\.mjs/);
    assert.ok(!entries.includes("private.sqlite"));
    assert.ok(!entries.split("\n").some((file) => file === "./.env"));
    const expected = createHash("sha256")
      .update(readFileSync(archive))
      .digest("hex");
    assert.equal(
      readFileSync(join(cwd, "release-assets", "SHA256SUMS"), "utf8").split(
        " ",
      )[0],
      expected,
    );
    writeFileSync(join(cwd, "build", ".env"), "private configuration");
    const refused = spawnSync(process.execPath, [script], {
      cwd,
      encoding: "utf8",
    });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /Private data/);
    assert.equal(
      createHash("sha256").update(readFileSync(archive)).digest("hex"),
      expected,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
