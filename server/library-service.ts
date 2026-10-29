import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "./content.ts";
import { normalizeLemma, scheduleReview } from "./scheduler.ts";
import {
  completeJSON,
  translationSchema,
  wordSchema,
  type AIConfig,
} from "./ai.ts";
import type { Article, Schedule } from "../src/types.ts";
import type { Store } from "./store.ts";
const idSchema = z.string().uuid();
const cardInput = z.object({
  lemma: z.string().trim().min(1).max(160),
  translation: z.string().trim().min(1).max(1000),
  source_form: z.string().trim().max(160).default(""),
  context: z.string().max(50_000).default(""),
  notes: z.string().max(3000).default(""),
  article_id: idSchema.nullable().default(null),
  block_id: z.number().int().nonnegative().default(0),
});

export function createLibraryService(store: Store, aiConfig: () => AIConfig) {
  const { db } = store;
  function findArticle(id: string) {
    const article = store.article(idSchema.parse(id));
    if (!article) throw new AppError(404, "Article not found.");
    return article;
  }
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
            "The model returned mismatched blocks. Completed translations have been saved.",
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
          : "Translation was interrupted. Completed blocks have been saved.",
        article.id,
      );
    } finally {
      cancelled.delete(article.id);
    }
  }
  function updateArticle(articleId: string, raw: unknown) {
    const article = findArticle(String(articleId));
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
      .parse(raw);
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
    return store.article(article.id);
  }

  function updateBlock(articleId: string, blockId: number, raw: unknown) {
    const article = findArticle(String(articleId));
    const block = article.blocks.find((b) => b.id === Number(blockId));
    if (!block) throw new AppError(404, "Block not found.");
    if (article.job_state === "running")
      throw new AppError(409, "Wait for automatic translation to finish.");
    const input = z
      .object({
        ru: z.string().trim().max(60_000),
        expected_ru: z.string().max(60_000).optional(),
      })
      .parse(raw);
    if (input.expected_ru !== undefined && block.ru !== input.expected_ru)
      throw new AppError(
        409,
        "The translation has changed. Read the block again.",
      );
    block.ru = input.ru;
    db.prepare("UPDATE articles SET blocks=? WHERE id=?").run(
      JSON.stringify(article.blocks),
      article.id,
    );
    return store.article(article.id);
  }

  function deleteArticle(articleId: string) {
    const article = findArticle(String(articleId));
    if (article.job_state === "running")
      throw new AppError(409, "Stop translation before deleting the article.");
    db.prepare("DELETE FROM articles WHERE id=?").run(article.id);
    return { ok: true };
  }

  function startTranslation(articleId: string) {
    const article = findArticle(String(articleId));
    if (!aiConfig().model)
      throw new AppError(503, "Select a model in Settings.");
    if (store.articles().some((a) => a.job_state === "running"))
      throw new AppError(
        409,
        "Another article is being translated. Wait for it to finish.",
      );
    if (
      article.blocks.some(
        (b) => !b.ru && b.kind !== "figure" && b.text.length > 12_000,
      )
    )
      throw new AppError(
        422,
        "A block exceeds 12,000 characters. Split it before translation.",
      );
    db.prepare(
      "UPDATE articles SET job_state='running',job_error='' WHERE id=?",
    ).run(article.id);
    void translate(article);
    return store.article(article.id);
  }

  function cancelTranslation(articleId: string) {
    const a = findArticle(String(articleId));
    if (a.job_state === "running") cancelled.add(a.id);
    return { ok: true };
  }

  function createCard(raw: unknown) {
    const input = cardInput.parse(raw);
    if (
      input.article_id &&
      !findArticle(input.article_id).blocks.some((b) => b.id === input.block_id)
    )
      throw new AppError(
        422,
        "The card's source block was not found in the article.",
      );
    const normalized = normalizeLemma(input.lemma);
    if (db.prepare("SELECT id FROM cards WHERE normalized=?").get(normalized))
      throw new AppError(409, "This word or phrase has already been added.");
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
    return store.cards().find((c) => c.id === id);
  }

  function updateCard(articleId: string, raw: unknown) {
    const id = idSchema.parse(articleId);
    const existing = store.cards().find((c) => c.id === id);
    if (!existing) throw new AppError(404, "Card not found.");
    const input = cardInput.parse({
      ...existing,
      ...z.record(z.string(), z.unknown()).parse(raw),
    });
    if (
      input.article_id &&
      !findArticle(input.article_id).blocks.some((b) => b.id === input.block_id)
    )
      throw new AppError(
        422,
        "The card's source block was not found in the article.",
      );
    const normalized = normalizeLemma(input.lemma);
    if (
      db
        .prepare("SELECT id FROM cards WHERE normalized=? AND id<>?")
        .get(normalized, id)
    )
      throw new AppError(409, "This word or phrase has already been added.");
    db.prepare(
      "UPDATE cards SET lemma=?,normalized=?,translation=?,notes=?,source_form=?,context=?,article_id=?,block_id=? WHERE id=?",
    ).run(
      input.lemma.normalize("NFKC").replace(/\s+/g, " ").trim(),
      normalized,
      input.translation,
      input.notes,
      input.source_form,
      input.context,
      input.article_id,
      input.block_id,
      id,
    );
    return store.cards().find((c) => c.id === id);
  }

  function deleteCard(articleId: string) {
    db.prepare("DELETE FROM cards WHERE id=?").run(idSchema.parse(articleId));
    return { ok: true };
  }

  function listReviews(directionArg: unknown = "all") {
    const direction = z
      .enum(["en-ru", "ru-en", "all"])
      .parse(directionArg || "all");
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
    return result.sort((a, b) => a.due_at.localeCompare(b.due_at));
  }

  function reviewCard(articleId: string, raw: unknown) {
    const id = idSchema.parse(articleId);
    const input = z
      .object({
        direction: z.enum(["en-ru", "ru-en"]),
        rating: z.enum(["again", "hard", "good", "easy"]),
        expected_due_at: z.string().datetime(),
      })
      .parse(raw);
    const previous = db
      .prepare(
        "SELECT direction,due_at,interval_days,ease,reps,lapses FROM schedules WHERE card_id=? AND direction=?",
      )
      .get(id, input.direction) as Schedule | undefined;
    if (!previous) throw new AppError(404, "Card not found.");
    if (previous.due_at !== input.expected_due_at)
      throw new AppError(
        409,
        "This review was already saved on another screen. Refresh the queue.",
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
    return next;
  }

  function stats() {
    const cards = store.cards();
    const now = new Date();
    return {
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
    };
  }

  async function suggestWord(raw: unknown) {
    const input = z
      .object({
        term: z.string().trim().min(1).max(160),
        context: z.string().max(50_000).default(""),
      })
      .parse(raw);
    const result = await completeJSON(
      aiConfig(),
      'You are an English-Russian lexicographer. Given a selected word or expression and its sentence, return {"lemma":"canonical English base form","translation":"concise Russian meaning in this context"}. Use infinitive without to for verbs, singular for nouns. For phrases normalize inflected verbs but keep the whole idiom. Do not return example sentences or instructions.',
      input,
      wordSchema,
    );
    const existing = db
      .prepare("SELECT id,lemma FROM cards WHERE normalized=?")
      .get(normalizeLemma(result.lemma));
    return { ...result, existing: existing || null };
  }
  return {
    findArticle,
    updateArticle,
    updateBlock,
    deleteArticle,
    startTranslation,
    cancelTranslation,
    createCard,
    updateCard,
    deleteCard,
    listReviews,
    reviewCard,
    stats,
    suggestWord,
  };
}
export type LibraryService = ReturnType<typeof createLibraryService>;
