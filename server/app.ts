import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import {
  randomBytes,
  randomUUID,
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
import { normalizeLemma, scheduleReview } from "./scheduler.ts";
import {
  completeJSON,
  listModels,
  translationSchema,
  wordSchema,
  type AIConfig,
} from "./ai.ts";
import type { Article, Schedule, Direction } from "../src/types.ts";
import { agentRoutes } from "./agent-routes.ts";
import { createOAuth } from "./oauth.ts";
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
const idSchema = z.string().uuid();
const blockSchema = z.object({
  id: z.number().int().nonnegative(),
  kind: z.enum(["paragraph", "heading", "figure"]),
  text: z.string().min(1).max(50_000),
  ru: z.string().max(60_000),
  image: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(3_000_000)
    .optional(),
});
const cardInput = z.object({
  lemma: z.string().trim().min(1).max(160),
  translation: z.string().trim().min(1).max(1000),
  source_form: z.string().trim().max(160).default(""),
  context: z.string().max(50_000).default(""),
  notes: z.string().max(3000).default(""),
  article_id: idSchema.nullable().default(null),
  block_id: z.number().int().nonnegative().default(0),
});

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
      message: { error: "Слишком много запросов. Подождите минуту." },
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
  const agents = agentRoutes(
    store,
    options.origin,
    options.fetchSource,
    oauth,
    options.fetchAttachment,
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
            "Запрос не прошёл проверку источника. Обновите страницу.",
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
        return next(new AppError(403, "Источник запроса не разрешён."));
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
        error: "Слишком много попыток входа. Повторите через 15 минут.",
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
        throw new AppError(401, "Неверный пароль.");
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
      return next(new AppError(401, "Войдите в личную библиотеку."));
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
      version: VERSION,
    }),
  );
  app.get("/api/oauth/requests/:id", (req, res) =>
    res.json(oauth.consentDetails(String(req.params.id), req.headers.cookie)),
  );
  app.post("/api/oauth/requests/:id/decision", (req, res) => {
    const { allow } = z.object({ allow: z.boolean() }).parse(req.body);
    res.json(oauth.decide(String(req.params.id), allow, req.headers.cookie));
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
    if (!req.file) throw new AppError(422, "Выберите файл для загрузки.");
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
  function findArticle(id: string) {
    const article = store.article(idSchema.parse(id));
    if (!article) throw new AppError(404, "Статья не найдена.");
    return article;
  }
  app.get("/api/articles/:id", (req, res) =>
    res.json(findArticle(String(req.params.id))),
  );
  app.patch("/api/articles/:id", (req, res) => {
    const article = findArticle(String(req.params.id));
    const input = z
      .object({
        title: z.string().trim().min(1).max(500).optional(),
        tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        status: z.enum(["inbox", "reading", "done"]).optional(),
        starred: z.boolean().optional(),
        read_block: z
          .number()
          .int()
          .min(0)
          .max(Math.max(0, article.blocks.length - 1))
          .optional(),
      })
      .parse(req.body);
    db.prepare(
      "UPDATE articles SET title=?,tags=?,status=?,starred=?,read_block=? WHERE id=?",
    ).run(
      input.title ?? article.title,
      JSON.stringify(input.tags ?? article.tags),
      input.status ?? article.status,
      Number(input.starred ?? article.starred),
      input.read_block ?? article.read_block,
      article.id,
    );
    res.json(store.article(article.id));
  });
  app.patch("/api/articles/:id/blocks/:block", (req, res) => {
    const article = findArticle(String(req.params.id));
    const block = article.blocks.find((b) => b.id === Number(req.params.block));
    if (!block) throw new AppError(404, "Фрагмент не найден.");
    if (article.job_state === "running")
      throw new AppError(409, "Дождитесь завершения автоматического перевода.");
    block.ru = z
      .object({ ru: z.string().trim().max(60_000) })
      .parse(req.body).ru;
    db.prepare("UPDATE articles SET blocks=? WHERE id=?").run(
      JSON.stringify(article.blocks),
      article.id,
    );
    res.json(store.article(article.id));
  });
  app.get("/api/articles/:id/original", (req, res) => {
    findArticle(String(req.params.id));
    const row = db
      .prepare("SELECT original,original_name FROM articles WHERE id=?")
      .get(String(req.params.id)) as any;
    if (!row.original) throw new AppError(404, "Исходный файл не сохранён.");
    res.set("Content-Type", "application/octet-stream");
    res
      .attachment(row.original_name.replace(/[^\w.\-]/g, "_") || "article.html")
      .send(Buffer.from(row.original));
  });
  app.delete("/api/articles/:id", (req, res) => {
    const article = findArticle(String(req.params.id));
    if (article.job_state === "running")
      throw new AppError(409, "Остановите перевод перед удалением статьи.");
    db.prepare("DELETE FROM articles WHERE id=?").run(article.id);
    res.json({ ok: true });
  });
  const cancelled = new Set<string>();
  async function translate(article: Article) {
    try {
      const pending = article.blocks.filter(
        (b) => !b.ru && b.kind !== "figure",
      );
      for (const block of pending) {
        if (cancelled.has(article.id)) break;
        const result = await completeJSON(
          aiConfig(),
          'Translate the supplied English article fragment into accurate Russian, preserving meaning, technical terms, references and formulas. Return {"translations":[{"id":the supplied id,"ru":"Russian translation"}]}. Do not summarize or omit content.',
          [{ id: block.id, text: block.text }],
          translationSchema,
        );
        if (
          result.translations.length !== 1 ||
          result.translations[0].id !== block.id
        )
          throw new AppError(
            502,
            "Модель перепутала фрагменты. Уже готовые переводы сохранены.",
          );
        const latest = store.article(article.id)!;
        latest.blocks.find((b) => b.id === block.id)!.ru =
          result.translations[0].ru;
        db.prepare("UPDATE articles SET blocks=? WHERE id=?").run(
          JSON.stringify(latest.blocks),
          article.id,
        );
      }
      db.prepare(
        "UPDATE articles SET job_state='idle',job_error='' WHERE id=?",
      ).run(article.id);
    } catch (error) {
      db.prepare(
        "UPDATE articles SET job_state='error',job_error=? WHERE id=?",
      ).run(
        error instanceof AppError
          ? error.message
          : "Перевод прервался. Готовые фрагменты сохранены.",
        article.id,
      );
    } finally {
      cancelled.delete(article.id);
    }
  }
  app.post("/api/articles/:id/translate", (req, res) => {
    const article = findArticle(String(req.params.id));
    if (!aiConfig().model)
      throw new AppError(503, "Выберите модель в настройках.");
    if (store.articles().some((a) => a.job_state === "running"))
      throw new AppError(
        409,
        "Сейчас переводится другая статья. Дождитесь завершения.",
      );
    if (
      article.blocks.some(
        (b) => !b.ru && b.kind !== "figure" && b.text.length > 12_000,
      )
    )
      throw new AppError(
        422,
        "Есть слишком длинный фрагмент (больше 12 000 символов). Разделите его перед переводом.",
      );
    db.prepare(
      "UPDATE articles SET job_state='running',job_error='' WHERE id=?",
    ).run(article.id);
    void translate(article);
    res.status(202).json(store.article(article.id));
  });
  app.post("/api/articles/:id/cancel", (req, res) => {
    const a = findArticle(String(req.params.id));
    if (a.job_state === "running") cancelled.add(a.id);
    res.json({ ok: true });
  });
  app.post(
    "/api/words/suggest",
    rateLimit({ windowMs: 60_000, limit: 20 }),
    async (req, res) => {
      const input = z
        .object({
          term: z.string().trim().min(1).max(160),
          context: z.string().max(50_000).default(""),
        })
        .parse(req.body);
      const result = await completeJSON(
        aiConfig(),
        'You are an English-Russian lexicographer. Given a selected word or expression and its sentence, return {"lemma":"canonical English base form","translation":"concise Russian meaning in this context"}. Use infinitive without to for verbs, singular for nouns. For phrases normalize inflected verbs but keep the whole idiom. Do not return example sentences or instructions.',
        input,
        wordSchema,
      );
      const existing = db
        .prepare("SELECT id,lemma FROM cards WHERE normalized=?")
        .get(normalizeLemma(result.lemma));
      res.json({ ...result, existing: existing || null });
    },
  );
  app.get("/api/cards", (_req, res) => res.json(store.cards()));
  app.post("/api/cards", (req, res) => {
    const input = cardInput.parse(req.body);
    if (input.article_id) findArticle(input.article_id);
    const normalized = normalizeLemma(input.lemma);
    if (db.prepare("SELECT id FROM cards WHERE normalized=?").get(normalized))
      throw new AppError(409, "Это слово или выражение уже добавлено.");
    const id = randomUUID();
    const now = new Date().toISOString();
    store.transaction(() => {
      db.prepare(
        "INSERT INTO cards(id,article_id,block_id,lemma,normalized,source_form,translation,context,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        input.article_id,
        input.block_id,
        input.lemma.normalize("NFKC").replace(/\s+/g, " ").trim(),
        normalized,
        input.source_form,
        input.translation,
        input.context,
        input.notes,
        now,
      );
      for (const direction of ["en-ru", "ru-en"])
        db.prepare(
          "INSERT INTO schedules(card_id,direction,due_at) VALUES(?,?,?)",
        ).run(id, direction, now);
    });
    res.status(201).json(store.cards().find((c) => c.id === id));
  });
  app.patch("/api/cards/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const existing = store.cards().find((c) => c.id === id);
    if (!existing) throw new AppError(404, "Карточка не найдена.");
    const input = cardInput.parse({ ...existing, ...req.body });
    if (input.article_id) findArticle(input.article_id);
    const normalized = normalizeLemma(input.lemma);
    if (
      db
        .prepare("SELECT id FROM cards WHERE normalized=? AND id<>?")
        .get(normalized, id)
    )
      throw new AppError(409, "Это слово или выражение уже добавлено.");
    db.prepare(
      "UPDATE cards SET lemma=?,normalized=?,translation=?,notes=? WHERE id=?",
    ).run(
      input.lemma.normalize("NFKC").replace(/\s+/g, " ").trim(),
      normalized,
      input.translation,
      input.notes,
      id,
    );
    res.json(store.cards().find((c) => c.id === id));
  });
  app.delete("/api/cards/:id", (req, res) => {
    db.prepare("DELETE FROM cards WHERE id=?").run(
      idSchema.parse(req.params.id),
    );
    res.json({ ok: true });
  });
  app.get("/api/reviews", (req, res) => {
    const direction = z
      .enum(["en-ru", "ru-en", "all"])
      .parse(req.query.direction || "all");
    const now = new Date().toISOString();
    const result = store
      .cards()
      .flatMap((c) =>
        c.schedules
          .filter(
            (s) =>
              s.due_at <= now &&
              (direction === "all" || s.direction === direction),
          )
          .map((s) => ({ ...c, direction: s.direction, due_at: s.due_at })),
      );
    res.json(result.sort((a, b) => a.due_at.localeCompare(b.due_at)));
  });
  app.post("/api/cards/:id/review", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const input = z
      .object({
        direction: z.enum(["en-ru", "ru-en"]),
        rating: z.enum(["again", "hard", "good", "easy"]),
        expected_due_at: z.string().datetime(),
      })
      .parse(req.body);
    const previous = db
      .prepare(
        "SELECT direction,due_at,interval_days,ease,reps,lapses FROM schedules WHERE card_id=? AND direction=?",
      )
      .get(id, input.direction) as Schedule | undefined;
    if (!previous) throw new AppError(404, "Карточка не найдена.");
    if (previous.due_at !== input.expected_due_at)
      throw new AppError(
        409,
        "Ответ уже сохранён на другом экране. Обновите очередь.",
      );
    const next = scheduleReview(previous, input.rating);
    store.transaction(() => {
      db.prepare(
        "UPDATE schedules SET due_at=?,interval_days=?,ease=?,reps=?,lapses=? WHERE card_id=? AND direction=?",
      ).run(
        next.due_at,
        next.interval_days,
        next.ease,
        next.reps,
        next.lapses,
        id,
        input.direction,
      );
      db.prepare(
        "INSERT INTO reviews(card_id,direction,rating,reviewed_at) VALUES(?,?,?,?)",
      ).run(id, input.direction, input.rating, new Date().toISOString());
    });
    res.json(next);
  });
  app.get("/api/stats", (_req, res) => {
    const cards = store.cards();
    const now = new Date();
    res.json({
      articles: store.articles().length,
      words: cards.length,
      due: cards
        .flatMap((c) => c.schedules)
        .filter((s) => s.due_at <= now.toISOString()).length,
      reviews_today: (
        db
          .prepare("SELECT count(*) AS count FROM reviews WHERE reviewed_at>=?")
          .get(new Date(now.getTime() - 86_400_000).toISOString()) as any
      ).count,
    });
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
        "Дождитесь окончания перевода, чтобы сменить модель.",
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
    next(new AppError(404, "Такого действия нет.")),
  );
  function errorHandler(
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) {
    if (error instanceof z.ZodError)
      return res.status(422).json({
        error: "Проверьте заполненные поля.",
        fields: error.issues.map((i) => i.path.join(".")),
      });
    if (error instanceof multer.MulterError)
      return res.status(413).json({
        error:
          "Не удалось загрузить файл. Допускается один файл размером до 15 МБ.",
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
      return res
        .status(400)
        .json({ error: "Некорректный или слишком большой запрос." });
    console.error(
      "Request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    res
      .status(500)
      .json({ error: "Не удалось выполнить действие. Попробуйте ещё раз." });
  }
  app.use(errorHandler);
  return { app, store };
}
