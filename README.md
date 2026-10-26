# Paperword

A personal web service for reading English articles with translations and learning vocabulary in context. Works in desktop and mobile browsers. Built with React, TypeScript, Node.js 24, Express and SQLite.

## Features

- Import prepared HTML, text-based PDFs, URLs and pasted text; original files are preserved.
- Library: search, topics, favorites, New / Reading / Read statuses, renaming and deletion.
- Reader: RU per block, RU ALL, translation editing, contents, pages of 24 blocks and saved reading position.
- Article and word translation through an **OpenAI-compatible API**, including Ollama. The application does not depend on Ollama's native API.
- Click a word or select a phrase → base form, translation, source context and note. With a model selected, form and translation are suggested automatically and can be edited before saving.
- Hover or keyboard focus immediately shows the article's dictionary translation without calling AI; clicking opens card creation. Escape, pointer exit and scrolling dismiss the tooltip.
- The interface and a unique database index prevent duplicate base forms. Case, repeated whitespace and typographic apostrophes do not create separate entries.
- One vocabulary entry, two review directions: EN → RU and RU → EN, each with an independent schedule.
- Light and dark themes, password sign-in, server-side storage and JSON text-data export.
- Monochrome dark theme: black background, white text and gray elements, matching prepared articles.
- HTTP API, remote MCP and a local MCP adapter for agents; separate revocable tokens and idempotent import.

Agent setup is documented in [docs/agent-integration.md](docs/agent-integration.md). Tokens are issued in Settings.

## Quick local start

Requires Node.js **24.14 or newer** with `node:sqlite`.

```powershell
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on `127.0.0.1:3001`. Without `APP_PASSWORD`, the server always binds to loopback. The initial library is empty; test fixtures are not inserted into user data.

To preview the production build:

```powershell
npm run build
npm start
```

Open [http://localhost:3001](http://localhost:3001).

## Connect Ollama or another model server

Copy `.env.example` to `.env` and configure:

```dotenv
AI_BASE_URL=http://127.0.0.1:11434/v1
AI_MODEL=your-installed-model-name
AI_API_KEY=
```

`AI_BASE_URL` includes `/v1`. The service calls `GET /models` and `POST /chat/completions`; requests use `response_format: {"type":"json_object"}`. Ollama's OpenAI-compatible interface supports this: [official documentation](https://docs.ollama.com/api/openai-compatibility).

Restart the API after changing `.env`. In Settings, check the connection and select a model from the list or enter its exact name. The model selected in the interface is stored in the database and overrides `AI_MODEL`. Models are not downloaded automatically.

Translation processes one block at a time, skips completed blocks and saves partial results after every response. Resume after an error or restart. Cancellation waits for the current request, up to 3 minutes. The model must support JSON responses and EN → RU translation; base-form and translation quality depend on the model.

In Docker, `127.0.0.1` refers to the application container. Use an API address reachable from that container. For a model on the same host, use `host.docker.internal`; the model server must accept connections from the Docker network. Address, key and model are configured independently of service hosting.

## Host on your VPS

`Dockerfile`, `compose.yaml` and Caddy HTTPS configuration are included. Docker with Compose and free ports 80/443 are required. `.env.vps.example` contains neutral examples: replace the domain and set a password. A free DNS name based on your IPv4 is an option: [HTTPS setup](docs/vps-https.md).

Set real values in `.env`:

```dotenv
APP_PASSWORD=replace-with-a-unique-password-at-least-12-characters
APP_DOMAIN=papers.example.com
APP_ORIGIN=https://papers.example.com
AI_BASE_URL=http://model-server-reachable-from-container:11434/v1
AI_MODEL=your-model-name
AI_API_KEY=
```

The domain in `APP_DOMAIN` must match the origin in `APP_ORIGIN`. Then:

```sh
docker compose up -d --build
docker compose logs -f app
```

Caddy obtains a TLS certificate and forwards requests to the application. The application port is not published externally. Production rejects a missing/short password or a non-HTTPS `APP_ORIGIN`. Sessions persist in SQLite; cookies are HttpOnly, Secure and SameSite=Strict. Changing the password and restarting automatically invalidates old sessions.

The VPS and real model server were not used for local validation. Validate the Docker build on the target Linux host.

## Data and backups

The local database is `data/paperword.sqlite`; Compose uses the `paperword_data` volume. It holds articles, source files, cards, schedules and sessions. SQL uses parameters; imported HTML becomes text blocks and its scripts are never executed. URL downloads reject internal IPs, validate redirects and pin the verified DNS address.

Export in Settings saves articles, translations, cards, schedules and review events as JSON. It **does not include original files** and is not a full backup. Restoring this JSON through the interface is not implemented yet.

Complete Compose backup (Linux):

```sh
docker compose stop app
docker compose run --rm --no-deps -T app tar -C /app/data -czf - . > paperword-data.tar.gz
docker compose start app
```

To restore into an empty/prepared volume, stop the application, then:

```sh
docker compose run --rm --no-deps -T app tar -C /app/data -xzf - < paperword-data.tar.gz
docker compose start app
```

Restoring replaces files from the backup. Back up the current volume first. For local use, stop the server and copy the entire `data` folder, including SQLite/WAL files if present.

## Review intervals

Initial intervals: Again — 10 minutes; Hard — 12 hours; Good — 1 day; Easy — 4 days. Subsequent intervals grow with successful answers; Again returns that direction to learning. The algorithm is a transparent SM-2 variant, not FSRS. Directions are independent. Duplicate submission of a rating from two tabs is rejected.

Space reveals the answer; keys 1–4 rate it. Mobile users have buttons.

## Initial-version limitations

- Import was validated against actual Spatial-RAG and GeoNatureAgent Benchmark HTML from the earlier task: source files, English text, 166 and 39 translated blocks, and dictionary hints were preserved. Supported structures include `.word[data-ru]`, `.article-text`, `.en` and `.ru-paragraph`. Other HTML templates may require adaptation.
- PDFs provide extracted text; OCR, original layout, mathematical markup and table reconstruction are not implemented. The original PDF remains downloadable. HTML displays embedded raster images within `figure`; external figures and complex layouts remain in the saved original.
- URL import downloads HTML/PDF without executing JavaScript; restricted or dynamic websites may require manual upload.
- Translation rejects blocks exceeding 12,000 characters and asks for the content to be split.
- Offline mode, Anki integration and multiple-user libraries are not implemented.

## Validation and structure

```sh
npm run check
npm run test:e2e
```

Browser tests use Playwright Chromium and an isolated in-memory database with a fixture API. Real models and personal data are untouched. Screenshots are saved in `artifacts/qa`. To use installed Chrome locally, set `PLAYWRIGHT_CHANNEL=chrome`.

- `src/components` — library, reader, vocabulary, review and Settings.
- `server/content.ts` — file parsing and safe source downloads.
- `server/ai.ts` — OpenAI-compatible client and response validation.
- `server/scheduler.ts` — review interval calculation.
- `server/store.ts` — SQLite and data relationships.
- `server/app.ts` — HTTP API, authentication and input validation.
- `docs/product-brief.md` — requirements; `CONTEXT.md` — domain vocabulary.

Format code with `npm run format`.

## ChatGPT and versions

Supports OAuth + PKCE, prepared ChatGPT file uploads through `import_chatgpt_file`, HTTP API and stdio. [Agent connection](docs/agent-integration.md), [existing-task instructions](docs/chatgpt-task-instructions.md). Server connection requires deployment and owner OAuth approval.

The current release is **0.2.0**. See the [changelog](CHANGELOG.md) and [SemVer workflow](docs/versioning.md). The interface and MCP read their version from `package.json`.

Before publication or environment setup, read [secrets and personal data](SECURITY.md). Replace repository example addresses with your own; keep real settings outside Git.

## License

Paperword source code and documentation are distributed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**. SPDX identifier: `PolyForm-Noncommercial-1.0.0`.

The license permits use, modification and distribution for its specified noncommercial purposes. Commercial use, including paid hosting, inclusion in a commercial product and internal use for a company's commercial activities, requires separate permission from the copyright holder. Exceptions, including those for listed educational, nonprofit and government organizations, are governed by the full `LICENSE` text.

Distributions must retain the license terms and copyright notice in [NOTICE](NOTICE). Third-party dependencies retain their licenses. Uploaded articles, translations and illustrations remain subject to their respective rights. Contact the repository owner through GitHub to discuss separate commercial permission.
