# Changelog

Changes follow SemVer. Dates indicate release dates.

## [Unreleased]

### Added

- Token expiry through a calendar with date/time or an interface command (`30d`, `12h`, `2w`, `2027-12-31 18:00`). The 365-day cap is removed; HTTP API supports `expires_at` and `expires_in` with server-side validation.

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
