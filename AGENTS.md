# Project instructions

## Language

- Write all code comments, docstrings, documentation, interface text, error messages, commit messages, pull request descriptions and release notes in English.
- Do not add raw Cyrillic characters to any tracked file or file name. This rule applies to source, tests, examples, configuration, generated changelogs and project instructions.
- Translate project text into English; do not hide Russian comments, documentation or interface text behind Unicode escapes or transliteration.
- Preserve multilingual user content, including Russian article translations and vocabulary. Keep personal articles, databases, exports and deployment settings outside Git.
- Deliberate multilingual test fixtures and backward-compatible input aliases may use explicit Unicode escapes to verify existing behavior without raw Cyrillic in source. Explain their purpose in English when it is not obvious.
- Run `npm run check:privacy` to validate staged/tracked repository content. The pre-commit hook and CI enforce the same policy. English prose remains a review responsibility; the automated guard detects Cyrillic rather than identifying every natural language.

## Collaboration and Git

- Ask clarifying questions when starting a task to make the intended scope and outcome precise. Continue independent work while awaiting answers.
- Never name a branch with the `codex/` prefix. Use Conventional Commit prefixes such as `feat/reader`, `fix/import`, `docs/guide`, `chore/maintenance` or `ci/checks`.
- Use English Conventional Commits and PR titles. Describe breaking changes with `!` or a `BREAKING CHANGE:` footer.
- Do not rewrite published history without explicit authorization and a verified local backup. Keep history bundles out of Git and release archives.
- Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and the relevant documents in `docs/` before changing their workflows.

## Validation

- Run `npm run check` for code changes and `npm run test:e2e` for interface changes.
- Use isolated test databases and fixture model servers. Never run tests against a personal library or expose private configuration in output.
- Keep version numbers consistent with `package.json`; use the Release PR workflow described in [docs/versioning.md](docs/versioning.md).
