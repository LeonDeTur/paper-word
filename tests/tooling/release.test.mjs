import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { releaseNotes } from "../../scripts/release.mjs";

const root = resolve(".");
function fixture(change) {
  const cwd = mkdtempSync(join(tmpdir(), "paperword-release-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.name", "Release fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("remote", "add", "origin", "https://github.com/example/paperword.git");
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "paperword", version: "0.2.0", private: true }),
  );
  writeFileSync(
    join(cwd, "package-lock.json"),
    JSON.stringify({
      name: "paperword",
      version: "0.2.0",
      lockfileVersion: 3,
      packages: { "": { name: "paperword", version: "0.2.0" } },
    }),
  );
  writeFileSync(
    join(cwd, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Manual note.\n\n## [0.2.0] - 2026-10-25\n\nInitial release.\n",
  );
  copyFileSync(join(root, ".versionrc.json"), join(cwd, ".versionrc.json"));
  git("add", ".");
  git("commit", "-m", "chore: initial fixture");
  git("tag", "v0.2.0");
  if (change) {
    writeFileSync(join(cwd, "feature.txt"), "fixture");
    git("add", ".");
    git("commit", "-m", change);
  }
  return {
    cwd,
    git,
    clean: () => rmSync(cwd, { recursive: true, force: true }),
  };
}
const run = (cwd, args = []) =>
  spawnSync(process.execPath, [join(root, "scripts/release.mjs"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: "" },
    timeout: 30_000,
  });

test("release preparation bumps a pre-1.0 feature to minor, keeps manual notes, updates the lockfile and never creates commits/tags", () => {
  const repo = fixture("feat(reader): improve reading");
  try {
    const before = repo.git("rev-parse", "HEAD");
    const result = run(repo.cwd);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    const pkg = JSON.parse(
      readFileSync(join(repo.cwd, "package.json"), "utf8"),
    );
    assert.equal(pkg.version, "0.3.0");
    assert.equal(
      JSON.parse(readFileSync(join(repo.cwd, "package-lock.json"), "utf8"))
        .packages[""].version,
      "0.3.0",
    );
    const changelog = readFileSync(join(repo.cwd, "CHANGELOG.md"), "utf8");
    assert.match(releaseNotes(changelog, pkg.version), /improve reading/);
    assert.match(releaseNotes(changelog, pkg.version), /Manual note/);
    assert.ok(!changelog.includes("[Unreleased]"));
    assert.equal(repo.git("rev-parse", "HEAD"), before);
    assert.equal(repo.git("tag", "--list"), "v0.2.0");
  } finally {
    repo.clean();
  }
});
test("fixes bump patch; dry-run leaves every tracked byte unchanged", () => {
  const repo = fixture("fix(import): preserve text");
  try {
    const preview = run(repo.cwd, ["--dry-run"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(repo.git("status", "--porcelain"), "");
    const result = run(repo.cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(readFileSync(join(repo.cwd, "package.json"), "utf8")).version,
      "0.2.1",
    );
  } finally {
    repo.clean();
  }
});
test("release refuses uncommitted changes and does nothing with an unchanged baseline", () => {
  const repo = fixture();
  try {
    assert.equal(run(repo.cwd).status, 0);
    assert.equal(repo.git("status", "--porcelain"), "");
    writeFileSync(join(repo.cwd, "dirty.txt"), "local work");
    assert.notEqual(run(repo.cwd).status, 0);
    assert.equal(
      JSON.parse(readFileSync(join(repo.cwd, "package.json"), "utf8")).version,
      "0.2.0",
    );
  } finally {
    repo.clean();
  }
});
test("release notes select exactly the requested section and reject missing versions", () => {
  const log =
    "# Changelog\n\n## [0.3.0](https://example.com) (2026-10-29)\n\n### Features\n\nNew work.\n\n## [0.2.0] - 2026-10-25\n\nOld work.\n";
  assert.equal(releaseNotes(log, "0.3.0"), "### Features\n\nNew work.");
  assert.throws(() => releaseNotes(log, "9.9.9"));
});
test("explicit release versions cannot decrease or reuse the current version", () => {
  const repo = fixture("fix: fixture repair");
  try {
    for (const target of ["0.1.9", "0.2.0"])
      assert.notEqual(run(repo.cwd, [target]).status, 0);
    assert.equal(repo.git("status", "--porcelain"), "");
  } finally {
    repo.clean();
  }
});
test("release-state distinguishes ordinary main changes from a release merge and rejects moving a tag", () => {
  const repo = fixture("feat: example capability");
  const state = () =>
    spawnSync(process.execPath, [join(root, "scripts/release-state.mjs")], {
      cwd: repo.cwd,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: "" },
    });
  try {
    repo.git("update-ref", "refs/remotes/origin/main", "HEAD");
    const ordinary = state();
    assert.equal(ordinary.status, 0, ordinary.stderr);
    assert.equal(JSON.parse(ordinary.stdout).prepare, true);
    const prepared = run(repo.cwd);
    assert.equal(prepared.status, 0, prepared.stderr);
    repo.git("add", ".");
    repo.git("commit", "-m", "chore(release): v0.3.0");
    const release = state();
    assert.equal(release.status, 0, release.stderr);
    assert.equal(JSON.parse(release.stdout).publish, true);
    repo.git("tag", "v0.3.0", "HEAD^");
    const collision = state();
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /must never move/);
  } finally {
    repo.clean();
  }
});
