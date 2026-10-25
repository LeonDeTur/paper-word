import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Article, Card, Schedule } from "../src/types.ts";

export function createStore(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (
    Number(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ) > 3
  ) {
    db.close();
    throw new Error("Database schema is newer than this application.");
  }
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inbox', read_block INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0, blocks TEXT NOT NULL, dictionary TEXT NOT NULL DEFAULT '{}',
      job_state TEXT NOT NULL DEFAULT 'idle', job_error TEXT NOT NULL DEFAULT '',
      original BLOB, original_mime TEXT NOT NULL DEFAULT '', original_name TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY, article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
      block_id INTEGER NOT NULL DEFAULT 0, lemma TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
      source_form TEXT NOT NULL DEFAULT '', translation TEXT NOT NULL, context TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedules (
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK(direction IN ('en-ru','ru-en')), due_at TEXT NOT NULL,
      interval_days REAL NOT NULL DEFAULT 0, ease REAL NOT NULL DEFAULT 2.5,
      reps INTEGER NOT NULL DEFAULT 0, lapses INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(card_id, direction)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY, card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
      direction TEXT NOT NULL, rating TEXT NOT NULL, reviewed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS agent_tokens (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT, last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS import_identities (
      identity TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS agent_imports (
      token_id TEXT NOT NULL REFERENCES agent_tokens(id), external_id TEXT NOT NULL,
      request_hash TEXT NOT NULL, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, PRIMARY KEY(token_id,external_id)
    );
    CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, metadata TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_requests (
      id TEXT PRIMARY KEY, client_id TEXT NOT NULL, params TEXT NOT NULL,
      csrf_hash TEXT NOT NULL, expires INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oauth_codes (
      hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, agent_id TEXT NOT NULL REFERENCES agent_tokens(id),
      redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, resource TEXT NOT NULL,
      expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      hash TEXT PRIMARY KEY, kind TEXT NOT NULL, client_id TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agent_tokens(id), resource TEXT NOT NULL,
      expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
    );
    PRAGMA user_version=3;
  `);
  db.prepare(
    "UPDATE articles SET job_state='error', job_error='Перевод прерван перезапуском. Готовые фрагменты сохранены; можно продолжить.' WHERE job_state='running'",
  ).run();
  const articleRow = (row: any): Article => ({
    id: row.id,
    title: row.title,
    source_url: row.source_url,
    tags: JSON.parse(row.tags),
    created_at: row.created_at,
    status: row.status,
    read_block: row.read_block,
    starred: Boolean(row.starred),
    blocks: JSON.parse(row.blocks),
    dictionary: JSON.parse(row.dictionary),
    job_state: row.job_state,
    job_error: row.job_error,
    has_original: Boolean(row.has_original),
  });
  const articleColumns =
    "id,title,source_url,tags,created_at,status,read_block,starred,blocks,dictionary,job_state,job_error,original IS NOT NULL AS has_original";
  function article(id: string) {
    const row = db
      .prepare(`SELECT ${articleColumns} FROM articles WHERE id=?`)
      .get(id);
    return row ? articleRow(row) : undefined;
  }
  function articles() {
    return db
      .prepare(
        `SELECT ${articleColumns} FROM articles ORDER BY starred DESC, created_at DESC`,
      )
      .all()
      .map(articleRow);
  }
  function cards(): Card[] {
    return db
      .prepare(
        "SELECT cards.*, articles.title AS article_title FROM cards LEFT JOIN articles ON articles.id=cards.article_id ORDER BY cards.created_at DESC",
      )
      .all()
      .map((row: any) => ({
        ...row,
        schedules: db
          .prepare(
            "SELECT direction,due_at,interval_days,ease,reps,lapses FROM schedules WHERE card_id=? ORDER BY direction",
          )
          .all(row.id) as Schedule[],
      }));
  }
  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  return { db, article, articles, cards, transaction };
}
export type Store = ReturnType<typeof createStore>;
