import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  privatePath,
  containsSecret,
  containsCyrillic,
  checkPublicFiles,
} from "../../scripts/repository-policy.mjs";
import commitlint from "../../commitlint.config.mjs";

test("language guard detects Cyrillic across Unicode blocks and permits English and escaped fixtures", () => {
  for (const text of ["\u042f", "\u0451", "\u052f", "\u1c80", "\ua640"])
    assert.ok(containsCyrillic(text));
  for (const text of ["English → Russian", "\\u042f", "François", "© 2026"])
    assert.ok(!containsCyrillic(text));
  const rule = commitlint.plugins[0].rules["english-only"];
  assert.ok(rule({ header: "docs: add English instructions" })[0]);
  assert.ok(!rule({ header: "docs: update", body: "\u042f" })[0]);
});

test("publication guard inspects staged bytes and names rather than unstaged replacements", () => {
  const directory = mkdtempSync(join(tmpdir(), "paperword-policy-"));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    execFileSync("git", ["init", "-q"]);
    writeFileSync("fixture.txt", "\u042f");
    execFileSync("git", ["add", "fixture.txt"]);
    writeFileSync("fixture.txt", "English working copy");
    assert.throws(() => checkPublicFiles(["fixture.txt"]), /Cyrillic/);
    execFileSync("git", ["add", "fixture.txt"]);
    assert.doesNotThrow(() => checkPublicFiles(["fixture.txt"]));
    const filename = "\u042f.txt";
    writeFileSync(filename, "English");
    execFileSync("git", ["add", filename]);
    assert.throws(() => checkPublicFiles([filename]), /file names/);
    writeFileSync("fixture.txt", Buffer.from([0xff, 0xfe, 0x2f, 0x04]));
    execFileSync("git", ["add", "fixture.txt"]);
    assert.throws(() => checkPublicFiles(["fixture.txt"]), /valid UTF-8/);
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});
test("publication guard rejects private files and allows only the two public environment examples", () => {
  for (const path of [
    ".env",
    ".env.vps.local",
    "server/.env.example",
    "data/library.sqlite",
    "backup.sqlite-wal",
    "artifacts/qa.png",
    ".ssh/id_rsa",
    "keys/private.pem",
    "history.bundle",
  ])
    assert.ok(privatePath(path), path);
  for (const path of [
    ".env.example",
    ".env.vps.example",
    "docs/versioning.md",
    "server/app.ts",
  ])
    assert.ok(!privatePath(path), path);
});
test("credential guard detects live-shaped tokens without logging or storing a usable credential", () => {
  assert.ok(containsSecret("pw_" + "a".repeat(43)));
  assert.ok(containsSecret("sk-proj-" + "b".repeat(30)));
  assert.ok(
    containsSecret(["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ")),
  );
  assert.ok(!containsSecret("Authorization: Bearer YOUR_AGENT_TOKEN"));
});
