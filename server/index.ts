import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import { createApp } from "./app.ts";

if (existsSync(".env")) process.loadEnvFile(".env");
const production = process.env.NODE_ENV === "production";
const { app } = createApp({
  dbPath: process.env.DB_PATH || "data/paperword.sqlite",
  password: process.env.APP_PASSWORD,
  origin: process.env.APP_ORIGIN,
  production,
  ai: {
    baseUrl: process.env.AI_BASE_URL,
    model: process.env.AI_MODEL,
    apiKey: process.env.AI_API_KEY,
  },
});
const dist = resolve("dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve(dist, "index.html")));
}
const host = process.env.APP_PASSWORD
  ? process.env.HOST || "127.0.0.1"
  : "127.0.0.1";
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, host, () =>
  console.log(
    `Paperword API: http://${host}:${port}${!process.env.APP_PASSWORD ? " (local mode)" : ""}`,
  ),
);
server.requestTimeout = 240_000;
