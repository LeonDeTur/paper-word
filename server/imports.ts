import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, fetchArticle, limitBlocks, parseFile } from "./content.ts";
import type { Store } from "./store.ts";
import type { Article } from "../src/types.ts";

export const blockInput = z.object({
  kind: z.enum(["paragraph", "heading", "figure"]).default("paragraph"),
  text: z.string().trim().min(1).max(50_000),
  ru: z.string().max(60_000).default(""),
});
export const metadataInput = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  source_url: z
    .url()
    .max(3000)
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export const agentArticleInput = metadataInput.extend({
  external_id: z.string().trim().min(1).max(200),
  content: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("html"),
      html: z.string().min(1).max(1_500_000),
    }),
    z.object({ type: z.literal("url"), url: z.url().max(3000) }),
    z.object({
      type: z.literal("blocks"),
      blocks: z.array(blockInput).min(1).max(2500),
      dictionary: z
        .record(z.string().min(1).max(160), z.string().max(500))
        .default({}),
    }),
  ]),
});
export type ImportMetadata = z.infer<typeof metadataInput>;
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function articleReceipt(article: Article, duplicate = false) {
  return {
    id: article.id,
    title: article.title,
    source_url: article.source_url,
    tags: article.tags,
    blocks: article.blocks.length,
    translated_blocks: article.blocks.filter((b) => b.ru).length,
    duplicate,
    reader_path: `/#article/${article.id}`,
  };
}
export function createImports(store: Store, fetchSource = fetchArticle) {
  const { db } = store;
  type Actor = { tokenId: string; externalId: string; requestHash: string };
  function replay(actor: Actor) {
    const row = db
      .prepare(
        "SELECT request_hash,article_id FROM agent_imports WHERE token_id=? AND external_id=?",
      )
      .get(actor.tokenId, actor.externalId) as
      { request_hash: string; article_id: string } | undefined;
    if (!row) return;
    if (row.request_hash !== actor.requestHash)
      throw new AppError(
        409,
        "external_id уже использован для другого содержимого. Используйте новый идентификатор.",
      );
    const article = store.article(row.article_id);
    return article ? { article, duplicate: true } : undefined;
  }
  function saveParsed(
    parsed: Awaited<ReturnType<typeof parseFile>>,
    original: Buffer | null,
    filename: string,
    metadata: Partial<ImportMetadata> = {},
    actor?: Actor,
  ) {
    const identity = `sha256:${sha(original || stable({ blocks: parsed.blocks, dictionary: parsed.dictionary }))}`;
    return store.transaction(() => {
      if (actor) {
        const existing = replay(actor);
        if (existing) return existing;
      }
      const same = db
        .prepare("SELECT article_id FROM import_identities WHERE identity=?")
        .get(identity) as { article_id: string } | undefined;
      let id = same?.article_id;
      const duplicate = Boolean(id);
      if (!id) {
        id = randomUUID();
        db.prepare(
          "INSERT INTO articles(id,title,source_url,tags,created_at,blocks,dictionary,original,original_mime,original_name) VALUES(?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id,
          metadata.title || parsed.title,
          metadata.source_url || "",
          JSON.stringify(metadata.tags || []),
          new Date().toISOString(),
          JSON.stringify(parsed.blocks),
          JSON.stringify(parsed.dictionary),
          original,
          parsed.mime,
          filename,
        );
        db.prepare(
          "INSERT INTO import_identities(identity,article_id) VALUES(?,?)",
        ).run(identity, id);
      }
      if (actor)
        db.prepare(
          "INSERT INTO agent_imports(token_id,external_id,request_hash,article_id,created_at) VALUES(?,?,?,?,?)",
        ).run(
          actor.tokenId,
          actor.externalId,
          actor.requestHash,
          id,
          new Date().toISOString(),
        );
      return { article: store.article(id)!, duplicate };
    });
  }
  async function fromFile(
    buffer: Buffer,
    filename: string,
    rawMetadata: unknown,
    tokenId: string,
  ) {
    const input = metadataInput
      .extend({ external_id: z.string().trim().min(1).max(200) })
      .parse(rawMetadata);
    const actor = {
      tokenId,
      externalId: input.external_id,
      requestHash: sha(stable(input) + sha(buffer)),
    };
    const previous = replay(actor);
    if (previous) return previous;
    return saveParsed(
      await parseFile(buffer, filename),
      buffer,
      filename,
      input,
      actor,
    );
  }
  async function fromJson(raw: unknown, tokenId: string) {
    const input = agentArticleInput.parse(raw);
    const actor = {
      tokenId,
      externalId: input.external_id,
      requestHash: sha(stable(input)),
    };
    const previous = replay(actor);
    if (previous) return previous;
    if (input.content.type === "html") {
      const buffer = Buffer.from(input.content.html);
      return saveParsed(
        await parseFile(buffer, "article.html"),
        buffer,
        "article.html",
        input,
        actor,
      );
    }
    if (input.content.type === "url") {
      const file = await fetchSource(input.content.url);
      return saveParsed(
        await parseFile(file.buffer, file.filename),
        file.buffer,
        file.filename,
        { ...input, source_url: input.source_url || file.url },
        actor,
      );
    }
    const blocks = limitBlocks(
      input.content.blocks.map((b, id) => ({ ...b, id })),
    );
    return saveParsed(
      {
        title: input.title || "Статья от агента",
        blocks,
        dictionary: input.content.dictionary,
        mime: "application/json",
      },
      null,
      "",
      input,
      actor,
    );
  }
  return { saveParsed, fromFile, fromJson };
}
