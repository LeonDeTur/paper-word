# Versions and Git

`package.json` is the single version source. HTTP `/api/config`, MCP and Settings display the same version. The initial release is `0.2.0`, tagged `v0.2.0`. SQLite schema versioning is independent through `PRAGMA user_version` (currently 3); the application rejects newer schemas.

Branches: `feat/name`, `fix/name`, `docs/name`, `chore/name`. Commits: `feat: …`, `fix: …`, `docs: …`, `chore(release): …`. Never use the `codex/` prefix.

SemVer: PATCH for fixes; MINOR for compatible features; MAJOR for incompatible contracts. During `0.x`, breaking changes require a new MINOR and explicit changelog notes.

For the next release:

1. Add a dated `CHANGELOG.md` section for the target version and commit changes. The working tree must be clean.
2. Run `npm run test:e2e` if the interface changed.
3. Preview the release: `npm run release -- patch --dry-run` (`minor`, `major` and explicit `X.Y.Z` are also supported).
4. Release with `npm run release -- patch`. The script updates `package.json` and lockfile, builds and tests, then creates a commit and annotated tag. Failed checks produce no commit or tag; fix and commit the issue, then continue release preparation manually.
5. Push separately. The script neither creates a GitHub Release nor pushes.

Before updating a VPS, back up the complete data volume and record the current tag. Update source to the selected tag and run `docker compose up -d --build`. Returning to an older schema requires a compatible backup; rolling back a container does not roll back SQLite. Personal articles, `.env`, keys and databases stay outside Git.
