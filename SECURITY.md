# Secrets and personal data

Configure the service address and credentials through the environment. `.env.example` and `.env.vps.example` contain neutral examples only. Never add real passwords, API keys, agent tokens, signed temporary URLs or VPN configurations to source files or ChatGPT task prompts.

Personal articles, source files, vocabulary, sessions and OAuth data are stored in SQLite under `data/`. This directory, Git backups, logs, browser-test reports, `.env` and key files are excluded from Git and the Docker build context. Local `.env.vps.local` holds private deployment settings and is excluded from the public repository. Transfer it separately using a secure method and use it as `.env` on the server.

Before publishing, check working files and the complete history of branches and tags being pushed. Removing a secret in a later commit does not remove it from earlier commits. Revoke or rotate any real credential that was published; history cleanup alone is insufficient. Do not include personal chat identifiers or user-profile paths.

Tests use clearly marked fixture passwords (`*-fixture-password`, `test-only-password`) and reserved addresses. These are never production defaults. Production requires a separate owner password and an HTTPS APP_ORIGIN. Password-free local mode binds only to loopback.

Before the first push, inspect `git status`, tracked files and secrets. Push the prepared branch and tag explicitly:

```sh
git push -u origin main
git push origin v0.2.0
```

Archiving the entire project directory bypasses `.gitignore` and may include private data. Distribute source through Git or `git archive main`. Commit author identities and public links to scientific articles are part of the published project.
