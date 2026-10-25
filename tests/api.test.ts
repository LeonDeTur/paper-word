import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.ts";

const headers = { "X-Paperword": "1" };
test("private access, source checks and logout invalidate the actual session", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "test-only-password",
  });
  try {
    await request(app).get("/api/articles").expect(401);
    await request(app)
      .post("/api/login")
      .send({ password: "test-only-password" })
      .expect(403);
    await request(app)
      .post("/api/login")
      .set(headers)
      .send({ password: "wrong" })
      .expect(401);
    await request(app)
      .post("/api/login")
      .set(headers)
      .set("Origin", "https://evil.invalid")
      .send({ password: "test-only-password" })
      .expect(403);
    const login = await request(app)
      .post("/api/login")
      .set(headers)
      .send({ password: "test-only-password" })
      .expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    assert.match(login.headers["set-cookie"][0], /HttpOnly/);
    assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    await request(app).get("/api/articles").set("Cookie", cookie).expect(200);
    await request(app)
      .post("/api/logout")
      .set(headers)
      .set("Cookie", cookie)
      .expect(200);
    await request(app).get("/api/cards").set("Cookie", cookie).expect(401);
  } finally {
    store.db.close();
  }
});

test("imports article; duplicates are blocked; directions persist independently; deletion keeps card context", async () => {
  const { app, store } = createApp({ dbPath: ":memory:" });
  try {
    const imported = await request(app)
      .post("/api/import/file")
      .set(headers)
      .attach(
        "file",
        Buffer.from(
          '<article><h1>Fixture paper</h1><p data-ru="Мы учитываем данные.">We take the data into account.</p></article>',
        ),
        "paper.html",
      )
      .expect(201);
    const article = imported.body;
    const original = await request(app)
      .get(`/api/articles/${article.id}/original`)
      .expect(200);
    assert.match(original.headers["content-disposition"], /attachment/);
    const input = {
      article_id: article.id,
      block_id: 0,
      lemma: "take into account",
      source_form: "takes into account",
      translation: "учитывать",
      context: article.blocks[0].text,
    };
    const saved = await request(app)
      .post("/api/cards")
      .set(headers)
      .send(input)
      .expect(201);
    await request(app)
      .post("/api/cards")
      .set(headers)
      .send({ ...input, lemma: " Take  Into Account " })
      .expect(409);
    const queue = await request(app).get("/api/reviews").expect(200);
    assert.equal(queue.body.length, 2);
    const forward = saved.body.schedules.find(
      (s: any) => s.direction === "en-ru",
    );
    const review = {
      direction: "en-ru",
      rating: "good",
      expected_due_at: forward.due_at,
    };
    await request(app)
      .post(`/api/cards/${saved.body.id}/review`)
      .set(headers)
      .send(review)
      .expect(200);
    await request(app)
      .post(`/api/cards/${saved.body.id}/review`)
      .set(headers)
      .send(review)
      .expect(409);
    const remaining = await request(app).get("/api/reviews").expect(200);
    assert.equal(remaining.body.length, 1);
    assert.equal(remaining.body[0].direction, "ru-en");
    const backup = await request(app).get("/api/export").expect(200);
    assert.equal(backup.body.cards.length, 1);
    await request(app)
      .delete(`/api/articles/${article.id}`)
      .set(headers)
      .expect(200);
    const words = await request(app).get("/api/cards").expect(200);
    assert.equal(words.body[0].article_id, null);
    assert.equal(words.body[0].context, input.context);
  } finally {
    store.db.close();
  }
});

test("article content, reading position and schedules survive reopening a database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "paperword-test-"));
  const file = join(directory, "db.sqlite");
  const first = createApp({ dbPath: file });
  try {
    const article = await request(first.app)
      .post("/api/import/text")
      .set(headers)
      .send({ title: "Persistent fixture", text: "First.\n\nSecond." })
      .expect(201);
    await request(first.app)
      .patch(`/api/articles/${article.body.id}`)
      .set(headers)
      .send({ read_block: 1, status: "reading", tags: ["test"] })
      .expect(200);
    await request(first.app)
      .post("/api/cards")
      .set(headers)
      .send({ lemma: "learn", translation: "учиться" })
      .expect(201);
    first.store.db.close();
    const second = createApp({ dbPath: file });
    try {
      const list = await request(second.app).get("/api/articles").expect(200);
      assert.equal(list.body[0].read_block, 1);
      assert.deepEqual(list.body[0].tags, ["test"]);
      assert.equal(
        (await request(second.app).get("/api/cards").expect(200)).body[0]
          .schedules.length,
        2,
      );
    } finally {
      second.store.db.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("OpenAI-compatible mock translates, normalizes words and recovers malformed model output", async () => {
  let invalid = false;
  const mock = createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ data: [{ id: "fixture-model" }] }));
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(payload.response_format.type, "json_object");
    const input = JSON.parse(payload.messages[1].content);
    const content = invalid
      ? "not json"
      : Array.isArray(input)
        ? JSON.stringify({
            translations: input.map((b: any) => ({
              id: b.id,
              ru: "Тестовый перевод.",
            })),
          })
        : JSON.stringify({ lemma: "run", translation: "бежать" });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  mock.listen(0, "127.0.0.1");
  await once(mock, "listening");
  const address = mock.address() as { port: number };
  const { app, store } = createApp({
    dbPath: ":memory:",
    ai: {
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "fixture-model",
    },
  });
  try {
    await request(app).get("/api/models").expect(200);
    const suggestion = await request(app)
      .post("/api/words/suggest")
      .set(headers)
      .send({ term: "running", context: "They are running." })
      .expect(200);
    assert.equal(suggestion.body.lemma, "run");
    const article = await request(app)
      .post("/api/import/text")
      .set(headers)
      .send({ title: "Model fixture", text: "An English paragraph." })
      .expect(201);
    await request(app)
      .post(`/api/articles/${article.body.id}/translate`)
      .set(headers)
      .expect(202);
    for (
      let i = 0;
      i < 80 && store.article(article.body.id)?.job_state === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(
      store.article(article.body.id)?.blocks[0].ru,
      "Тестовый перевод.",
    );
    invalid = true;
    const failing = await request(app)
      .post("/api/import/text")
      .set(headers)
      .send({ title: "Failure fixture", text: "Do not lose the source." })
      .expect(201);
    await request(app)
      .post(`/api/articles/${failing.body.id}/translate`)
      .set(headers)
      .expect(202);
    for (
      let i = 0;
      i < 80 && store.article(failing.body.id)?.job_state === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    const result = store.article(failing.body.id)!;
    assert.equal(result.job_state, "error");
    assert.equal(result.blocks[0].text, "Do not lose the source.");
  } finally {
    mock.close();
    store.db.close();
  }
});

test("production refuses unprotected configuration", () => {
  assert.throws(
    () => createApp({ dbPath: ":memory:", production: true }),
    /Production requires/,
  );
});

test("sessions survive restart with the same password, and password change revokes them", async () => {
  const directory = mkdtempSync(join(tmpdir(), "paperword-session-"));
  const path = join(directory, "db.sqlite");
  const first = createApp({ dbPath: path, password: "original-password" });
  const login = await request(first.app)
    .post("/api/login")
    .set(headers)
    .send({ password: "original-password" })
    .expect(200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  first.store.db.close();
  const second = createApp({ dbPath: path, password: "original-password" });
  try {
    await request(second.app)
      .get("/api/articles")
      .set("Cookie", cookie)
      .expect(200);
  } finally {
    second.store.db.close();
  }
  const third = createApp({ dbPath: path, password: "changed-password" });
  try {
    await request(third.app)
      .get("/api/articles")
      .set("Cookie", cookie)
      .expect(401);
  } finally {
    third.store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
