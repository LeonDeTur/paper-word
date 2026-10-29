import test from "node:test";
import assert from "node:assert/strict";
import {
  privatePath,
  containsSecret,
} from "../../scripts/repository-policy.mjs";
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
