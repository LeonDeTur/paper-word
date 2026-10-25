import { createServer } from "node:http";
import express from "express";
import { resolve } from "node:path";
import { createApp } from "../server/app.ts";

// Isolated fixture API and in-memory data. No real model, credentials or user data.
const mock = createServer(async (req, res) => {
  if (req.url === "/v1/models") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ data: [{ id: "fixture-english" }] }));
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  const data = JSON.parse(payload.messages[1].content);
  const content = Array.isArray(data)
    ? {
        translations: data.map((b: any) => ({
          id: b.id,
          ru: "\u041f\u0435\u0440\u0435\u0432\u043e\u0434 \u0443\u0447\u0435\u0431\u043d\u043e\u0433\u043e \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u0430 \u0434\u043b\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0438 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0430.",
        })),
      }
    : {
        lemma: data.term === "observed" ? "observe" : data.term.toLowerCase(),
        translation: "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c",
      };
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  );
});
mock.listen(3013, "127.0.0.1");
const { app } = createApp({
  dbPath: ":memory:",
  password: "browser-fixture-password",
  origin: "http://127.0.0.1:3012",
  ai: { baseUrl: "http://127.0.0.1:3013/v1", model: "fixture-english" },
});
app.use(express.static(resolve("dist")));
app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
app.listen(3012, "127.0.0.1");
