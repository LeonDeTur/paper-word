import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAgentMcp } from "../server/mcp-tools.ts";
import { createApp } from "../server/app.ts";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const h = { "X-Paperword": "1" };
const article = {
  external_id: "doi:fixture-v1",
  title: "Prepared bilingual article",
  tags: ["AI"],
  content: {
    type: "blocks",
    blocks: [
      {
        text: "Researchers observed a result.",
        ru: "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442.",
      },
    ],
  },
};
test("agent tokens import only, idempotency conflicts, receipt isolation, expiry and revocation", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "owner-fixture-password",
    fetchAttachment: async () => ({
      buffer: Buffer.from(
        '<article><h1>MCP file</h1><p data-ru="\u041f\u0435\u0440\u0435\u0432\u043e\u0434.">Translation.</p></article>',
      ),
      filename: "article.html",
      url: "https://files.example/temporary",
    }),
  });
  try {
    const login = await request(app)
      .post("/api/login")
      .set(h)
      .send({ password: "owner-fixture-password" })
      .expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const issued = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({ name: "Importer" })
      .expect(201);
    const auth = { Authorization: `Bearer ${issued.body.token}` };
    await request(app).post("/api/agent/articles").send(article).expect(401);
    await request(app).get("/api/agent/status").set(auth).expect(200);
    await request(app).get("/api/cards").set(auth).expect(401);
    await request(app).get("/api/agent-tokens").set(auth).expect(401);
    await request(app)
      .post("/api/agent/articles")
      .set(auth)
      .set("Origin", "https://evil.invalid")
      .send(article)
      .expect(403);
    const first = await request(app)
      .post("/api/agent/articles")
      .set(auth)
      .send(article)
      .expect(201);
    const retry = await request(app)
      .post("/api/agent/articles")
      .set(auth)
      .send(article)
      .expect(200);
    assert.equal(first.body.id, retry.body.id);
    assert.equal(retry.body.duplicate, true);
    assert.equal(store.articles().length, 1);
    await request(app)
      .post("/api/agent/articles")
      .set(auth)
      .send({ ...article, title: "Different payload" })
      .expect(409);
    await request(app)
      .get(`/api/agent/articles/${first.body.id}`)
      .set(auth)
      .expect(200);
    const other = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .set("Cookie", cookie)
      .send({ name: "Other" })
      .expect(201);
    await request(app)
      .get(`/api/agent/articles/${first.body.id}`)
      .set("Authorization", `Bearer ${other.body.token}`)
      .expect(404);
    const tokenList = await request(app)
      .get("/api/agent-tokens")
      .set("Cookie", cookie)
      .expect(200);
    assert.ok(!JSON.stringify(tokenList.body).includes(issued.body.token));
    assert.ok(!("hash" in tokenList.body[0]));
    await request(app)
      .post(`/api/agent-tokens/${issued.body.id}/revoke`)
      .set(h)
      .set("Cookie", cookie)
      .expect(200);
    await request(app).get("/api/agent/status").set(auth).expect(401);
    store.db
      .prepare("UPDATE agent_tokens SET expires_at=? WHERE id=?")
      .run("2020-01-01T00:00:00.000Z", other.body.id);
    await request(app)
      .get("/api/agent/status")
      .set("Authorization", `Bearer ${other.body.token}`)
      .expect(401);
  } finally {
    store.db.close();
  }
});
test("agent file upload preserves prepared HTML and duplicate bytes do not create another article", async () => {
  const { app, store } = createApp({ dbPath: ":memory:" });
  try {
    const token = await request(app)
      .post("/api/agent-tokens")
      .set(h)
      .send({ name: "Files" })
      .expect(201);
    const auth = { Authorization: `Bearer ${token.body.token}` };
    const html = Buffer.from(
      '<article><h1>Uploaded article</h1><div><div class="en"><button class="word" data-ru="\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c">observe</button> results.</div><label>RU</label><div class="ru-paragraph">\u041d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b.</div></div></article>',
    );
    const first = await request(app)
      .post("/api/agent/articles/file")
      .set(auth)
      .field("external_id", "file-v1")
      .field("tags", '["test"]')
      .attach("file", html, "paper.html")
      .expect(201);
    const again = await request(app)
      .post("/api/agent/articles/file")
      .set(auth)
      .field("external_id", "file-v1")
      .field("tags", '["test"]')
      .attach("file", html, "paper.html")
      .expect(200);
    const contentDuplicate = await request(app)
      .post("/api/agent/articles/file")
      .set(auth)
      .field("external_id", "another-id")
      .attach("file", html, "paper.html")
      .expect(200);
    assert.equal(first.body.id, again.body.id);
    assert.equal(first.body.id, contentDuplicate.body.id);
    const loaded = store.article(first.body.id)!;
    assert.equal(loaded.blocks[0].text, "observe results.");
    assert.equal(
      loaded.blocks[0].ru,
      "\u041d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u044b.",
    );
    assert.equal(
      loaded.dictionary.observe,
      "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c",
    );
    assert.equal(loaded.has_original, true);
  } finally {
    store.db.close();
  }
});
test("remote MCP SDK client discovers tools, uploads and verifies a receipt with the same scoped token", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "owner-fixture-password",
    fetchAttachment: async () => ({
      buffer: Buffer.from(
        '<article><h1>MCP file</h1><p data-ru="\u041f\u0435\u0440\u0435\u0432\u043e\u0434.">Translation.</p></article>',
      ),
      filename: "article.html",
      url: "https://files.example/temporary",
    }),
  });
  const login = await request(app)
    .post("/api/login")
    .set(h)
    .send({ password: "owner-fixture-password" });
  const token = await request(app)
    .post("/api/agent-tokens")
    .set(h)
    .set("Cookie", login.headers["set-cookie"][0].split(";")[0])
    .send({ name: "MCP" })
    .expect(201);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const client = new Client({ name: "fixture-client", version: "1.0.0" });
  try {
    await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      .expect(401);
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${address.port}/mcp`),
        {
          requestInit: {
            headers: { Authorization: `Bearer ${token.body.token}` },
          },
        },
      ),
    );
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
      "get_imported_article",
      "import_article",
      "import_chatgpt_file",
    ]);
    const fileTool = tools.tools.find((t) => t.name === "import_chatgpt_file")!;
    assert.deepEqual(fileTool._meta?.["openai/fileParams"], ["file"]);
    assert.equal(fileTool.annotations?.readOnlyHint, false);
    assert.deepEqual(fileTool._meta?.securitySchemes, [
      { type: "oauth2", scopes: ["articles:import"] },
    ]);
    const properties = fileTool.inputSchema.properties as Record<string, any>;
    assert.deepEqual(Object.keys(properties.file.properties).sort(), [
      "download_url",
      "file_id",
      "file_name",
      "mime_type",
    ]);
    const fileResult = await client.callTool({
      name: "import_chatgpt_file",
      arguments: {
        external_id: "mcp-file-v1",
        file: {
          download_url: "https://files.example/temporary",
          file_id: "file-fixture",
          file_name: "article.html",
        },
      },
    });
    assert.ok(!fileResult.isError);
    assert.equal(
      JSON.parse((fileResult.content as { text: string }[])[0].text)
        .translated_blocks,
      1,
    );
    const imported = await client.callTool({
      name: "import_article",
      arguments: article,
    });
    assert.ok(!imported.isError);
    const receipt = JSON.parse(
      (imported.content as { text: string }[])[0].text,
    );
    assert.equal(receipt.translated_blocks, 1);
    const retry = await client.callTool({
      name: "import_article",
      arguments: article,
    });
    assert.equal(
      JSON.parse((retry.content as { text: string }[])[0].text).duplicate,
      true,
    );
    const read = await client.callTool({
      name: "get_imported_article",
      arguments: { id: receipt.id },
    });
    assert.ok(!read.isError);
    await request(app)
      .post(`/api/agent-tokens/${token.body.id}/revoke`)
      .set(h)
      .set("Cookie", login.headers["set-cookie"][0].split(";")[0])
      .expect(200);
    await assert.rejects(client.listTools());
  } finally {
    await client.close();
    server.close();
    store.db.close();
  }
});
test("MCP tool failures are returned as errors, not fabricated successful imports", async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = createAgentMcp({
    importArticle: async () => {
      throw new Error("Import unavailable");
    },
    getArticle: async () => {
      throw new Error("Not found");
    },
  });
  const client = new Client({ name: "fixture", version: "1" });
  try {
    await server.connect(serverSide);
    await client.connect(clientSide);
    const result = await client.callTool({
      name: "import_article",
      arguments: article,
    });
    assert.equal(result.isError, true);
  } finally {
    await client.close();
    await server.close();
  }
});

test("stdio MCP uploads a local article and rejects files outside the allowed directory", async () => {
  const dir = mkdtempSync(join(tmpdir(), "paperword-mcp-"));
  const inbox = join(dir, "inbox");
  mkdirSync(inbox);
  writeFileSync(
    join(inbox, "paper.html"),
    '<article><h1>Stdio fixture</h1><p data-ru="\u0422\u0435\u043a\u0441\u0442.">Text.</p></article>',
  );
  writeFileSync(join(dir, "outside.txt"), "Do not upload outside files.");
  const { app, store } = createApp({ dbPath: ":memory:" });
  const issued = await request(app)
    .post("/api/agent-tokens")
    .set(h)
    .send({ name: "Stdio" })
    .expect(201);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const client = new Client({ name: "stdio-fixture", version: "1" });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string",
    ),
  );
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", "server/mcp-stdio.ts"],
        env: {
          ...env,
          PAPERWORD_URL: `http://127.0.0.1:${port}`,
          PAPERWORD_TOKEN: issued.body.token,
          PAPERWORD_IMPORT_DIR: inbox,
        },
        stderr: "pipe",
      }),
    );
    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "upload_article_file"));
    const result = await client.callTool({
      name: "upload_article_file",
      arguments: { file_path: "paper.html", external_id: "stdio-v1" },
    });
    assert.ok(!result.isError);
    assert.equal(
      store.articles()[0].blocks[0].ru,
      "\u0422\u0435\u043a\u0441\u0442.",
    );
    const blocked = await client.callTool({
      name: "upload_article_file",
      arguments: { file_path: "../outside.txt", external_id: "outside" },
    });
    assert.equal(blocked.isError, true);
    assert.equal(store.articles().length, 1);
  } finally {
    await client.close();
    server.close();
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
