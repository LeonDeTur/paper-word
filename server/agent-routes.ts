import express from "express";
import multer from "multer";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AppError } from "./content.ts";
import { createAgentAccess } from "./agent-access.ts";
import { createImports, articleReceipt } from "./imports.ts";
import { createAgentMcp } from "./mcp-tools.ts";
import type { Store } from "./store.ts";
import type { fetchArticle } from "./content.ts";
import { fetchPreparedFile } from "./content.ts";
import { chatgptFileInput } from "./mcp-tools.ts";
import type { createOAuth } from "./oauth.ts";

export function agentRoutes(
  store: Store,
  origin?: string,
  fetchSource?: typeof fetchArticle,
  oauth?: ReturnType<typeof createOAuth>,
  fetchAttachment = fetchPreparedFile,
) {
  const access = createAgentAccess(store, oauth);
  const imports = createImports(store, fetchSource);
  const router = express.Router();
  router.use(access.authenticate);
  router.use((req, _res, next) => {
    const received = req.get("Origin");
    const allowed = origin
      ? [origin]
      : [
          "http://localhost:3001",
          "http://127.0.0.1:3001",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ];
    if (received && !allowed.includes(received))
      return next(new AppError(403, "Источник запроса не разрешён."));
    next();
  });
  router.use(express.json({ limit: "2mb" }));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 1,
      fields: 5,
      fieldSize: 3000,
    },
  });
  function getReceipt(tokenId: string, id: string) {
    const allowed = store.db
      .prepare(
        "SELECT article_id FROM agent_imports WHERE token_id=? AND article_id=?",
      )
      .get(tokenId, id);
    const article = allowed ? store.article(id) : undefined;
    if (!article)
      throw new AppError(404, "Этот импорт не найден для вашего агента.");
    return receipt(articleReceipt(article));
  }
  function receipt<T extends { reader_path: string }>(value: T) {
    return {
      ...value,
      ...(origin
        ? { reader_url: new URL(value.reader_path, origin).href }
        : {}),
    };
  }
  async function importFile(raw: unknown, tokenId: string) {
    const input = chatgptFileInput.parse(raw);
    const file = await fetchAttachment(input.file.download_url);
    const name = input.file.file_name?.split(/[\\/]/).pop() || file.filename;
    const result = await imports.fromFile(
      file.buffer,
      name,
      {
        external_id: input.external_id,
        title: input.title,
        source_url: input.source_url,
        tags: input.tags,
      },
      tokenId,
    );
    return receipt(articleReceipt(result.article, result.duplicate));
  }
  router.post("/api/agent/articles/chatgpt-file", async (req, res) =>
    res.json(await importFile(req.body, res.locals.agentTokenId)),
  );
  router.get("/api/agent/status", (_req, res) =>
    res.json({ ok: true, scope: "articles:import", mcp_path: "/mcp" }),
  );
  router.post("/api/agent/articles", async (req, res) => {
    const result = await imports.fromJson(req.body, res.locals.agentTokenId);
    res
      .status(result.duplicate ? 200 : 201)
      .json(articleReceipt(result.article, result.duplicate));
  });
  router.post(
    "/api/agent/articles/file",
    upload.single("file"),
    async (req, res) => {
      if (!req.file) throw new AppError(422, "Выберите файл.");
      let tags: unknown = [];
      try {
        tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      } catch {
        throw new AppError(422, "tags должен быть JSON-массивом строк.");
      }
      const result = await imports.fromFile(
        req.file.buffer,
        req.file.originalname,
        {
          external_id: req.body.external_id,
          title: req.body.title,
          source_url: req.body.source_url,
          tags,
        },
        res.locals.agentTokenId,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json(articleReceipt(result.article, result.duplicate));
    },
  );
  router.get("/api/agent/articles/:id", (req, res) =>
    res.json(getReceipt(res.locals.agentTokenId, String(req.params.id))),
  );
  router.post("/mcp", async (req, res, next) => {
    const tokenId = res.locals.agentTokenId as string;
    const server = createAgentMcp({
      importArticle: async (input) => {
        const result = await imports.fromJson(input, tokenId);
        return receipt(articleReceipt(result.article, result.duplicate));
      },
      importFile: async (input) => importFile(input, tokenId),
      getArticle: async (id) => getReceipt(tokenId, id),
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) next(error);
    }
  });
  router.all("/mcp", (_req, res) =>
    res
      .status(405)
      .set("Allow", "POST")
      .json({ error: "Используйте POST для stateless Streamable HTTP MCP." }),
  );
  router.use((_req, _res, next) =>
    next(new AppError(404, "Действие агента не найдено.")),
  );
  return { router, access, imports };
}
