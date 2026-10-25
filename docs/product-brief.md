# Article translation and vocabulary service

Status: initial working version, locally validated. Date: October 25, 2026.

## Confirmed by the user

- Personal web service for desktop and mobile.
- Upload and manage article translations.
- Reference: the recurring task “Find and translate a current article”.
- Import prepared translations and provide automatic AI translation.
- Cards for learning English vocabulary.
- Host on the user's own VPS with owner-only access.
- Priority imports: recurring-task HTML, PDFs and URLs.
- EN → RU and RU → EN cards with independent intervals in each direction.
- Save words or phrases in their base form; reject duplicates.
- Initial intervals: 10 minutes / 12 hours / 1 day / 4 days.
- Connect Ollama through OpenAI-compatible endpoints without relying on its native API.
- The user delegated the visual direction to the implementer.

## Prepared article format

Import supports standalone HTML with English text, Russian paragraph translations, RU / RU ALL, BLACK / LIGHT and word translations on touch. Reconstructed figures and source-material limitations must be explicit.

Own-VPS hosting, mobile access and complete word translations are requirements. Offline mode is outside the first version's scope.

## Primary journey

Add an article → read the English original and translation → click a word or select a phrase → save a card with context → review vocabulary.

## Requirements for real-data integration

- Actual HTML validation is complete: Spatial-RAG and GeoNatureAgent Benchmark are in the local library; source files are preserved byte for byte.
- OpenAI-compatible API address and installed model name; any required key is configured only on the server.
- VPS domain and environment for validating actual deployment.

## Initial implementation

React and TypeScript, Node.js 24 with Express, SQLite. A calm reading interface with light and dark themes. Code lives in `src` and `server`; instructions and limitations are in `README.md`. Includes library, reader, vocabulary, review, model settings, sign-in, source preservation and JSON export. A unique database constraint prevents duplicate base forms. Each direction has its own schedule. Automatic base-form suggestions can be edited before saving.

## Acceptance criteria and validation boundaries

- AC-001. An imported article appears in the library, survives restart and opens on another device using the same server storage. Validation: API and browser.
- AC-002. Import preserves the original and available translations; missing translations are explicit. Validation: import fixtures and visual inspection. Legacy HTML compatibility requires a real sample.
- AC-003. The reader shows Russian translation per block or for all blocks and resumes the saved reading position. Validation: desktop/mobile browser.
- AC-004. Automatic translation runs server-side through an OpenAI-compatible API; the key never reaches the browser. Provider failure preserves existing text. Validation: fixture API; a real model server is not configured yet.
- AC-005. Cards contain a word or phrase, editable translation and context. A source link returns to the article. Validation: browser flow and API.
- AC-006. A rating saves the review and computes the next due date. An SM-2 variant with the agreed initial intervals applies independently to both directions. Validation: deterministic tests and both directions in the browser.
- AC-007. HTML import never executes source scripts; URL download cannot reach internal server addresses. Validation: malicious HTML and URL tests.
- AC-008. Different case or whitespace in the same base form cannot create another entry. Validation: API returns 409; the browser disables saving when an existing form is found.
- AC-009. Production requires a password and HTTPS origin. Sign-out and password changes revoke sessions. Validation: integration tests.

At this milestone, 22 local server tests passed, covering HTTP API, OAuth, remote MCP with the official SDK client and directory-restricted local stdio MCP. TypeScript/Vite build and browser flows were checked. Actual imports preserve 166 Russian blocks for Spatial-RAG and 39 for GeoNatureAgent, with unchanged originals. Screenshots and observations are in `artifacts/qa`. Linux deployment, a physical phone and a real model server require target-environment validation.

## Applied skills

- `ecc:intent-driven-development`: scenario clarification and testable acceptance criteria.
- `domain-modeling`: shared concepts for article, translation, block, card and context.
- `ecc:frontend-design-direction`: reading/practice interface, mobile adaptation and state validation.
- `ecc:security-review`: upload handling, private-data access and credential storage.
- `ecc:react-patterns`: components, local state, error handling and native forms.
- `ecc:mcp-server-patterns`: remote Streamable HTTP and local stdio MCP with shared import and receipt tools.

## Subsequent refinements

At the user's request, HTTP API and MCP support agents through separate revocable tokens and idempotent import. Tokens permit only uploads and receipt checks, without vocabulary or Settings access. Token management lives in Settings. Connection details: `docs/agent-integration.md`.

The dark theme follows the actual Spatial-RAG file: #000000 background, white text and gray elements. The light theme keeps its green accent.

The implementer selected the stack within the task; the first version serves one owner on a personal VPS.
