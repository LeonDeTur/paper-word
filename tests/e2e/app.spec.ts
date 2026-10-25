import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

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
    scope: "articles:import",
    state: "browser-fixture",
  });
  await page.goto(`/authorize?${query}`);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("browser-fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Подключить ChatGPT", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/ChatGPT browser fixture/)).toBeVisible();
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
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page).toHaveURL(/error=access_denied/);
  await page.goto(`/authorize?${query}`);
  await page
    .getByRole("button", { name: "Разрешить загрузку статей", exact: true })
    .click();
  await expect(page).toHaveURL(/oauth\/test-callback\?.*code=/);
  expect(new URL(page.url()).searchParams.get("state")).toBe("browser-fixture");
});
const fixture = `<html><title>Learning from scientific articles — учебный пример</title><body><article><h1>Learning from scientific articles — учебный пример</h1><h2>Abstract</h2><p>Researchers <button class="word" data-ru="наблюдали">observed</button> how people learn new words through reading. A meaningful context helps us remember the language we encounter.</p><p class="ru">Исследователи наблюдали, как люди учат новые слова при чтении. Содержательный контекст помогает запоминать встречающиеся выражения.</p><h2>Reading with purpose</h2><p data-ru="Уделяйте время интересным статьям. Сохраняйте слова, к которым хотите вернуться.">Spend time with articles that interest you. Save the words you want to revisit.</p></article></body></html>`;
async function login(page: Page) {
  await page.goto("/");
  await page.screenshot({
    path: `${artifactDir}/login-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("browser-fixture-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Библиотека", exact: true }),
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
  await page
    .getByRole("button", { name: "Добавить статью", exact: true })
    .click();
  await page.getByLabel("Файл статьи").setInputFiles({
    name: "learning.html",
    mimeType: "text/html",
    buffer: Buffer.from(fixture),
  });
  await page
    .getByRole("button", { name: "Добавить в библиотеку", exact: true })
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
  await expect(page.getByRole("tooltip")).toHaveText("наблюдали");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(suggestionRequests).toBe(0);
  await page.getByRole("tooltip").hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await observed.focus();
  await expect(page.getByRole("tooltip")).toHaveText("наблюдали");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "RU ALL" }).click();
  await expect(
    page.getByText("Исследователи наблюдали", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Изменить перевод фрагмента 1", exact: true })
    .click();
  await page.locator(".translation-editor textarea").fill("Аннотация");
  await page.route("**/api/articles/*/blocks/0", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Тестовый сбой сохранения" }),
    }),
  );
  await page
    .locator(".translation-editor")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(page.locator(".translation-editor textarea")).toHaveValue(
    "Аннотация",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Тестовый сбой сохранения",
  );
  await page.unroute("**/api/articles/*/blocks/0");
  await page.getByRole("button", { name: "Закрыть ошибку" }).click();
  await page
    .locator(".translation-editor")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(page.locator(".translation-editor")).toHaveCount(0);
  await page
    .locator(".word")
    .filter({ hasText: /^observed$/ })
    .click();
  await expect(
    page.getByLabel("Слово или выражение в начальной форме"),
  ).toHaveValue("observe");
  await expect(
    page.getByRole("textbox", { name: "Русский перевод", exact: true }),
  ).toHaveValue("наблюдать");
  await page
    .getByRole("button", { name: "Добавить EN ↔ RU", exact: true })
    .click();
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await page.screenshot({
    path: `${artifactDir}/desktop-reader.png`,
    fullPage: true,
  });
  await page
    .locator(".word")
    .filter({ hasText: /^observed$/ })
    .click();
  await expect(page.getByText(/уже есть в словаре/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Добавить EN ↔ RU", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Мой словарь", exact: true })
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
    .getByRole("button", { name: /Повторение/ })
    .first()
    .click();
  await expect(page.locator(".flashcard h2")).toHaveText("observe");
  await page.getByRole("button", { name: /Показать ответ/ }).click();
  await expect(page.locator(".card-answer h3")).toHaveText("наблюдать");
  await page.screenshot({
    path: `${artifactDir}/desktop-study.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /Помню/ })
    .filter({ hasText: /^3/ })
    .click();
  await expect(page.locator(".flashcard h2")).toHaveText("наблюдать");
  await page.locator("body").click({ position: { x: 1200, y: 130 } });
  await page.keyboard.press("Space");
  await expect(page.locator(".card-answer h3")).toHaveText("observe");
  await page.keyboard.press("3");
  await expect(page.getByText("ЗАНЯТИЕ ЗАВЕРШЕНО")).toBeVisible();
  await page
    .getByRole("button", { name: "Библиотека", exact: true })
    .first()
    .click();
  if (
    await page.getByRole("button", { name: "Закрыть уведомление" }).isVisible()
  )
    await page.getByRole("button", { name: "Закрыть уведомление" }).click();
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
  await page.getByRole("button", { name: "Чёрная тема", exact: true }).click();
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
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Создать токен на 90 дней", exact: true })
    .click();
  await expect(page.locator(".agent-secret")).toBeVisible();
  const agentToken = await page.locator(".agent-secret code").innerText();
  const agentStatus = await page.request.get("/api/agent/status", {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  expect(agentStatus.status()).toBe(200);
  const manualToken = page
    .locator(".agent-token")
    .filter({ hasText: "Агент статей" });
  await manualToken
    .getByRole("button", { name: "Отозвать", exact: true })
    .click();
  await expect(manualToken).toContainText("Отозван");
  await expect(page.locator(".agent-secret")).toHaveCount(0);
  expect(
    (
      await page.request.get("/api/agent/status", {
        headers: { Authorization: `Bearer ${agentToken}` },
      })
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Проверить подключение и список моделей" })
    .click();
  await expect(page.getByText(/Соединение установлено/)).toBeVisible();
  await page.getByRole("button", { name: "Чёрная тема", exact: true }).click();
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
        error: "Сервер моделей недоступен. Проверьте подключение.",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "Проверить подключение и список моделей" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Сервер моделей недоступен",
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
  await expect(page.getByRole("status")).toContainText(
    "Открываем вашу библиотеку",
  );
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
    page.getByRole("button", { name: "Войти", exact: true }),
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
  await expect(page.getByRole("tooltip")).toHaveText("наблюдали");
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
