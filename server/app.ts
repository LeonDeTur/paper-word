import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import {
  randomBytes,
  createHash,
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import {
  AppError,
  fetchArticle,
  fetchPreparedFile,
  parseFile,
  limitBlocks,
} from "./content.ts";
import { createStore } from "./store.ts";
import { listModels, type AIConfig } from "./ai.ts";
import { agentRoutes } from "./agent-routes.ts";
import { createOAuth } from "./oauth.ts";
import { createLibraryService } from "./library-service.ts";
import { AGENT_SCOPES } from "../src/agent-scopes.ts";
import { VERSION } from "../src/version.ts";

export type AppOptions = {
  dbPath: string;
  password?: string;
  origin?: string;
  production?: boolean;
  ai?: Partial<AIConfig>;
  fetchSource?: typeof fetchArticle;
  fetchAttachment?: typeof fetchPreparedFile;
};

export function createApp(options: AppOptions) {
  if (
    options.production &&
    (!options.password ||
      options.password.length < 12 ||
      !options.origin?.startsWith("https://"))
  ) {
    throw new Error(
      "Production requires APP_PASSWORD (at least 12 characters) and an HTTPS APP_ORIGIN.",
    );
  }
  const app = express();
  const store = createStore(options.dbPath);
  const { db } = store;
  const passwordSalt = randomBytes(32);
  const passwordHash = options.password
    ? scryptSync(options.password, passwordSalt, 64)
    : null;
  const sessionKey = createHash("sha256")
    .update(options.password || "local")
    .digest();
  const sessionHash = (token: string) =>
    createHmac("sha256", sessionKey).update(token).digest("hex");
  const aiConfig = (): AIConfig => ({
    baseUrl: options.ai?.baseUrl || "http://127.0.0.1:11434/v1",
    apiKey: options.ai?.apiKey || "",
    model:
      (
        db.prepare("SELECT value FROM settings WHERE key='ai_model'").get() as
          { value: string } | undefined
      )?.value ||
      options.ai?.model ||
      "",
  });
  app.disable("x-powered-by");
  if (options.production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: options.production ? [] : null,
        },
      },
      strictTransportSecurity: options.production ? undefined : false,
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a minute." },
    }),
  );
  app.use(
    "/mcp",
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const oauth = createOAuth(
    store,
    options.origin,
    Boolean(passwordHash),
    options.production,
  );
  app.use(oauth.router);
  const library = createLibraryService(store, aiConfig);
  const agents = agentRoutes(
    store,
    options.origin,
    options.fetchSource,
    oauth,
    options.fetchAttachment,
    library,
  );
  app.use((req, res, next) => {
    if (
      req.path === "/mcp" ||
      req.path.startsWith("/mcp/") ||
      req.path === "/api/agent" ||
      req.path.startsWith("/api/agent/")
    )
      return agents.router(req, res, next);
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.get("X-Paperword") !== "1")
        return next(
          new AppError(
            403,
            "The request failed the origin check. Refresh the page.",
          ),
        );
      const origin = req.get("origin");
      const allowed = options.origin || [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ];
      if (
        origin &&
        !(Array.isArray(allowed)
          ? allowed.includes(origin)
          : origin === allowed)
      )
        return next(new AppError(403, "The request origin is not allowed."));
    }
    next();
  });
  function authenticated(req: express.Request) {
    if (!passwordHash) return true;
    const token = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("paperword_session="))
      ?.slice("paperword_session=".length);
    return Boolean(
      token &&
      db
        .prepare("SELECT hash FROM sessions WHERE hash=? AND expires>?")
        .get(sessionHash(token), Date.now()),
    );
  }
  app.get("/api/config", (req, res) => {
    const auth = authenticated(req);
    res.set("Cache-Control", "no-store").json({
      authenticated: auth,
      version: VERSION,
      password_required: Boolean(passwordHash),
      ai_configured: auth && Boolean(aiConfig().model),
      ai_model: auth ? aiConfig().model : "",
      ai_host: auth ? new URL(aiConfig().baseUrl).host : "",
    });
  });
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      message: {
        error: "Too many sign-in attempts. Try again in 15 minutes.",
      },
    }),
    (req, res) => {
      const { password } = z
        .object({ password: z.string().max(1000) })
        .parse(req.body);
      if (
        passwordHash &&
        !timingSafeEqual(passwordHash, scryptSync(password, passwordSalt, 64))
      )
        throw new AppError(401, "Incorrect password.");
      const token = randomBytes(32).toString("hex");
      const ttl = 30 * 86_400_000;
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO sessions(hash,expires) VALUES(?,?)").run(
        sessionHash(token),
        Date.now() + ttl,
      );
      res.cookie("paperword_session", token, {
        httpOnly: true,
        secure: Boolean(options.production),
        sameSite: "strict",
        maxAge: ttl,
        path: "/",
      });
      res.json({ ok: true });
    },
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!authenticated(req))
      return next(new AppError(401, "Sign in to your personal library."));
    next();
  });
  app.post("/api/logout", (req, res) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith("paperword_session="))
      ?.slice("paperword_session=".length);
    if (token)
      db.prepare("DELETE FROM sessions WHERE hash=?").run(sessionHash(token));
    res
      .clearCookie("paperword_session", {
        path: "/",
        httpOnly: true,
        secure: Boolean(options.production),
        sameSite: "strict",
      })
      .json({ ok: true });
  });
  app.get("/api/agent-tokens", (_req, res) => res.json(agents.access.list()));
  app.get("/api/chatgpt/config", (_req, res) =>
    res.json({
      enabled: oauth.enabled,
      mcp_url: oauth.resource,
      metadata_url: oauth.metadataUrl,
      scope: "articles:import",
      scopes: AGENT_SCOPES,
      version: VERSION,
    }),
  );
  app.get("/api/oauth/requests/:id", (req, res) =>
    res.json(oauth.consentDetails(String(req.params.id), req.headers.cookie)),
  );
  app.post("/api/oauth/requests/:id/decision", (req, res) => {
    const { allow, scopes } = z
      .object({
        allow: z.boolean(),
        scopes: z
          .array(z.enum(AGENT_SCOPES))
          .min(1)
          .max(AGENT_SCOPES.length)
          .optional(),
      })
      .parse(req.body);
    res.json(
      oauth.decide(String(req.params.id), allow, req.headers.cookie, scopes),
    );
  });
  app.post("/api/agent-tokens", (req, res) =>
    res.status(201).json(agents.access.issue(req.body)),
  );
  app.post("/api/agent-tokens/:id/revoke", (req, res) => {
    agents.access.revoke(String(req.params.id));
    res.json({ ok: true });
  });
  app.get("/api/articles", (_req, res) => res.json(store.articles()));
  function insertArticle(
    parsed: Awaited<ReturnType<typeof parseFile>>,
    original: Buffer | null,
    filename: string,
    source = "",
    title = "",
  ) {
    return agents.imports.saveParsed(parsed, original, filename, {
      ...(source ? { source_url: source } : {}),
      ...(title ? { title } : {}),
    }).article;
  }
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
      files: 1,
      fields: 5,
      fieldSize: 1000,
    },
  });
  app.post("/api/import/file", upload.single("file"), async (req, res) => {
    if (!req.file) throw new AppError(422, "Choose a file to upload.");
    const parsed = await parseFile(req.file.buffer, req.file.originalname);
    res
      .status(201)
      .json(insertArticle(parsed, req.file.buffer, req.file.originalname));
  });
  app.post("/api/import/url", async (req, res) => {
    const { url } = z
      .object({ url: z.string().url().max(3000) })
      .parse(req.body);
    const file = await (options.fetchSource || fetchArticle)(url);
    const parsed = await parseFile(file.buffer, file.filename);
    res
      .status(201)
      .json(insertArticle(parsed, file.buffer, file.filename, file.url));
  });
  app.post("/api/import/text", (req, res) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(500),
        text: z.string().trim().min(1).max(500_000),
      })
      .parse(req.body);
    const blocks = limitBlocks(
      input.text
        .split(/\n\s*\n/)
        .filter((t) => t.trim())
        .map((text, id) => ({
          id,
          kind: "paragraph" as const,
          text: text.trim(),
          ru: "",
        })),
    );
    res
      .status(201)
      .json(
        insertArticle(
          { title: input.title, blocks, dictionary: {}, mime: "text/plain" },
          null,
          "",
          "",
          input.title,
        ),
      );
  });
  app.get("/api/articles/:id", (req, res) =>
    res.json(library.findArticle(String(req.params.id))),
  );
  app.patch("/api/articles/:id", (req, res) => {
    res.json(library.updateArticle(String(req.params.id), req.body));
  });
  app.patch("/api/articles/:id/blocks/:block", (req, res) => {
    res.json(
      library.updateBlock(
        String(req.params.id),
        Number(req.params.block),
        req.body,
      ),
    );
  });
  app.get("/api/articles/:id/original", (req, res) => {
    library.findArticle(String(req.params.id));
    const row = db
      .prepare("SELECT original,original_name FROM articles WHERE id=?")
      .get(String(req.params.id)) as any;
    if (!row.original)
      throw new AppError(404, "The original file was not saved.");
    res.set("Content-Type", "application/octet-stream");
    res
      .attachment(row.original_name.replace(/[^\w.-]/g, "_") || "article.html")
      .send(Buffer.from(row.original));
  });
  app.delete("/api/articles/:id", (req, res) => {
    res.json(library.deleteArticle(String(req.params.id)));
  });
  app.post("/api/articles/:id/translate", (req, res) => {
    res.status(202).json(library.startTranslation(String(req.params.id)));
  });
  app.post("/api/articles/:id/cancel", (req, res) => {
    res.json(library.cancelTranslation(String(req.params.id)));
  });
  app.post(
    "/api/words/suggest",
    rateLimit({ windowMs: 60_000, limit: 20 }),
    async (req, res) => {
      res.json(await library.suggestWord(req.body));
    },
  );
  app.get("/api/cards", (_req, res) => res.json(store.cards()));
  app.post("/api/cards", (req, res) => {
    res.status(201).json(library.createCard(req.body));
  });
  app.patch("/api/cards/:id", (req, res) => {
    res.json(library.updateCard(String(req.params.id), req.body));
  });
  app.delete("/api/cards/:id", (req, res) => {
    res.json(library.deleteCard(String(req.params.id)));
  });
  app.get("/api/reviews", (req, res) => {
    res.json(library.listReviews(req.query.direction));
  });
  app.post("/api/cards/:id/review", (req, res) => {
    res.json(library.reviewCard(String(req.params.id), req.body));
  });
  app.get("/api/stats", (_req, res) => {
    res.json(library.stats());
  });
  app.get("/api/models", async (_req, res) =>
    res.json({ models: await listModels(aiConfig()) }),
  );
  app.put("/api/settings/model", (req, res) => {
    const { model } = z
      .object({ model: z.string().trim().min(1).max(160) })
      .parse(req.body);
    if (store.articles().some((a) => a.job_state === "running"))
      throw new AppError(
        409,
        "Wait for translation to finish before changing the model.",
      );
    db.prepare(
      "INSERT INTO settings(key,value) VALUES('ai_model',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    ).run(model);
    res.json({ ok: true });
  });
  app.get("/api/export", (_req, res) => {
    res
      .attachment(`paperword-${new Date().toISOString().slice(0, 10)}.json`)
      .json({
        version: 1,
        exported_at: new Date().toISOString(),
        articles: store.articles(),
        cards: store.cards(),
        reviews: db
          .prepare("SELECT card_id,direction,rating,reviewed_at FROM reviews")
          .all(),
      });
  });
  app.use("/api", (_req, _res, next) =>
    next(new AppError(404, "Action not found.")),
  );
  function errorHandler(
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) {
    if (error instanceof z.ZodError)
      return res.status(422).json({
        error: "Check the form fields.",
        fields: error.issues.map((i) => i.path.join(".")),
      });
    if (error instanceof multer.MulterError)
      return res.status(413).json({
        error: "Upload failed. Choose one file up to 15 MB.",
      });
    if (error instanceof AppError)
      return res.status(error.status).json({ error: error.message });
    if (
      error instanceof SyntaxError ||
      (typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.too.large")
    )
      return res.status(400).json({ error: "Invalid or oversized request." });
    console.error(
      "Request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    res.status(500).json({ error: "The action failed. Please try again." });
  }
  app.use(errorHandler);
  return { app, store };
}
