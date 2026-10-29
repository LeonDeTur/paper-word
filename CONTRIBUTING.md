# Local Paperword development

Requires Node.js **24.14.0 or newer**. `.node-version` and `.nvmrc` record the exact minimum version; `engine-strict` rejects unsupported Node installations. Docker is needed only for image checks and deployment. Node is sufficient for ordinary development.

```sh
npm ci
npm run setup
npx playwright install chromium
npm run dev
```

`setup` creates `.env` from the example only when absent and enables local Git hooks. Existing settings and user data are preserved. If another `core.hooksPath` is configured, installation stops with an explanation. Hooks are not installed in CI. On Linux, use `npx playwright install --with-deps chromium` for browser system libraries.

Interface: `http://127.0.0.1:5173`; API: `http://127.0.0.1:3001`. Set a different `PORT` and `DB_PATH` for a second instance. Tests use ports 3012/3013, in-memory/temporary databases and a fixture model; they need no real articles, credentials or Ollama instance.

## Commands

| Command                        | Purpose                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `npm run check`                | Versions, repository policy, formatting, lint, build and all server/tooling tests      |
| `npm run check:all`            | The same checks plus browser scenarios                                                 |
| `npm run test:unit`            | File parsing, address restrictions and review scheduling                               |
| `npm run test:integration`     | Express/SQLite, sign-in, HTTP API, OAuth, MCP HTTP/stdio, migrations and fixture model |
| `npm run test:tooling`         | Version/changelog preparation in temporary Git repositories and repository policy      |
| `npm run test:coverage`        | All server/tooling tests and LCOV in `coverage/lcov.info`                              |
| `npm run test:e2e`             | Chromium: desktop, mobile, dark theme, OAuth and accessibility                         |
| `npm run test:e2e:ui`          | Interactive Playwright runner                                                          |
| `npm run test:e2e:report`      | HTML report for the last run                                                           |
| `npm run typecheck`            | TypeScript without building                                                            |
| `npm run lint`                 | Oxlint with no warnings                                                                |
| `npm run format`               | Prettier formatting                                                                    |
| `npm run format:check`         | Formatting validation only                                                             |
| `npm run check:privacy`        | Staged/tracked paths, known credential patterns and Cyrillic characters                |
| `npm run release -- --dry-run` | Version/changelog preview without modifying files                                      |
| `npm run release:pack`         | Built runtime archive and SHA-256 in `release-assets/`                                 |

TypeScript checks types separately from Oxlint. React Hooks rules are enabled; React Compiler restrictions for effects, refs and purity are disabled because the project does not use React Compiler. Browser scenarios cover React components; LCOV reports loaded server modules and utilities rather than interface coverage.

Installed Playwright Chromium is the default. Set `PLAYWRIGHT_CHANNEL=chrome` to test local Google Chrome. Tests never reuse an existing server, avoiding accidental access to a personal library. CI forbids `.only`, retries a failed browser test once and retains traces on failure.

## Git hooks and Conventional Commits

- `pre-commit`: checks private paths, credential patterns, Cyrillic and formatting in **staged content**, including partially staged files, then checks types. It never fixes files or stages changes automatically.
- `commit-msg`: validates Conventional Commits and English-only messages through Commitlint.
- `pre-push`: runs `npm run check`. CI runs the full browser suite; run it locally through `check:all`.

Branches: `feat/reader`, `fix/import`, `ci/checks`, `chore/release`. Commits and PR titles: `feat(reader): add a glossary`, `fix(import): preserve paragraphs`, `ci: test Docker builds`. Write all comments, descriptions and messages in English; raw Cyrillic is forbidden in tracked files. For breaking changes, use `feat(api)!: ...` or a `BREAKING CHANGE: ...` footer. Titles have a 120-character limit.

Prefer squash merging with a meaningful Conventional Commit PR title. CI also validates every PR commit message. Automation does not invent the meaning of changes: release-note quality depends on commit descriptions. Use `git commit --amend` to fix the latest local message; do not rewrite published shared history without explicit coordination.

Privacy checks are an additional guard for known formats, not proof that every possible secret is absent. Databases, articles, `.env`, keys, reports and release assets are excluded from Git. Configuration examples must not contain real VPS addresses or credentials. Project instructions are in [AGENTS.md](AGENTS.md).

More: [CI and releases](docs/ci.md), [SemVer](docs/versioning.md), [license](LICENSE).
