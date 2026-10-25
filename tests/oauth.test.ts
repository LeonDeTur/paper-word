import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import request from "supertest";
import { createApp } from "../server/app.ts";
import { fetchPreparedFile } from "../server/content.ts";

const origin = "https://paperword.example.com";
const resource = `${origin}/mcp`;
const redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
const h = { "X-Paperword": "1" };
const cookieOf = (response: any) =>
  response.headers["set-cookie"][0].split(";")[0];

test("OAuth discovery, consent nonce, PKCE, audience, rotation and revocation protect a stable agent identity", async () => {
  const original = Buffer.from(
    '<article><h1>OAuth article</h1><p data-ru="\u0413\u043e\u0442\u043e\u0432\u044b\u0439 \u043f\u0435\u0440\u0435\u0432\u043e\u0434.">Prepared translation.</p></article>',
  );
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "owner-fixture-password",
    origin,
    production: true,
    fetchAttachment: async () => ({
      buffer: original,
      filename: "article.html",
      url: "https://files.example.com/temporary-secret",
    }),
  });
  try {
    const metadata = await request(app)
      .get("/.well-known/oauth-protected-resource/mcp")
      .expect(200);
    assert.equal(metadata.body.resource, resource);
    const discovery = await request(app)
      .get("/.well-known/oauth-authorization-server")
      .expect(200);
    assert.deepEqual(discovery.body.code_challenge_methods_supported, ["S256"]);
    const unauth = await request(app).post("/mcp").send({}).expect(401);
    assert.match(unauth.headers["www-authenticate"], /resource_metadata=/);
    await request(app)
      .post("/register")
      .send({ redirect_uris: ["https://evil.example/callback"] })
      .expect(400);
    const registration = await request(app)
      .post("/register")
      .send({
        client_name: "ChatGPT test",
        redirect_uris: [redirect],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
      })
      .expect(201);
    const client = registration.body.client_id;
    assert.equal(registration.body.client_secret, undefined);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const query = {
      client_id: client,
      response_type: "code",
      redirect_uri: redirect,
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource,
      scope: "articles:import",
      state: "fixture-state",
    };
    const auth = await request(app).get("/authorize").query(query).expect(302);
    const requestId = new URL(auth.headers.location).searchParams.get(
      "request",
    )!;
    const nonce = cookieOf(auth);
    const login = await request(app)
      .post("/api/login")
      .set(h)
      .send({ password: "owner-fixture-password" })
      .expect(200);
    const owner = cookieOf(login);
    const cookies = `${owner}; ${nonce}`;
    await request(app)
      .get(`/api/oauth/requests/${requestId}`)
      .set("Cookie", nonce)
      .expect(401);
    await request(app)
      .get(`/api/oauth/requests/${requestId}`)
      .set("Cookie", owner)
      .expect(403);
    await request(app)
      .get(`/api/oauth/requests/${requestId}`)
      .set("Cookie", cookies)
      .expect(200);
    await request(app)
      .post(`/api/oauth/requests/${requestId}/decision`)
      .set("Cookie", cookies)
      .send({ allow: true })
      .expect(403);
    const decision = await request(app)
      .post(`/api/oauth/requests/${requestId}/decision`)
      .set(h)
      .set("Cookie", cookies)
      .send({ allow: true })
      .expect(200);
    const callback = new URL(decision.body.redirect_url);
    assert.equal(callback.searchParams.get("state"), "fixture-state");
    await request(app)
      .post(`/api/oauth/requests/${requestId}/decision`)
      .set(h)
      .set("Cookie", cookies)
      .send({ allow: true })
      .expect(404);
    const exchange = {
      grant_type: "authorization_code",
      client_id: client,
      code: callback.searchParams.get("code"),
      redirect_uri: redirect,
      code_verifier: verifier,
      resource,
    };
    await request(app)
      .post("/token")
      .type("form")
      .send({
        ...exchange,
        code_verifier: randomBytes(32).toString("base64url"),
      })
      .expect(400);
    await request(app)
      .post("/token")
      .type("form")
      .send({ ...exchange, resource: "https://evil.example/mcp" })
      .expect(400);
    const tokens = await request(app)
      .post("/token")
      .type("form")
      .send(exchange)
      .expect(200);
    await request(app).post("/token").type("form").send(exchange).expect(400);
    const authHeader = { Authorization: `Bearer ${tokens.body.access_token}` };
    await request(app).get("/api/agent/status").set(authHeader).expect(200);
    await request(app).get("/api/cards").set(authHeader).expect(401);
    const input = {
      external_id: "oauth-file-v1",
      file: {
        download_url: "https://files.example.com/temporary-secret",
        file_id: "file-fixture",
        mime_type: "text/html",
        file_name: "article.html",
      },
    };
    const first = await request(app)
      .post("/api/agent/articles/chatgpt-file")
      .set(authHeader)
      .send(input)
      .expect(200);
    assert.equal(first.body.translated_blocks, 1);
    assert.equal(first.body.reader_url, `${origin}${first.body.reader_path}`);
    const saved = store.db
      .prepare("SELECT original FROM articles WHERE id=?")
      .get(first.body.id) as { original: Uint8Array };
    assert.deepEqual(Buffer.from(saved.original), original);
    const refresh = {
      grant_type: "refresh_token",
      client_id: client,
      refresh_token: tokens.body.refresh_token,
      resource,
    };
    const renewed = await request(app)
      .post("/token")
      .type("form")
      .send(refresh)
      .expect(200);
    const newAuth = { Authorization: `Bearer ${renewed.body.access_token}` };
    await request(app)
      .get(`/api/agent/articles/${first.body.id}`)
      .set(newAuth)
      .expect(200);
    const retry = await request(app)
      .post("/api/agent/articles/chatgpt-file")
      .set(newAuth)
      .send({
        ...input,
        file: {
          ...input.file,
          download_url: "https://files.example.com/different-temporary-secret",
        },
      })
      .expect(200);
    assert.equal(retry.body.id, first.body.id);
    assert.equal(retry.body.duplicate, true);
    const grants = await request(app)
      .get("/api/agent-tokens")
      .set("Cookie", owner)
      .expect(200);
    assert.equal(grants.body.length, 1);
    assert.equal(
      JSON.stringify(
        store.db.prepare("SELECT * FROM oauth_tokens").all(),
      ).includes(tokens.body.access_token),
      false,
    );
    await request(app).post("/token").type("form").send(refresh).expect(400);
    await request(app).get("/api/agent/status").set(newAuth).expect(401);
    // A second approval can be denied without creating another grant.
    const deniedAuth = await request(app)
      .get("/authorize")
      .query(query)
      .expect(302);
    const deniedId = new URL(deniedAuth.headers.location).searchParams.get(
      "request",
    )!;
    const denied = await request(app)
      .post(`/api/oauth/requests/${deniedId}/decision`)
      .set(h)
      .set("Cookie", `${owner}; ${cookieOf(deniedAuth)}`)
      .send({ allow: false })
      .expect(200);
    assert.equal(
      new URL(denied.body.redirect_url).searchParams.get("error"),
      "access_denied",
    );
  } finally {
    store.db.close();
  }
});

test("ChatGPT file downloads reject insecure and internal destinations before connecting", async () => {
  await assert.rejects(fetchPreparedFile("http://example.com/file.html"));
  await assert.rejects(fetchPreparedFile("https://127.0.0.1/file.html"));
  await assert.rejects(
    fetchPreparedFile("https://user:pass@example.com/file.html"),
  );
  await assert.rejects(fetchPreparedFile("https://example.com:8443/file.html"));
});
