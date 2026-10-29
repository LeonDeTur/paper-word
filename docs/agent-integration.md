# Manage Paperword through HTTP API and MCP

The service exposes import, library search/reading, translation editing, cards and reviews through HTTP API and MCP. The website and agents share application logic and SQLite. Access uses OAuth for ChatGPT/Claude or a separate revocable bearer token. The owner selects permissions. Existing tokens retain only `articles:import`; permissions never expand automatically. MCP never exposes the owner password, model key or server settings.

## Permissions

| Scope             | Access                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| `articles:import` | Import articles and read receipts for the agent's own uploads           |
| `articles:read`   | Search the whole library, read blocks and translation status            |
| `articles:write`  | Article metadata, reading progress, translation writes and cancellation |
| `cards:read`      | Vocabulary and review queue                                             |
| `cards:write`     | Create and edit cards                                                   |
| `reviews:write`   | Save the user's review rating                                           |
| `ai:use`          | Call the model configured in Paperword; provider costs may apply        |
| `data:delete`     | Delete with the corresponding `articles:write` or `cards:write` scope   |

Settings offers Import only, Manage without deletion or individual scopes. Deletion is off by default for manual tokens and OAuth. A recurring task that only uploads prepared articles needs `articles:import`. A management chat can receive the other scopes. Translation requires `articles:write` and `ai:use`; word suggestions require `cards:read` and `ai:use`; statistics require `articles:read` and `cards:read`.

## Token and service address

Open **Settings → Agent access**, select permissions and expiry, then click **Create token**. Use the calendar or a command: `30d`, `12h`, `2w`, `15m`, `30 days`, `31.12.2027 18:00` or `2027-12-31`. A date without time ends at the end of that day; calendar dates use the browser timezone displayed beside the field. Durations may exceed 365 days. Copy the token into the agent's environment. The server stores only its SHA-256 hash; the original cannot be recovered. Revoke immediately disables HTTP and MCP access. Issue separate tokens for separate integrations.

Owner HTTP API: `POST /api/agent-tokens` with the session cookie, `X-Paperword: 1` and JSON `{ "name": "Importer", "scopes": ["articles:import"], "expires_in": 43200 }` (seconds), or `{ "name": "Importer", "expires_at": "2027-12-31T18:00:00+03:00" }`. `expires_at` requires a timezone-aware ISO date. The legacy `days` field is supported; default expiry is 90 days. Supply only one of `days`, `expires_in`, `expires_at`. Past, nonexistent or unrepresentable dates return `422`. Expiry is stored in UTC and checked on every request. These settings apply to manual bearer tokens; OAuth lifetimes are described below. Without `scopes`, only `articles:import` is issued. To expand an existing token's rights, issue a new token and revoke the old one.

`PAPERWORD_URL` is the service address, such as `https://papers.example.com`; `PAPERWORD_TOKEN` is the issued token. Locally, `http://127.0.0.1:3001` is allowed. Remote agents need a VPS address reachable from their network; localhost refers to the agent's own computer.

## HTTP: upload a prepared file

```sh
curl --fail-with-body "$PAPERWORD_URL/api/agent/articles/file" \
  -H "Authorization: Bearer $PAPERWORD_TOKEN" \
  -F 'external_id=arxiv:2606.12821v2:black' \
  -F 'source_url=https://arxiv.org/abs/2606.12821' \
  -F 'tags=["Geospatial AI","Agents"]' \
  -F 'file=@geonatureagent_benchmark_black.html'
```

HTML, PDF, TXT and Markdown up to 15 MB are supported. Required fields: `external_id`, `file`. Optional: `title`, `source_url`, `tags` (JSON string array). This is preferred for illustrated files: the original is preserved without putting megabytes of HTML into model context. Imported HTML is parsed as data; its scripts never execute.

PowerShell example without curl:

```powershell
$agentHeaders = @{ Authorization = "Bearer $env:PAPERWORD_TOKEN" }
$uploadForm = @{
  external_id = 'arxiv:2606.12821v2:black'
  file = Get-Item -LiteralPath './geonatureagent_benchmark_black.html'
}
Invoke-RestMethod -Method Post -Uri "$env:PAPERWORD_URL/api/agent/articles/file" -Headers $agentHeaders -Form $uploadForm
```

## HTTP: structured article, HTML or URL

`POST /api/agent/articles` with `Authorization: Bearer …` and `Content-Type: application/json`. JSON requests are limited to 2 MB.

```json
{
  "external_id": "my-paper:version-1",
  "title": "My prepared article",
  "source_url": "https://example.com/paper",
  "tags": ["Research"],
  "content": {
    "type": "blocks",
    "blocks": [
      {
        "kind": "heading",
        "text": "Abstract",
        "ru": "\u0410\u043d\u043d\u043e\u0442\u0430\u0446\u0438\u044f"
      },
      {
        "kind": "paragraph",
        "text": "The English paragraph.",
        "ru": "\u0420\u0443\u0441\u0441\u043a\u0438\u0439 \u0430\u0431\u0437\u0430\u0446."
      }
    ],
    "dictionary": { "paragraph": "\u0430\u0431\u0437\u0430\u0446" }
  }
}
```

Instead of `blocks`, use `content: {"type":"html","html":"<!doctype html>…"}` or `content: {"type":"url","url":"https://example.com/article.html"}`. URL import downloads public HTTP/HTTPS content; internal destinations are forbidden. It **does not translate** English automatically or invoke AI. Supply prepared translations through HTML or `blocks`.

The response includes `id`, `title`, `source_url`, `tags`, `blocks` and `translated_blocks` counts, `duplicate` and a `reader_path` such as `/#article/…`.

`GET /api/agent/articles/{id}` returns an import receipt accessible to the current token. `GET /api/agent/status` validates token and service availability.

## Safe retries

`external_id` is a stable material/version identifier, such as a DOI or versioned arXiv ID. Retrying an unchanged request with the same `external_id` returns the same article (`200`, `duplicate:true`). Initial import returns `201`. Changed content or metadata with an existing `external_id` returns `409`; use a new identifier for a new version. Existing article content is never overwritten.

An identical original file or identical structured content also avoids duplication under another `external_id`. Validation errors return `422`; missing/expired/revoked tokens return `401`. Preserve `external_id` before the first attempt and retry the same request after network failure. Owner deletion removes an article's receipts; a subsequent re-upload creates a new article.

## Remote MCP

Endpoint: `https://papers.example.com/mcp`. Transport: **stateless Streamable HTTP**; `Authorization: Bearer …` is required on every request. Clients can configure custom headers or bearer tokens. ChatGPT and Claude use OAuth with PKCE and dynamic registration; legacy SSE is not used. Manual bearer-token access remains supported.

Tools:

- `import_chatgpt_file`: prepared ChatGPT file; `file` requires `download_url` and `file_id`, optionally `mime_type` and `file_name`, plus `external_id` and article metadata. The URL must be HTTPS and public, up to 15 MB. Temporary URLs are neither stored in the database nor returned in receipts.
- `import_article`: the JSON HTTP API fields. Prepared blocks, HTML or a public URL; the same safe-retry rules apply.
- `get_imported_article`: receipt by `id` for the current agent.

MCP does not accept arbitrary VPS file paths. For large local files, use HTTP multipart or the local stdio adapter below.

## Management tools

In addition to the three import tools:

| Tool                            | Purpose                                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `list_articles`                 | Search title, tags, English text and translation; status/favorite filters                     |
| `get_article`                   | Paginated article: `id`, `offset`, `limit`; excludes binary images                            |
| `update_article`                | `id`, `changes`: title, tags, status, favorite and reading position                           |
| `save_translation`              | `id`, `block_id`, `ru`, `expected_ru`: save a prepared translation with stale-edit protection |
| `start_translation`             | Start/resume background translation using the configured model                                |
| `get_translation_status`        | Status, error and translated-block counts                                                     |
| `cancel_translation`            | Stop after the current model request                                                          |
| `list_cards`, `get_card`        | Search/read vocabulary; `normalized_query` checks exact base-form matches                     |
| `create_card`, `update_card`    | Base form, translation, context, note and source-article link                                 |
| `suggest_word`                  | Suggest a base form and translation using the model without saving                            |
| `list_reviews`                  | EN→RU, RU→EN or both-direction review queue                                                   |
| `review_card`                   | `again`/`hard`/`good`/`easy` rating with required `expected_due_at` from the queue            |
| `get_statistics`                | Library/vocabulary size, due queue and reviews in the last 24 hours                           |
| `delete_article`, `delete_card` | Delete with additional scope and exact `confirm_title`/`confirm_lemma`                        |

Clients see only tools whose required permissions are all granted. The server also checks every execution. Tokens cannot access the owner API, other tokens or keys. Every management tool has an HTTP equivalent: `POST /api/agent/actions/{tool_name}`, Bearer, JSON with the same arguments. Errors: `403` insufficient permissions; `422` invalid arguments; `409` duplicate or stale translation/review.

Lists accept `offset` and `limit` (default 20, maximum 50) and return `items`, `total`, `next_offset`. `get_article` defaults to 5 blocks, maximum 20. Pages also have a size bound; follow returned `next_offset` rather than computing it. A large individual block or card is returned whole. Reviews are ordered by earliest due date; restart a search if the collection changes between pages.

Example request:

```sh
curl --fail-with-body "$PAPERWORD_URL/api/agent/actions/list_articles" \
  -H "Authorization: Bearer $PAPERWORD_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"spatial","limit":10}'
```

ChatGPT/Claude can prepare a translation and save it with `save_translation` without Ollama, or invoke `start_translation` on Paperword's configured model. Background translation does not hold the MCP request open; poll `get_translation_status`. Starting another job while one is active is rejected.

During practice, show the question, wait for the user's answer or self-assessment, then call `review_card`. Never automatically rate unseen cards. A review already saved on the website or another chat returns `409`; reread the queue. Directions have independent intervals. Saving a card does not reset existing schedules; duplicate base forms are rejected.

## Local MCP over stdio

At startup, the adapter reads permissions from `/api/agent/status` and exposes the same management tools. HTTP API rechecks every call. Restart the adapter after replacing its token.

Build with `npm ci`, then `npm run build`. Start the adapter with `node /absolute/path/English-Paper-Translation/build/mcp-stdio.mjs`. It calls the service's HTTP API rather than opening the local database. Supply token and address through environment variables.

Example client configuration:

```json
{
  "mcpServers": {
    "paperword": {
      "command": "node",
      "args": ["C:/Projects/paperword/build/mcp-stdio.mjs"],
      "env": {
        "PAPERWORD_URL": "https://papers.example.com",
        "PAPERWORD_TOKEN": "YOUR_AGENT_TOKEN",
        "PAPERWORD_IMPORT_DIR": "C:/Articles"
      }
    }
  }
}
```

Setting `PAPERWORD_IMPORT_DIR` adds `upload_article_file`: `file_path` (relative or absolute), `external_id`, optional `title` and `source_url`. The directory must exist on the adapter's machine. Paths outside it, including symlink escapes, are rejected. Without this variable, local file access is unavailable. For a containerized agent, mount the directory and use its container path.

## Instructions for a recurring task

After preparing the finished HTML:

1. Derive a stable `external_id` from DOI/arXiv ID and version.
2. Call `upload_article_file` or HTTP multipart with the prepared file. If only text and translations are available, use `import_article` with blocks.
3. Check the successful response: `id`, `translated_blocks`, `duplicate`, `reader_path`. Never report an error as a successful upload.
4. Return `PAPERWORD_URL + reader_path` to the owner. Retry the same request on network failure; report token renewal for `401`; do not overwrite existing material for `409`.

For ChatGPT, use the connection instructions below and the [existing-task block](chatgpt-task-instructions.md). Manual tokens are for HTTP API or stdio agents; never place the owner's password in the task.

## ChatGPT and Claude: OAuth

MCP URL: `https://paperword.example.com/mcp`. Deploy [VPS HTTPS](vps-https.md), then create a ChatGPT → Plugins app with this URL and OAuth. The server publishes Protected Resource Metadata at `/.well-known/oauth-protected-resource/mcp` and authorization metadata at `/.well-known/oauth-authorization-server`. DCR: `/register`; code issuance: `/authorize`; exchange/refresh: `/token`; revocation: `/revoke`. Callbacks are limited to documented ChatGPT URLs and exact `https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`; local callbacks are available only outside production. In Claude: Customize → Connectors → Add → Custom → Web; use the same MCP URL, OAuth and Register automatically. CIMD is not implemented; use DCR. Create a separate connection per client.

Sign in to Paperword with your password and select scopes on the consent screen. Deletion is off by default even if requested. You cannot grant scopes beyond the client's request; reconnect to expand permissions. The password is never sent to ChatGPT. PKCE S256, exact `/mcp` resource and explicitly selected scopes are required. Codes last 5 minutes; access tokens last an hour; refresh tokens last 90 days and rotate on every use. Reusing an old refresh token revokes the connection. The overall grant expires after one year. The database stores token hashes. Revocation in Settings immediately disables OAuth and manual access for that agent.

`import_chatgpt_file` declares `_meta["openai/fileParams"] = ["file"]` according to the ChatGPT contract. The VPS downloads the temporary HTTPS URL with pinned DNS, redirect validation and a 15 MB limit. Bytes use the same import path as multipart. Metadata and original-file hash determine retries; changing the temporary URL does not duplicate the article. HTTP equivalent: `POST /api/agent/articles/chatgpt-file` with the same JSON.

Local OAuth/MCP tests do not mean the cloud app is connected. A reachable VPS, owner OAuth consent and a write test from the existing recurring task are required. If ChatGPT requires write confirmation, a server-side readOnlyHint cannot bypass it.

Contracts: [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [file transfer and tool metadata](https://developers.openai.com/plugins/reference).

### Claude file transfer and chat interface

`import_chatgpt_file` uses ChatGPT's specific file contract; its presence does not imply Claude supplies an equivalent attachment URL. From Claude, send prepared text blocks/HTML through `import_article`, a public material URL, or use the local stdio file adapter. HTTP multipart is the common reliable path for large files.

Tools return text and structured results. Interactive MCP Apps components are not implemented yet. Users can issue chat commands and follow links to complete website articles. Validate each client's actual cloud connection, file transfer and recurring task after deploying HTTPS.
