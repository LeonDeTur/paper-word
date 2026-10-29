# CI and automatic releases

## Checks

`CI` runs for PRs targeting `main`, manually through Actions, and as a reusable workflow called by `Release` on pushes to `main`.

1. **Quality (Ubuntu/Windows)**: Node from `.node-version`, lockfile install, Conventional Commits and branch names, version consistency, repository policy, Prettier, Oxlint, TypeScript/Vite/esbuild, unit and tooling tests.
2. **Integration (Ubuntu/Windows)**: API/SQLite/OAuth, remote MCP with the official client, stdio, permission boundaries and migrations. Linux also produces LCOV.
3. **Browser and accessibility**: installed Chromium, desktop/mobile viewports, OAuth, reading, cards and Axe. HTML/JUnit/trace/screenshots remain in Actions artifacts for 14 days.
4. **Docker build and smoke test**: builds a Linux image without publishing it, starts with a fixture password, checks production configuration, unauthenticated rejection and an unprivileged user. Personal data is never copied into the image.
5. **CI passed**: the aggregate required result, successful only after all four groups pass.

Separate `Security` runs CodeQL and `npm audit --audit-level=high` for PRs, on `main` through Release, and weekly. Dependabot proposes npm and Actions updates without automatic merging.

Actions are pinned to full SHAs. Ordinary checks use only `contents: read`; checkout does not persist credentials. PR code never runs through `pull_request_target`. Only the release job after successful `main` CI receives PR/release creation and bot-CI dispatch permissions. Actions needs no model secrets or VPS access. No self-hosted runner on the VPN server is required.

## Release PR

After successful `main` checks, the bot detects whether a new version was merged. Ordinary changes prepare or update a PR from `chore/release`:

- Conventional Commits determine the next SemVer;
- `package.json`, both version fields in `package-lock.json` and `CHANGELOG.md` are updated;
- existing manual `Unreleased` notes move into the new section;
- the PR receives title `chore(release): vX.Y.Z` and release notes;
- bot-branch CI is explicitly started through `workflow_dispatch`, so no personal PAT is needed.

No tag or public release is created before the PR merges. Full CI runs again afterward. A GitHub Release is then published **for the tested SHA**: version, generated notes, runtime archive and `SHA256SUMS`. It starts as a draft and supports workflow retries. Published assets are never overwritten, and existing tags never move to another commit.

The archive contains only `build`, `dist`, package files, license, public examples and documentation. Extract it, install the required Node version, run `npm ci --omit=dev`, configure the environment and run `npm start`. It excludes `node_modules`, personal library, `.env`, tokens and source articles. This is a portable runtime archive; Docker builds and development require the source Git repository.

No npm publication, registry image push or automatic VPS deployment is configured. These can be added separately after validating the first release.

## GitHub settings

Use a public repository with Actions. In **Settings → Actions → General**, allow GitHub Actions to create pull requests. Default token permissions can remain read-only; the release job requests its own permissions. Enable code scanning for CodeQL; GitHub secret scanning and push protection provide additional protection.

The baseline `v0.2.0` tag must exist in origin. Before initial setup, inspect `git show v0.2.0` and push the existing verified tag with `git push origin v0.2.0`. Never move it to another commit during ordinary releases. The workflow creates subsequent tags.

Recommended `main` protection: PRs, required **CI passed**, **CodeQL**, **Dependency audit**, resolved discussions and no force-push. For a personal project, avoid requiring an independent approving review if there is no second maintainer. Automation does not enable this policy without a separate owner decision.

If the first Release PR is missing, check PR creation permission, the baseline tag and Actions → Release. Select `main` for manual retries. Never publish from an untested SHA. Validate workflow changes in a PR first.
