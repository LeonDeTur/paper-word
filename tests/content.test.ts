import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHtml,
  parseFile,
  isPublicAddress,
  fetchArticle,
} from "../server/content.ts";

test("HTML import pairs translations and extracts word hints without executing source scripts", () => {
  const parsed = parseHtml(
    '<html><title>Example</title><body><script>throw new Error("malicious")</script><article><h1>Example</h1><h2>Abstract</h2><p>The <span data-ru="\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435">study</span> begins.</p><p class="ru">\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u0430\u0447\u0438\u043d\u0430\u0435\u0442\u0441\u044f.</p><p data-en="Another result." data-ru="\u0414\u0440\u0443\u0433\u043e\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442."></p><iframe src="https://evil.invalid"></iframe></article></body></html>',
  );
  assert.equal(parsed.title, "Example");
  assert.equal(parsed.blocks.length, 3);
  assert.equal(parsed.blocks[1].text, "The study begins.");
  assert.equal(
    parsed.blocks[1].ru,
    "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435 \u043d\u0430\u0447\u0438\u043d\u0430\u0435\u0442\u0441\u044f.",
  );
  assert.equal(
    parsed.blocks[2].ru,
    "\u0414\u0440\u0443\u0433\u043e\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442.",
  );
  assert.equal(
    parsed.dictionary.study,
    "\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u0435",
  );
  assert.ok(!JSON.stringify(parsed).includes("malicious"));
  assert.ok(!JSON.stringify(parsed).includes("iframe"));
});
test("blocks internal, reserved and mapped IPv6 destinations", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.1.1",
    "169.254.169.254",
    "192.168.1.1",
    "172.16.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  await assert.rejects(fetchArticle("http://127.0.0.1/"), /local and reserved/);
  await assert.rejects(fetchArticle("file:///etc/passwd"), /HTTP/);
});
test("rejects unsupported and fake PDF files without storing anything", async () => {
  await assert.rejects(
    parseFile(Buffer.from("hello"), "test.exe"),
    /are supported/,
  );
  await assert.rejects(
    parseFile(Buffer.from("hello"), "test.pdf"),
    /does not appear/,
  );
});
test("preserves paragraphs in plain-text uploads", async () => {
  const result = await parseFile(
    Buffer.from("First paragraph.\n\nSecond paragraph."),
    "example.txt",
  );
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[1].text, "Second paragraph.");
});

test("legacy word buttons survive, Russian paragraphs pair across controls, and div.en blocks import", () => {
  const source =
    '<main><h1>Legacy reader</h1><div class="bilingual-block"><p class="article-text"><button class="word" data-ru="\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f">Studies</button> matter.</p><input type="checkbox"><label>RU</label><p class="ru-paragraph" lang="ru">\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f \u0432\u0430\u0436\u043d\u044b.</p></div><div><div class="en">Another English paragraph.</div><div class="translate-toggle"><button>RU</button></div><div class="ru-paragraph">\u0414\u0440\u0443\u0433\u043e\u0439 \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u0438\u0439 \u0430\u0431\u0437\u0430\u0446.</div></div></main>';
  const parsed = parseHtml(source);
  assert.equal(parsed.blocks.length, 2);
  assert.equal(parsed.blocks[0].text, "Studies matter.");
  assert.equal(
    parsed.blocks[0].ru,
    "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f \u0432\u0430\u0436\u043d\u044b.",
  );
  assert.equal(
    parsed.blocks[1].ru,
    "\u0414\u0440\u0443\u0433\u043e\u0439 \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u0438\u0439 \u0430\u0431\u0437\u0430\u0446.",
  );
  assert.equal(
    parsed.dictionary.studies,
    "\u0438\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u043d\u0438\u044f",
  );
});

test("extracts actual text from a small valid PDF", async () => {
  const stream = "BT /F1 12 Tf 72 720 Td (Learning English from papers.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const parsed = await parseFile(Buffer.from(pdf), "fixture.pdf");
  assert.match(
    parsed.blocks.map((b) => b.text).join(" "),
    /Learning English from papers/,
  );
});
