import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { AGENT_SCOPES } from "../../src/agent-scopes";

const artifactDir = "artifacts/qa";
mkdirSync(artifactDir, { recursive: true });
test("OAuth: login returns to consent, responsive permissions, deny and approve", async ({
  page,
}) => {
  const registration = await page.request.post("/register", {
    data: {
      client_name: "ChatGPT browser fixture",
      redirect_uris: ["http://127.0.0.1:3012/oauth/test-callback"],
      token_endpoint_auth_method: "none",
    },
  });
  expect(registration.status()).toBe(201);
  const client = await registration.json();
  const verifier = randomBytes(32).toString("base64url");
  const query = new URLSearchParams({
    client_id: client.client_id,
    response_type: "code",
    redirect_uri: "http://127.0.0.1:3012/oauth/test-callback",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    resource: "http://127.0.0.1:3012/mcp",
    scope: AGENT_SCOPES.join(" "),
    state: "browser-fixture",
  });
  await page.goto(`/authorize?${query}`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Connect an AI assistant",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT browser fixture/)).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "Delete articles and cards",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Read and search the entire library",
      exact: true,
    }),
  ).toBeChecked();
  await page.setViewportSize({ width: 1440, height: 900 });
  await noOverflow(page);
  await page.screenshot({
    path: `${artifactDir}/oauth-consent-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `${artifactDir}/oauth-consent-mobile.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(/error=access_denied/);
  await page.goto(`/authorize?${query}`);
  const deletion = page.getByRole("checkbox", {
    name: "Delete articles and cards",
    exact: true,
  });
  await expect(deletion).not.toBeChecked();
  await deletion.check();
  await page
    .getByRole("button", { name: "Allow selected actions", exact: true })
    .click();
  await expect(page).toHaveURL(/oauth\/test-callback\?.*code=/);
  expect(new URL(page.url()).searchParams.get("state")).toBe("browser-fixture");
});
const fixture = `<html><title>Learning from scientific articles — learning example</title><body><article><h1>Learning from scientific articles — learning example</h1><h2>Abstract</h2><p>Researchers <button class="word" data-ru="\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438">observed</button> how people learn new words through reading. A meaningful context helps us remember the language we encounter.</p><p class="ru">\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438, \u043a\u0430\u043a \u043b\u044e\u0434\u0438 \u0443\u0447\u0430\u0442 \u043d\u043e\u0432\u044b\u0435 \u0441\u043b\u043e\u0432\u0430 \u043f\u0440\u0438 \u0447\u0442\u0435\u043d\u0438\u0438. \u0421\u043e\u0434\u0435\u0440\u0436\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0439 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442 \u043f\u043e\u043c\u043e\u0433\u0430\u0435\u0442 \u0437\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u0442\u044c \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u044e\u0449\u0438\u0435\u0441\u044f \u0432\u044b\u0440\u0430\u0436\u0435\u043d\u0438\u044f.</p><h2>Reading with purpose</h2><p data-ru="\u0423\u0434\u0435\u043b\u044f\u0439\u0442\u0435 \u0432\u0440\u0435\u043c\u044f \u0438\u043d\u0442\u0435\u0440\u0435\u0441\u043d\u044b\u043c \u0441\u0442\u0430\u0442\u044c\u044f\u043c. \u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0439\u0442\u0435 \u0441\u043b\u043e\u0432\u0430, \u043a \u043a\u043e\u0442\u043e\u0440\u044b\u043c \u0445\u043e\u0442\u0438\u0442\u0435 \u0432\u0435\u0440\u043d\u0443\u0442\u044c\u0441\u044f.">Spend time with articles that interest you. Save the words you want to revisit.</p></article></body></html>`;
async function login(page: Page) {
  await page.goto("/");
  await page.screenshot({
    path: `${artifactDir}/login-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Library", exact: true }),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBeTruthy();
}
test("desktop: import → read → lemma → no duplicate → both review directions; keyboard and accessibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  await login(page);
  await page.screenshot({
    path: `${artifactDir}/desktop-empty.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add article", exact: true }).click();
  await page.getByLabel("Article file").setInputFiles({
    name: "learning.html",
    mimeType: "text/html",
    buffer: Buffer.from(fixture),
  });
  await page
    .getByRole("button", { name: "Add to library", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Learning from scientific articles/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Learning from scientific articles/ })
    .click();
  await expect(
    page.getByRole("heading", { name: /Learning from scientific/ }),
  ).toBeVisible();
  const observed = page.locator(".word").filter({ hasText: /^observed$/ });
  let suggestionRequests = 0;
  page.on("request", (req) => {
    if (req.url().endsWith("/api/words/suggest")) suggestionRequests++;
  });
  await observed.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(suggestionRequests).toBe(0);
  await page.getByRole("tooltip").hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await observed.focus();
  await expect(page.getByRole("tooltip")).toHaveText(
    "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "RU ALL" }).click();
  await expect(
    page
      .getByText(
        "\u0418\u0441\u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438",
        { exact: false },
      )
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit translation of block 1", exact: true })
    .click();
  await page
    .locator(".translation-editor textarea")
    .fill("\u0410\u043d\u043d\u043e\u0442\u0430\u0446\u0438\u044f");
  await page.route("**/api/articles/*/blocks/0", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture save failure" }),
    }),
  );
  await page
    .locator(".translation-editor")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".translation-editor textarea")).toHaveValue(
    "\u0410\u043d\u043d\u043e\u0442\u0430\u0446\u0438\u044f",
  );
  await expect(page.getByRole("alert")).toContainText("Fixture save failure");
  await page.unroute("**/api/articles/*/blocks/0");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page
    .locator(".translation-editor")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".translation-editor")).toHaveCount(0);
  await page
    .locator(".word")
    .filter({ hasText: /^observed$/ })
    .click();
  await expect(page.getByLabel("Word or phrase in its base form")).toHaveValue(
    "observe",
  );
  await expect(
    page.getByRole("textbox", { name: "Russian translation", exact: true }),
  ).toHaveValue("\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c");
  await page.getByRole("button", { name: "Add EN ↔ RU", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({
    path: `${artifactDir}/desktop-reader.png`,
    fullPage: true,
  });
  await page
    .locator(".word")
    .filter({ hasText: /^observed$/ })
    .click();
  await expect(page.getByText(/is already in your vocabulary/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add EN ↔ RU", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "My vocabulary", exact: true })
    .first()
    .click();
  await expect(page.locator(".word-pair h2")).toHaveText("observe");
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((a) => a.finished)),
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-words.png`,
    fullPage: true,
  });
  const wordsAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(wordsAxe.violations).toEqual([]);
  await page
    .getByRole("button", { name: /Review/ })
    .first()
    .click();
  await expect(page.locator(".flashcard h2")).toHaveText("observe");
  await page.getByRole("button", { name: /Show answer/ }).click();
  await expect(page.locator(".card-answer h3")).toHaveText(
    "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c",
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-study.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Good/ })
    .filter({ hasText: /^3/ })
    .click();
  await expect(page.locator(".flashcard h2")).toHaveText(
    "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u0442\u044c",
  );
  await page.locator("body").click({ position: { x: 1200, y: 130 } });
  await page.keyboard.press("Space");
  await expect(page.locator(".card-answer h3")).toHaveText("observe");
  await page.keyboard.press("3");
  await expect(page.getByText("SESSION COMPLETE")).toBeVisible();
  await page
    .getByRole("button", { name: "Library", exact: true })
    .first()
    .click();
  if (
    await page.getByRole("button", { name: "Dismiss notification" }).isVisible()
  )
    await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.evaluate(() =>
    Promise.allSettled(document.getAnimations().map((a) => a.finished)),
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-library.png`,
    fullPage: true,
  });
  const libraryAxe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(libraryAxe.violations).toEqual([]);
  await noOverflow(page);
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  await page.screenshot({
    path: `${artifactDir}/desktop-dark.png`,
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return [
        "--paper",
        "--surface",
        "--side",
        "--ink",
        "--muted",
        "--accent",
        "--accent-wash",
        "--orange",
        "--danger",
        "--translation",
      ].every((key) => {
        const raw = styles.getPropertyValue(key).trim().replace("#", "");
        const hex =
          raw.length === 3
            ? raw
                .split("")
                .map((c) => c + c)
                .join("")
            : raw;
        return (
          hex.length === 6 &&
          hex.slice(0, 2) === hex.slice(2, 4) &&
          hex.slice(2, 4) === hex.slice(4, 6)
        );
      });
    }),
  ).toBeTruthy();
  await expect(
    page
      .getByRole("button", { name: /Learning from scientific articles/ })
      .last(),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("mobile: narrow layout, reader, model connection and dark theme; keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await noOverflow(page);
  await page.screenshot({
    path: `${artifactDir}/mobile-library.png`,
    fullPage: true,
  });
  const articleButton = page
    .getByRole("button", { name: /Learning from scientific articles/ })
    .last();
  await articleButton.click();
  await page.getByRole("button", { name: "RU ALL" }).click();
  await noOverflow(page);
  await page.screenshot({
    path: `${artifactDir}/mobile-reader.png`,
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Delete articles and cards",
      exact: true,
    }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Manage without deletion", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Create and edit cards",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  await expect(page.locator(".agent-secret")).toBeVisible();
  const agentToken = await page.locator(".agent-secret code").innerText();
  const agentStatus = await page.request.get("/api/agent/status", {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  expect(agentStatus.status()).toBe(200);
  const status = await agentStatus.json();
  expect(status.scopes).toContain("cards:write");
  expect(status.scopes).not.toContain("data:delete");
  const manualToken = page
    .locator(".agent-token")
    .filter({ hasText: "Article agent" });
  await manualToken
    .getByRole("button", { name: "Revoke", exact: true })
    .click();
  await expect(manualToken).toContainText("Revoked");
  await expect(page.locator(".agent-secret")).toHaveCount(0);
  expect(
    (
      await page.request.get("/api/agent/status", {
        headers: { Authorization: `Bearer ${agentToken}` },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Check connection and list models" })
    .click();
  await expect(page.getByText(/Connected/)).toBeVisible();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  await page.screenshot({
    path: `${artifactDir}/mobile-settings.png`,
    fullPage: true,
  });
  await noOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.route("**/api/models", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Model server unavailable. Check the connection.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Check connection and list models" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Model server unavailable",
  );
  await page.screenshot({
    path: `${artifactDir}/mobile-connection-error.png`,
    fullPage: true,
  });
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
});

test("initial loading has visible feedback and reduced motion is respected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/config", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Opening your library");
  await page.screenshot({
    path: `${artifactDir}/mobile-loading.png`,
    fullPage: true,
  });
  const duration = await page
    .locator(".spin")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.01);
  release();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("word tooltip wraps within a narrow viewport and closes when leaving the word", async ({
  page,
}) => {
  // Keep native mouse selection deterministic while scrollIntoView changes layout.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.request.post("/api/import/file", {
    headers: { "X-Paperword": "1" },
    multipart: {
      file: {
        name: "learning.html",
        mimeType: "text/html",
        buffer: Buffer.from(fixture),
      },
    },
  });
  await page.reload();
  await page
    .getByRole("button", { name: /Learning from scientific articles/ })
    .last()
    .click();
  const word = page.locator(".word").filter({ hasText: /^observed$/ });
  await word.hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "\u043d\u0430\u0431\u043b\u044e\u0434\u0430\u043b\u0438",
  );
  const box = await page.getByRole("tooltip").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(378);
  await page.screenshot({
    path: `${artifactDir}/mobile-word-tooltip.png`,
    fullPage: true,
  });
  await page.mouse.move(1, 1);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  const firstWord = page.locator(".word").filter({ hasText: /^Researchers$/ });
  await firstWord.scrollIntoViewIfNeeded();
  const start = await firstWord.boundingBox();
  const end = await word.boundingBox();
  await page.mouse.move(start!.x + 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width - 2, end!.y + end!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(page.locator(".selection-bar")).toContainText(
    /Researchers\s+observed/,
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("token expiry: calendar, command, invalid dates and long-lived tokens on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Agent name", { exact: true })
    .fill("Calendar expiry fixture");
  const localExpiry = `${new Date().getFullYear() + 2}-06-17T18:30`;
  await page
    .getByLabel("Expiration date and time", { exact: true })
    .fill(localExpiry);
  const expected = await page.evaluate(
    (value) => new Date(value).toISOString(),
    localExpiry,
  );
  await noOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `${artifactDir}/token-calendar-desktop.png`,
    fullPage: true,
  });
  const calendarResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/agent-tokens") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  const created = await calendarResponse;
  expect(created.status()).toBe(201);
  expect((await created.json()).expires_at).toBe(expected);
  await expect(page.locator(".agent-secret")).toBeVisible();
  await page.getByRole("button", { name: "Hide token", exact: true }).click();
  await page.getByRole("radio", { name: "Command", exact: true }).check();
  await page.getByLabel("Duration or date", { exact: true }).fill("31.02.2027");
  await expect(
    page.getByRole("button", { name: "Create token", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".token-expiry")).toContainText(
    "This date or time does not exist",
  );
  await page.getByLabel("Duration or date", { exact: true }).fill("01.01.2020");
  await expect(page.locator(".token-expiry")).toContainText(
    "The expiration date must be in the future",
  );
  await page
    .getByLabel("Duration or date", { exact: true })
    .fill(`31.12.${new Date().getFullYear() + 2} 18:30`);
  await expect(
    page.getByRole("button", { name: "Create token", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Duration or date", { exact: true }).fill("500d");
  await page
    .getByLabel("Agent name", { exact: true })
    .fill("Command expiry fixture");
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() =>
    Promise.allSettled(
      document.getAnimations().map((animation) => animation.finished),
    ),
  );
  await noOverflow(page);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({
    path: `${artifactDir}/token-command-mobile.png`,
    fullPage: true,
  });
  const before = Date.now();
  const commandResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/agent-tokens") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create token", exact: true }).click();
  const commandCreated = await commandResponse;
  expect(commandCreated.status()).toBe(201);
  const issued = await commandCreated.json();
  expect(Date.parse(issued.expires_at)).toBeGreaterThanOrEqual(
    before + 500 * 86400000,
  );
  expect(
    (
      await page.request.get("/api/agent/status", {
        headers: { Authorization: `Bearer ${issued.token}` },
      })
    ).status(),
  ).toBe(200);
  await expect(
    page.locator(".agent-token").filter({ hasText: "Command expiry fixture" }),
  ).toContainText("Expires");
  await page.getByRole("button", { name: "Hide token", exact: true }).click();
  const expiring = await page.request.post("/api/agent-tokens", {
    headers: { "X-Paperword": "1" },
    data: { name: "Expiry status fixture", expires_in: 2 },
  });
  expect(expiring.status()).toBe(201);
  await page.reload();
  const expiredRow = page
    .locator(".agent-token")
    .filter({ hasText: "Expiry status fixture" });
  await expect(expiredRow).toContainText("Expired", { timeout: 5000 });
});
