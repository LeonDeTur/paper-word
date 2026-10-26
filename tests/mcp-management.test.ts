import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { once } from "node:events";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../server/app.ts";
import { createStore } from "../server/store.ts";
import { AGENT_SCOPES, MANAGE_AGENT_SCOPES } from "../src/agent-scopes.ts";
import { managementTools } from "../server/management-tools.ts";

const h = { "X-Paperword": "1" };
const prepared = {
  external_id: "management-fixture",
  title: "Research fixture",
  content: {
    type: "blocks",
    blocks: [
      { text: "Researchers take the data into account.", ru: "" },
      { text: "Another paragraph.", ru: "" },
    ],
  },
};
async function ownerCookie(app: ReturnType<typeof createApp>["app"]) {
  const login = await request(app)
    .post("/api/login")
    .set(h)
    .send({ password: "management-fixture-password" })
    .expect(200);
  return login.headers["set-cookie"][0].split(";")[0];
}

test("remote MCP manages articles, translations, canonical vocabulary and shared reviews; deletion is opt-in", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "management-fixture-password",
  });
  const cookie = await ownerCookie(app);
  const issued = await request(app)
    .post("/api/agent-tokens")
    .set(h)
    .set("Cookie", cookie)
    .send({ name: "Manager", scopes: MANAGE_AGENT_SCOPES })
    .expect(201);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = new Client({ name: "management-fixture", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(
          `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`,
        ),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${issued.body.token}` },
          },
        },
      ),
    );
    const tools = (await client.listTools()).tools;
    assert.ok(tools.some((t) => t.name === "review_card"));
    assert.ok(!tools.some((t) => t.name === "delete_article"));
    assert.equal(
      tools.find((t) => t.name === "get_article")!.annotations!.readOnlyHint,
      true,
    );
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result));
      return JSON.parse((result.content as { text: string }[])[0].text);
    };
    const article = await call("import_article", prepared);
    const found = await call("list_articles", {
      query: "take the data",
      limit: 1,
    });
    assert.equal(found.items[0].id, article.id);
    assert.equal(found.total, 1);
    await call("update_article", {
      id: article.id,
      changes: {
        tags: ["research"],
        starred: true,
        status: "reading",
        read_block: 1,
      },
    });
    const first = await call("get_article", { id: article.id, limit: 1 });
    assert.equal(first.items[0].id, 0);
    assert.equal(first.next_offset, 1);
    assert.equal(
      (await call("get_article", { id: article.id, offset: 1 })).next_offset,
      null,
    );
    await call("save_translation", {
      id: article.id,
      block_id: 0,
      ru: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u0443\u0447\u0438\u0442\u044b\u0432\u0430\u044e\u0442 \u0434\u0430\u043d\u043d\u044b\u0435.",
      expected_ru: "",
    });
    const stale = await client.callTool({
      name: "save_translation",
      arguments: {
        id: article.id,
        block_id: 0,
        ru: "Overwrite",
        expected_ru: "",
      },
    });
    assert.equal(stale.isError, true);
    const card = await call("create_card", {
      lemma: "take into account",
      translation: "\u0443\u0447\u0438\u0442\u044b\u0432\u0430\u0442\u044c",
      article_id: article.id,
      block_id: 0,
      context: first.items[0].text,
    });
    const duplicate = await client.callTool({
      name: "create_card",
      arguments: {
        lemma: "TAKE  INTO ACCOUNT",
        translation: "\u0443\u0447\u0435\u0441\u0442\u044c",
      },
    });
    assert.equal(duplicate.isError, true);
    assert.equal(
      (await call("list_cards", { normalized_query: "Take into account" }))
        .total,
      1,
    );
    await call("update_card", {
      id: card.id,
      changes: {
        source_form: "takes into account",
        notes: "Research phrase",
        context: "Updated source context.",
      },
    });
    const loaded = await call("get_card", { id: card.id });
    assert.equal(loaded.context, "Updated source context.");
    assert.equal(loaded.schedules.length, 2);
    const queue = await call("list_reviews", { direction: "en-ru" });
    const review = {
      id: card.id,
      direction: "en-ru",
      rating: "good",
      expected_due_at: queue.items[0].due_at,
    };
    await call("review_card", review);
    const staleReview = await client.callTool({
      name: "review_card",
      arguments: review,
    });
    assert.equal(staleReview.isError, true);
    const siteQueue = await request(app)
      .get("/api/reviews?direction=en-ru")
      .set("Cookie", cookie)
      .expect(200);
    assert.equal(siteQueue.body.length, 0);
    assert.equal((await call("list_reviews", { direction: "ru-en" })).total, 1);
    assert.equal((await call("get_statistics")).words, 1);
    const blocked = await request(app)
      .post("/api/agent/actions/delete_article")
      .auth(issued.body.token, { type: "bearer" })
      .send({ id: article.id, confirm_title: article.title })
      .expect(403);
    assert.match(blocked.body.error, /data:delete/);
    const deleter = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({
        name: "Deleter",
        scopes: ["articles:write", "cards:write", "data:delete"],
      })
      .expect(201);
    const action = (name: string) =>
      request(app)
        .post(`/api/agent/actions/${name}`)
        .auth(deleter.body.token, { type: "bearer" });
    await action("delete_article")
      .send({ id: article.id, confirm_title: "Wrong title" })
      .expect(409);
    await action("delete_article")
      .send({ id: article.id, confirm_title: article.title })
      .expect(200);
    assert.equal(store.cards()[0].article_id, null);
    assert.equal(store.cards()[0].context, "Updated source context.");
    await action("delete_card")
      .send({ id: card.id, confirm_lemma: "take into account" })
      .expect(200);
    assert.equal(store.cards().length, 0);
    await request(app)
      .post(`/api/agent-tokens/${issued.body.id}/revoke`)
      .set(h)
      .set("Cookie", cookie)
      .expect(200);
    await assert.rejects(client.listTools());
  } finally {
    await client.close();
    server.close();
    store.db.close();
  }
});

test("all management HTTP actions enforce scopes before parsing; read-only tokens cannot import or call owner endpoints", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "management-fixture-password",
  });
  try {
    const cookie = await ownerCookie(app);
    const token = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({ name: "Importer" })
      .expect(201);
    for (const name of Object.keys(managementTools)) {
      await request(app)
        .post(`/api/agent/actions/${name}`)
        .auth(token.body.token, { type: "bearer" })
        .send({})
        .expect(403);
    }
    const reader = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({ name: "Reader", scopes: ["articles:read"] })
      .expect(201);
    await request(app)
      .post("/api/agent/articles")
      .auth(reader.body.token, { type: "bearer" })
      .send(prepared)
      .expect(403);
    await request(app)
      .post("/api/agent/actions/list_articles")
      .auth(reader.body.token, { type: "bearer" })
      .send({})
      .expect(200);
    await request(app)
      .post("/api/agent/actions/list_articles")
      .auth(reader.body.token, { type: "bearer" })
      .send({ limit: 51 })
      .expect(422);
    await request(app)
      .get("/api/agent-tokens")
      .auth(reader.body.token, { type: "bearer" })
      .expect(401);
    await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({ name: "Invalid", scopes: ["admin"] })
      .expect(422);
  } finally {
    store.db.close();
  }
});

test("MCP action API runs configured-model translation in background and normalizes vocabulary without returning model secrets", async () => {
  const model = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    const data = JSON.parse(input.messages[1].content);
    const output = Array.isArray(data)
      ? {
          translations: [
            {
              id: data[0].id,
              ru: "\u041f\u0435\u0440\u0435\u0432\u043e\u0434 \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u0430.",
            },
          ],
        }
      : {
          lemma: "take into account",
          translation: "\u0443\u0447\u0438\u0442\u044b\u0432\u0430\u0442\u044c",
        };
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
    );
  }).listen(0, "127.0.0.1");
  await once(model, "listening");
  const { app, store } = createApp({
    dbPath: ":memory:",
    ai: {
      baseUrl: `http://127.0.0.1:${(model.address() as { port: number }).port}`,
      model: "fixture",
      apiKey: "private-fixture-key",
    },
  });
  try {
    const token = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .send({ name: "AI manager", scopes: MANAGE_AGENT_SCOPES });
    const auth = { Authorization: `Bearer ${token.body.token}` };
    const article = await request(app)
      .post("/api/agent/articles")
      .set(auth)
      .send(prepared)
      .expect(201);
    const call = (name: string, data: Record<string, unknown>) =>
      request(app).post(`/api/agent/actions/${name}`).set(auth).send(data);
    const started = await call("start_translation", {
      id: article.body.id,
    }).expect(200);
    assert.equal(started.body.job_state, "running");
    let status = started;
    for (let i = 0; i < 100 && status.body.job_state === "running"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      status = await call("get_translation_status", {
        id: article.body.id,
      }).expect(200);
    }
    assert.equal(status.body.job_state, "idle");
    assert.equal(status.body.translated_blocks, 2);
    assert.ok(!JSON.stringify(status.body).includes("private-fixture-key"));
    const suggested = await call("suggest_word", {
      term: "takes into account",
    }).expect(200);
    assert.equal(suggested.body.lemma, "take into account");
    assert.equal(suggested.body.existing, null);
    await call("cancel_translation", { id: article.body.id }).expect(200);
  } finally {
    store.db.close();
    model.close();
  }
});

test("Claude OAuth consent cannot silently grant deletion; refresh can narrow but cannot expand scopes", async () => {
  const origin = "https://paperword.example.com",
    resource = `${origin}/mcp`;
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "management-fixture-password",
    origin,
    production: true,
  });
  try {
    const owner = await ownerCookie(app);
    for (const callback of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
    ]) {
      const registered = await request(app)
        .post("/register")
        .send({
          client_name: "Claude fixture",
          redirect_uris: [callback],
          token_endpoint_auth_method: "none",
        })
        .expect(201);
      const verifier = randomBytes(32).toString("base64url");
      const auth = await request(app)
        .get("/authorize")
        .query({
          client_id: registered.body.client_id,
          response_type: "code",
          redirect_uri: callback,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
          scope: AGENT_SCOPES.join(" "),
          resource,
        })
        .expect(302);
      const id = new URL(auth.headers.location).searchParams.get("request")!;
      const cookie = `${owner}; ${auth.headers["set-cookie"][0].split(";")[0]}`;
      const details = await request(app)
        .get(`/api/oauth/requests/${id}`)
        .set("Cookie", cookie)
        .expect(200);
      assert.ok(details.body.scopes.includes("data:delete"));
      const decision = await request(app)
        .post(`/api/oauth/requests/${id}/decision`)
        .set(h)
        .set("Cookie", cookie)
        .send({ allow: true })
        .expect(200);
      const code = new URL(decision.body.redirect_url).searchParams.get("code");
      const tokens = await request(app)
        .post("/token")
        .type("form")
        .send({
          grant_type: "authorization_code",
          code,
          client_id: registered.body.client_id,
          code_verifier: verifier,
          redirect_uri: callback,
          resource,
        })
        .expect(200);
      assert.ok(tokens.body.scope.includes("cards:write"));
      assert.ok(!tokens.body.scope.includes("data:delete"));
      const refresh = {
        grant_type: "refresh_token",
        refresh_token: tokens.body.refresh_token,
        client_id: registered.body.client_id,
        resource,
      };
      await request(app)
        .post("/token")
        .type("form")
        .send({ ...refresh, scope: "data:delete" })
        .expect(400);
      const narrowed = await request(app)
        .post("/token")
        .type("form")
        .send({ ...refresh, scope: "articles:read" })
        .expect(200);
      assert.equal(narrowed.body.scope, "articles:read");
      await request(app)
        .post("/api/agent/actions/create_card")
        .auth(narrowed.body.access_token, { type: "bearer" })
        .send({ lemma: "test", translation: "\u0442\u0435\u0441\u0442" })
        .expect(403);
    }
    for (const callback of [
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "https://claude.ai/other",
      "https://claude.ai:444/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback?next=evil",
    ]) {
      await request(app)
        .post("/register")
        .send({ redirect_uris: [callback] })
        .expect(400);
    }
  } finally {
    store.db.close();
  }
});

test("schema migration preserves old tokens with import-only permissions and existing library data", () => {
  const dir = mkdtempSync(join(tmpdir(), "paperword-schema-")),
    file = join(dir, "fixture.sqlite");
  try {
    const old = createStore(file);
    old.db
      .prepare(
        "INSERT INTO agent_tokens(id,name,hash,created_at,expires_at) VALUES(?,?,?,?,?)",
      )
      .run("fixture-id", "Legacy", "fixture-hash", "2026-01-01", "2099-01-01");
    old.db.exec(
      "ALTER TABLE agent_tokens DROP COLUMN scopes; ALTER TABLE oauth_tokens DROP COLUMN scopes; PRAGMA user_version=3;",
    );
    old.db.close();
    const upgraded = createStore(file);
    try {
      assert.equal(
        (
          upgraded.db.prepare("SELECT name FROM agent_tokens").get() as {
            name: string;
          }
        ).name,
        "Legacy",
      );
      assert.equal(
        (
          upgraded.db.prepare("SELECT scopes FROM agent_tokens").get() as {
            scopes: string;
          }
        ).scopes,
        '["articles:import"]',
      );
      assert.equal(
        (
          upgraded.db.prepare("PRAGMA user_version").get() as {
            user_version: number;
          }
        ).user_version,
        4,
      );
    } finally {
      upgraded.db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
