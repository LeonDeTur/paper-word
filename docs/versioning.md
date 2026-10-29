# Versions and Git

`package.json` is the single version source. HTTP `/api/config`, MCP and Settings display the same version. The initial release is `0.2.0`, tagged `v0.2.0`. SQLite schema versioning is independent through `PRAGMA user_version` (currently 4); the application rejects newer schemas. CI checks package-version and minimum-Node consistency.

Branches use `feat/name`, `fix/name`, `docs/name`, `chore/name` or `ci/name`. Commits and PR titles follow Conventional Commits: `feat: …`, `fix: …`, `docs: …`, `chore(release): vX.Y.Z`. Never use the `codex/` prefix. Commitlint checks messages locally and in CI. All descriptions and comments must be in English.

SemVer: `fix`/`perf` produce PATCH, `feat` produces MINOR, and `!` or `BREAKING CHANGE:` produces MAJOR. During `0.x`, features and breaking changes both increase MINOR. Describe incompatibilities in release notes. Technical changes visible in the changelog may be included in PATCH.

The primary workflow is an automatic Release PR:

1. Merge changes with meaningful Conventional Commits into `main`.
2. After full CI succeeds, the bot creates/updates `chore/release` with package versions, changelog and notes.
3. Review the proposed version, description and compatibility; wait for Release PR checks and merge it.
4. After full CI on the new `main`, the workflow creates a tag and GitHub Release with an archive and SHA-256. The tag targets the tested SHA and never moves on retry.

Details and initial GitHub setup: [CI and releases](ci.md).

Local preview: `npm run release -- --dry-run`. To prepare files manually on a clean branch, run `npm run release` or `npm run release -- patch|minor|major|X.Y.Z`. The script uses `commit-and-tag-version`, updates package files and changelog, but **does not create commits/tags or push**. Then run `npm run check:all`, review changes and create a PR titled `chore(release): vX.Y.Z`. The version must increase; the current version's base tag must be available locally.

Do not prepare a manual release and a bot Release PR simultaneously. Notes come from commits; manual `[Unreleased]` notes, if any, move into the new section. Older changelog sections are preserved. Public runtime archives use an explicit allowlist, excluding `.env`, databases, articles and `node_modules`.

Before updating a VPS, back up the complete data volume and record the current tag. Update source to the selected tag and run `docker compose up -d --build`. Returning to an older schema requires a compatible backup; rolling back a container does not roll back SQLite. Personal articles, `.env`, keys and databases stay outside Git.
