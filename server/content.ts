import { load } from "cheerio";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import type { Block } from "../src/types.ts";

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const MAX_BYTES = 15 * 1024 * 1024;
const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const ruSelector =
  '[lang="ru"], .ru, .ru-paragraph, .translation, .russian, .ru-text, [data-role="translation"]';

export function parseHtml(html: string) {
  const $ = load(html);
  const title = clean(
    $("h1").first().text() || $("title").text() || "Untitled",
  );
  const dictionary: Record<string, string> = {};
  $(
    "span[data-ru], button.word[data-ru], [data-translation], [data-word]",
  ).each((_, el) => {
    const node = $(el);
    const word = clean(node.attr("data-word") || node.text()).toLowerCase();
    const translated = node.attr("data-translation") || node.attr("data-ru");
    if (word && word.length < 120 && translated && translated.length < 500)
      dictionary[word] = translated;
  });
  $("button.word[data-ru]").each((_, el) => {
    $(el).replaceWith($(el).contents());
  });
  $(
    "script,style,nav,header,footer,button,input,select,textarea,noscript,iframe,svg,canvas",
  ).remove();
  const root = $(".read-section").first().length
    ? $(".read-section").first()
    : $("main .en").length > $("article").first().find(".en").length
      ? $("main").first()
      : $("article").first().length
        ? $("article").first()
        : $("main").first().length
          ? $("main").first()
          : $("body");
  const blocks: Block[] = [];
  root
    .find("h1,h2,h3,h4,p,figure,.en,.article-text,[data-en]")
    .each((_, el) => {
      const node = $(el);
      if (
        node.parents("figure").length ||
        node.is(ruSelector) ||
        node.parents(ruSelector).length
      )
        return;
      if (node.parents("[data-en],.en,.article-text").length) return;
      if (node.is("h1") && clean(node.text()) === title) return;
      if (node.is("figure")) {
        const caption =
          clean(node.find("figcaption").text()) ||
          node.find("img").attr("alt") ||
          "Illustration from the original article";
        const src = node.find("img").attr("src") || "";
        const image =
          /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src) &&
          src.length < 3_000_000
            ? src
            : undefined;
        blocks.push({
          id: blocks.length,
          kind: "figure",
          text: caption,
          ru: "",
          ...(image ? { image } : {}),
        });
        return;
      }
      const clone = node.clone();
      clone.find(ruSelector).remove();
      const text = clean(node.attr("data-en") || clone.text());
      if (!text || text === "RU ALL" || text.length > 50_000) return;
      const inside = node.find(ruSelector).first().text();
      let paired = "";
      node.nextAll().each((_, sibling) => {
        const next = $(sibling);
        if (next.is(ruSelector)) {
          paired = next.text();
          return false;
        }
        if (next.is("p,.en,.article-text,[data-en],h1,h2,h3,h4,figure"))
          return false;
      });
      const ru = clean(
        node.attr("data-ru") ||
          node.attr("data-translation") ||
          inside ||
          paired,
      );
      blocks.push({
        id: blocks.length,
        kind: /^h[1-4]$/.test(el.tagName) ? "heading" : "paragraph",
        text,
        ru,
      });
    });
  if (!blocks.length) {
    const text = clean(root.text());
    if (text)
      blocks.push({
        id: 0,
        kind: "paragraph",
        text: text.slice(0, 50_000),
        ru: "",
      });
  }
  return { title, blocks: limitBlocks(blocks), dictionary };
}

export function limitBlocks(blocks: Block[]) {
  if (!blocks.length)
    throw new AppError(
      422,
      "Could not extract text. Scanned PDFs require OCR first.",
    );
  if (
    blocks.length > 2500 ||
    blocks.reduce((sum, b) => sum + b.text.length + b.ru.length, 0) > 1_500_000
  ) {
    throw new AppError(
      413,
      "The article is too large. Split it into smaller parts.",
    );
  }
  return blocks;
}

export async function parseFile(buffer: Buffer, filename: string) {
  if (buffer.length > MAX_BYTES)
    throw new AppError(413, "The maximum file size is 15 MB.");
  if (/\.pdf$/i.test(filename)) {
    if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-")))
      throw new AppError(422, "The file does not appear to be a PDF.");
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const blocks = result.text
        .split(/\n\s*\n/)
        .map(clean)
        .filter(Boolean)
        .map((text, id): Block => ({ id, kind: "paragraph", text, ru: "" }));
      return {
        title: filename.replace(/\.pdf$/i, ""),
        blocks: limitBlocks(blocks),
        dictionary: {},
        mime: "application/pdf",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        422,
        "Could not read the PDF. Check that it contains text and is not password protected.",
      );
    } finally {
      await parser.destroy();
    }
  }
  if (!/\.(html?|txt|md)$/i.test(filename))
    throw new AppError(415, "HTML, PDF, TXT and Markdown are supported.");
  const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (/\.html?$/i.test(filename))
    return { ...parseHtml(text), mime: "text/html" };
  return {
    title: filename.replace(/\.[^.]+$/, ""),
    dictionary: {},
    mime: "text/plain",
    blocks: limitBlocks(
      text
        .split(/\n\s*\n/)
        .map(clean)
        .filter(Boolean)
        .map((text, id): Block => ({ id, kind: "paragraph", text, ru: "" })),
    ),
  };
}

export function isPublicAddress(address: string) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

// Resolve and pin each connection. Revalidate redirects; never let a second DNS
// lookup silently replace a checked public address with an internal destination.
export function fetchArticle(raw: string, hops = 0) {
  return fetchPublicFile(raw, hops, false);
}

export function fetchPreparedFile(raw: string) {
  return fetchPublicFile(raw, 0, true).then((file) => ({
    ...file,
    filename:
      file.buffer.subarray(0, 5).toString() === "%PDF-"
        ? "article.pdf"
        : file.filename,
  }));
}

async function fetchPublicFile(
  raw: string,
  hops: number,
  prepared: boolean,
): Promise<{ buffer: Buffer; filename: string; url: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(422, "Enter a complete HTTPS URL.");
  }
  if (
    !(prepared ? ["https:"] : ["http:", "https:"]).includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  ) {
    throw new AppError(
      422,
      "Only standard HTTP/HTTPS URLs without embedded credentials are allowed.",
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new AppError(422, "Could not resolve the website address.");
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new AppError(
      422,
      "Downloads from local and reserved networks are not allowed.",
    );
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const pinned = addresses[0];
    const req = transport.get(
      url,
      {
        agent: false,
        signal: AbortSignal.timeout(25_000),
        lookup: ((
          _host: string,
          lookupOptions: { all?: boolean },
          callback: Function,
        ) =>
          lookupOptions?.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family)) as any,
        headers: {
          "User-Agent": "Paperword (personal article library)",
          Accept:
            "text/html,application/pdf,text/plain,application/octet-stream",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          res.resume();
          if (hops >= 4 || !res.headers.location)
            return reject(new AppError(422, "Too many redirects."));
          fetchPublicFile(
            new URL(res.headers.location, url).toString(),
            hops + 1,
            prepared,
          ).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          return reject(
            new AppError(
              422,
              `The source returned HTTP ${status}. Upload the file manually.`,
            ),
          );
        }
        const type = (res.headers["content-type"] || "").split(";")[0];
        if (
          ![
            "text/html",
            "application/xhtml+xml",
            "application/pdf",
            "text/plain",
            ...(prepared ? ["application/octet-stream", "text/markdown"] : []),
          ].includes(type)
        ) {
          res.resume();
          return reject(
            new AppError(415, "The URL must point to HTML, PDF or text."),
          );
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            reject(new AppError(413, "The content exceeds 15 MB."));
          } else chunks.push(chunk);
        });
        res.on("error", () =>
          reject(
            new AppError(
              422,
              "The download was interrupted. Please try again.",
            ),
          ),
        );
        res.on("end", () =>
          resolve({
            buffer: Buffer.concat(chunks),
            filename:
              type === "application/pdf"
                ? "article.pdf"
                : type === "text/plain" || type === "text/markdown"
                  ? "article.txt"
                  : "article.html",
            url: url.toString(),
          }),
        );
      },
    );
    req.on("error", () =>
      reject(
        new AppError(
          422,
          "Could not download the article. Check the URL or upload the file manually.",
        ),
      ),
    );
  });
}
