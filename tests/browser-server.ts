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
          ru: "Перевод учебного фрагмента для проверки интерфейса.",
        })),
      }
    : {
        lemma: data.term === "observed" ? "observe" : data.term.toLowerCase(),
        translation: "наблюдать",
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
