import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, realpath, stat } from "node:fs/promises";
import { resolve, relative, extname, basename, isAbsolute } from "node:path";
import { createAgentMcp } from "./mcp-tools.ts";

const base = (process.env.PAPERWORD_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);
const url = new URL(base);
if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
  throw new Error("PAPERWORD_URL must be an HTTP(S) application URL.");
if (
  url.protocol !== "https:" &&
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
)
  throw new Error("Use HTTPS for a remote PAPERWORD_URL.");
const token = process.env.PAPERWORD_TOKEN;
if (!token) throw new Error("Set PAPERWORD_TOKEN.");
async function request(path: string, body?: unknown) {
  const response = await fetch(`${base}/api/agent${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
const status = (await request("/status")) as { scopes?: string[] };
const server = createAgentMcp({
  management: {
    scopes: status.scopes || ["articles:import"],
    execute: (name, input) =>
      request(`/actions/${encodeURIComponent(name)}`, input),
  },
  importArticle: (input) => request("/articles", input),
  getArticle: (id) => request(`/articles/${encodeURIComponent(id)}`),
});
if (
  process.env.PAPERWORD_IMPORT_DIR &&
  (status.scopes || ["articles:import"]).includes("articles:import")
) {
  const root = await realpath(resolve(process.env.PAPERWORD_IMPORT_DIR));
  server.registerTool(
    "upload_article_file",
    {
      description:
        "Upload a local HTML/PDF/TXT/Markdown file from the configured import directory. The path belongs to the agent machine, not the remote service. Preserves the original file. No model calls. Stable external_id makes retries safe.",
      inputSchema: {
        file_path: z.string().min(1),
        external_id: z.string().min(1).max(200),
        title: z.string().min(1).max(500).optional(),
        source_url: z.url().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const path = await realpath(resolve(root, input.file_path));
        const inside = relative(root, path);
        if (
          inside === ".." ||
          inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
          isAbsolute(inside)
        )
          throw new Error("File must be inside PAPERWORD_IMPORT_DIR.");
        if (
          ![".html", ".htm", ".pdf", ".txt", ".md"].includes(
            extname(path).toLowerCase(),
          )
        )
          throw new Error("Unsupported article format.");
        const info = await stat(path);
        if (!info.isFile() || info.size > 15 * 1024 * 1024)
          throw new Error("Expected an article file up to 15 MB.");
        const bytes = await readFile(path);
        if (bytes.length > 15 * 1024 * 1024)
          throw new Error("File exceeds 15 MB.");
        const form = new FormData();
        form.set("file", new Blob([bytes]), basename(path));
        form.set("external_id", input.external_id);
        if (input.title) form.set("title", input.title);
        if (input.source_url) form.set("source_url", input.source_url);
        const response = await fetch(`${base}/api/agent/articles/file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok)
          throw new Error(data.error || `HTTP ${response.status}`);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: (error as Error).message }],
        };
      }
    },
  );
}
await server.connect(new StdioServerTransport());
