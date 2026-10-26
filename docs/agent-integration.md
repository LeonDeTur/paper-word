# Agent article uploads

The service accepts prepared articles through HTTP API and MCP using a shared import path. Access uses ChatGPT OAuth or a separate revocable bearer token for other agents with `articles:import`. Agents can add material and obtain their own import receipts. They cannot access vocabulary, settings, other agents' receipts or article deletion.

## Token and service address

Open **Settings → Agent access**, choose expiry and click **Create token**. Use the calendar or commands: `30d`, `12h`, `2w`, `15m`, `30 days`, `31.12.2027 18:00` or `2027-12-31`. A date without time ends at the end of that day in the displayed browser timezone. Durations may exceed 365 days. Copy the token into the agent's environment. Only SHA-256 is stored; the original cannot be recovered. Revoke immediately disables HTTP and MCP access. Issue separate tokens for separate integrations.

Owner HTTP API: `POST /api/agent-tokens` with session cookie, `X-Paperword: 1` and JSON `{ "name": "Importer", "expires_in": 43200 }` (seconds) or `{ "name": "Importer", "expires_at": "2027-12-31T18:00:00+03:00" }`. `expires_at` requires a timezone-aware ISO date. Legacy `days` remains supported; the default is 90 days. Supply only one of `days`, `expires_in`, `expires_at`. Past, nonexistent or unrepresentable dates return `422`. Expiry is stored in UTC and checked on every request. These settings apply to manual bearer tokens; ChatGPT OAuth lifetimes are described below.

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

Endpoint: `https://papers.example.com/mcp`. Transport: **stateless Streamable HTTP**; `Authorization: Bearer …` is required on every request. Supports clients with custom headers or bearer tokens. ChatGPT uses OAuth with PKCE and dynamic registration; legacy SSE is not used. Manual bearer-token access remains supported.

Tools:

- `import_chatgpt_file`: prepared ChatGPT file; `file` requires `download_url` and `file_id`, optionally `mime_type` and `file_name`, plus `external_id` and article metadata. The URL must be HTTPS and public, up to 15 MB. Temporary URLs are neither stored in the database nor returned in receipts.
- `import_article`: the JSON HTTP API fields. Prepared blocks, HTML or a public URL; the same safe-retry rules apply.
- `get_imported_article`: receipt by `id` for the current agent.

MCP does not accept arbitrary VPS file paths. For large local files, use HTTP multipart or the local stdio adapter below.

## Local MCP over stdio

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

## ChatGPT: OAuth and prepared files

MCP URL: `https://paperword.example.com/mcp`. Deploy [VPS HTTPS](vps-https.md), then create an app in ChatGPT → Plugins with this URL and OAuth. The server publishes Protected Resource Metadata at `/.well-known/oauth-protected-resource/mcp` and authorization metadata at `/.well-known/oauth-authorization-server`. DCR: `/register`; code issuance: `/authorize`; exchange/refresh: `/token`; revocation: `/revoke`. Callbacks are limited to documented chatgpt.com addresses; local callbacks are available only outside production.

Sign in to Paperword with your password and approve limited access on a separate screen. The password is never sent to ChatGPT. PKCE S256, exact `/mcp` resource and `articles:import` are required. Codes last 5 minutes, access tokens one hour, refresh tokens 90 days with rotation on every use. Reusing an old refresh token revokes the connection. The overall grant expires after one year. The database stores token hashes. Revocation in Settings immediately disables OAuth and manual access for that agent.

`import_chatgpt_file` declares `_meta["openai/fileParams"] = ["file"]` according to the ChatGPT contract. The VPS downloads the temporary HTTPS URL with pinned DNS, redirect validation and a 15 MB limit. Bytes use the same import path as multipart. Metadata and original-file hash determine retries; changing the temporary URL does not duplicate the article. HTTP equivalent: `POST /api/agent/articles/chatgpt-file` with the same JSON.

Local OAuth/MCP tests do not mean the cloud app is connected. A reachable VPS, owner OAuth consent and a write test from the existing recurring task are required. If ChatGPT requires write confirmation, a server-side readOnlyHint cannot bypass it.

Contracts: [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [file transfer and tool metadata](https://developers.openai.com/plugins/reference).
