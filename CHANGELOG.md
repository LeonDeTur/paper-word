# Changelog

Changes are generated from Conventional Commits. Versions follow SemVer.

## [0.3.0](https://github.com/LeonDeTur/paper-word/compare/v0.2.0...v0.3.0) (2026-11-04)

### Additional notes

### Added

- English-only project instructions, interface, documentation and release notes; Cyrillic guards for staged files, commit messages and CI pull request metadata. Multilingual user data and translated-article tests remain supported.
- GitHub Actions: quality checks, unit/integration tests on Linux and Windows, Chromium/Axe, coverage and Docker smoke tests; separate CodeQL, dependency auditing and Dependabot.
- Release PR from `chore/release`: versions and English changelog sections from Conventional Commits, GitHub Release after successful CI, runtime archive and SHA-256 without personal data.
- Local setup and validation commands, Git hooks, Commitlint, Oxlint, consistent Node/editor/line endings and a development guide.
- MCP and HTTP API for library search and reading, article and translation editing, background translation, cards, reviews and statistics. The website and MCP share an operations layer.
- Separate agent permissions, selectable scopes for tokens and OAuth; deletion requires additional `data:delete` and is disabled by default. Existing tokens migrate with import-only access.
- OAuth with PKCE for Claude, scope narrowing on refresh, identical management tools over remote MCP and stdio; translation writes reject stale edits.
- Token expiry through a calendar with date/time or an interface command (`30d`, `12h`, `2w`, `2027-12-31 18:00`). The 365-day cap is removed; HTTP API supports `expires_at` and `expires_in` with server-side validation.
- PolyForm Noncommercial License 1.0.0 for code and documentation; license and copyright notice included in the Docker image.

### Features

- **auth:** support custom agent token expiry ([517106c](https://github.com/LeonDeTur/paper-word/commit/517106c00ac5cf1910c47ca504f2fb7c29881345))

### CI

- **deps:** bump actions/checkout from 6.1.0 to 7.0.1 ([#4](https://github.com/LeonDeTur/paper-word/issues/4)) ([b3d87d9](https://github.com/LeonDeTur/paper-word/commit/b3d87d95e6c1b152fa1132d6ed1820f3ebc2b050))
- **deps:** bump docker/build-push-action from 6.19.2 to 7.4.0 ([#2](https://github.com/LeonDeTur/paper-word/issues/2)) ([468a944](https://github.com/LeonDeTur/paper-word/commit/468a94411e541f8e403a449fa8d27dc390fc8299))
- **deps:** bump docker/setup-buildx-action from 3.12.0 to 4.4.1 ([#5](https://github.com/LeonDeTur/paper-word/issues/5)) ([2475fce](https://github.com/LeonDeTur/paper-word/commit/2475fce9e784f8dd1c30b67c645a2c103a05ea1d))
- **deps:** bump github/codeql-action/init ([#3](https://github.com/LeonDeTur/paper-word/issues/3)) ([7daff5b](https://github.com/LeonDeTur/paper-word/commit/7daff5be2819cbfbcb86b16518947d638a812225))

### Maintenance

- enforce English-only project content ([#7](https://github.com/LeonDeTur/paper-word/issues/7)) ([cf82366](https://github.com/LeonDeTur/paper-word/commit/cf823661b5d927db60b42d1aa9015b5a6f6e51e6))

## [0.2.0] - 2026-10-25

### Added

- Personal library of HTML, PDF and linked articles; original files and translations stored in SQLite.
- Reader with paragraph translations, word hints, bookmarks and reading progress.
- EN → RU and RU → EN cards with independent schedules and duplicate base-form protection.
- OpenAI-compatible model API, including Ollama; resume partial translation after failure.
- HTTP API and MCP with scoped, revocable tokens, receipts and idempotent import.
- OAuth with PKCE, owner consent, rotating refresh tokens and ChatGPT file uploads through MCP.
- Docker Compose, Caddy, an example VPS address and automatic trusted HTTPS certificates.
- SemVer, changelog and validated Git tag releases.

### Fixed

- Monochrome dark theme and word translations on hover; clicking opens a card.
- Import word hints and translations from Spatial-RAG and GeoNatureAgent templates.

### Security

- Owner sign-in, CSRF protection, size limits and rate limits.
- Public address validation, DNS pinning and redirect validation during downloads.
- OAuth tokens and codes stored as hashes; temporary ChatGPT file links are not persisted.
- Configuration examples anonymized before initial public publication; databases, keys, logs and local settings excluded from Git and Docker build context.
