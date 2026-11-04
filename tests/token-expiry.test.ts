import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.ts";
import {
  localDateTime,
  parseTokenExpiryCommand,
  parseTokenExpiryDate,
  resolveTokenExpiry,
} from "../src/token-expiry.ts";

const now = new Date("2026-01-15T12:00:00Z");
test("expiry commands support durations and strict local calendar dates", () => {
  for (const [command, seconds] of [
    ["30d", 2592000],
    ["12h", 43200],
    ["2w", 1209600],
    ["15m", 900],
    ["in 30 days", 2592000],
    ["12 hours", 43200],
    ["2 weeks", 1209600],
    ["15 minutes", 900],
    ["\u0447\u0435\u0440\u0435\u0437 30 \u0434\u043d\u0435\u0439", 2592000],
    ["400\u0434", 34560000],
  ] as const) {
    assert.deepEqual(parseTokenExpiryCommand(command, now), {
      expires_in: seconds,
    });
    assert.equal(
      resolveTokenExpiry(parseTokenExpiryCommand(command, now), now).getTime(),
      now.getTime() + seconds * 1000,
    );
  }
  const dateOnly = resolveTokenExpiry(
    parseTokenExpiryCommand("31.12.2027", now),
    now,
  );
  assert.equal(dateOnly.getFullYear(), 2027);
  assert.equal(dateOnly.getMonth(), 11);
  assert.equal(dateOnly.getDate(), 31);
  assert.equal(dateOnly.getHours(), 23);
  assert.equal(dateOnly.getMinutes(), 59);
  assert.equal(dateOnly.getSeconds(), 59);
  assert.equal(
    localDateTime(
      resolveTokenExpiry(parseTokenExpiryCommand("until 2027-12-31", now), now),
    ),
    localDateTime(dateOnly),
  );
  const exact = resolveTokenExpiry(
    parseTokenExpiryCommand("2028-02-29 18:30", now),
    now,
  );
  assert.equal(localDateTime(exact), "2028-02-29T18:30");
  assert.equal(
    localDateTime(
      resolveTokenExpiry(parseTokenExpiryCommand("2028-02-29T18:30", now), now),
    ),
    "2028-02-29T18:30",
  );
  assert.equal(
    resolveTokenExpiry(
      parseTokenExpiryDate("2030-06-17T14:05", now),
      now,
    ).getHours(),
    14,
  );
  for (const command of [
    "0d",
    "-2d",
    "Infinityd",
    "999999999999999999999999d",
    "30 frogs",
    "31.02.2027",
    "2027-02-29",
    "2027-01-01 24:00",
    "15.01.2020",
    "",
  ])
    assert.throws(() => parseTokenExpiryCommand(command, now), command);
});

test("owner API accepts exact timezone-aware expiry, short durations and more than 365 days; rejects invalid or conflicting limits", async () => {
  const { app, store } = createApp({
    dbPath: ":memory:",
    password: "owner-fixture-password",
  });
  try {
    const headers = { "X-Paperword": "1" };
    const login = await request(app)
      .post("/api/login")
      .set(headers)
      .send({ password: "owner-fixture-password" })
      .expect(200);
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const issue = (body: object) =>
      request(app)
        .post("/api/agent-tokens")
        .set(headers)
        .set("Cookie", cookie)
        .send(body);
    const exact = `${new Date().getUTCFullYear() + 3}-06-17T18:30:00+03:00`;
    const dated = await issue({
      name: "Calendar fixture",
      expires_at: exact,
    }).expect(201);
    assert.equal(dated.body.expires_at, new Date(exact).toISOString());
    const before = Date.now();
    const short = await issue({ name: "Short fixture", expires_in: 60 }).expect(
      201,
    );
    assert.ok(
      Date.parse(short.body.expires_at) >= before + 60000 &&
        Date.parse(short.body.expires_at) <= Date.now() + 60000,
    );
    const long = await issue({ name: "Long fixture", days: 3650 }).expect(201);
    assert.ok(Date.parse(long.body.expires_at) >= before + 3650 * 86400000);
    const legacy = await issue({ name: "Default fixture" }).expect(201);
    assert.ok(Date.parse(legacy.body.expires_at) >= before + 90 * 86400000);
    for (const fields of [
      { expires_at: "2020-01-01T00:00:00Z" },
      { expires_at: "2030-02-30T12:00:00Z" },
      { expires_at: "2030-06-17T18:30:00" },
      { days: 0 },
      { days: -1 },
      { days: 1, expires_in: 60 },
      { expires_at: exact, days: 2 },
      { expires_in: 0 },
      { expires_in: 0.5 },
      { expires_in: Number.MAX_SAFE_INTEGER },
      { expiry: "30d" },
    ])
      await issue({ name: "Invalid fixture", ...fields }).expect(422);
    await request(app)
      .get("/api/agent/status")
      .set("Authorization", `Bearer ${short.body.token}`)
      .expect(200);
    store.db
      .prepare("UPDATE agent_tokens SET expires_at=? WHERE id=?")
      .run(new Date(Date.now() - 1000).toISOString(), short.body.id);
    await request(app)
      .get("/api/agent/status")
      .set("Authorization", `Bearer ${short.body.token}`)
      .expect(401);
    const list = await request(app)
      .get("/api/agent-tokens")
      .set("Cookie", cookie)
      .expect(200);
    assert.equal(list.body.length, 4);
    assert.ok(!JSON.stringify(list.body).includes(dated.body.token));
  } finally {
    store.db.close();
  }
});
