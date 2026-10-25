import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  Layers,
  GraduationCap,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  X,
  LoaderCircle,
} from "lucide-react";
import { api, json } from "./api";
import type { Article, Card, Config } from "./types";
import { Library } from "./components/Library";
import { Words } from "./components/Words";
import { Reader } from "./components/Reader";
import { Study } from "./components/Study";
import { Settings } from "./components/Settings";
import { ImportDialog } from "./components/ImportDialog";
import { CardDialog, type CardDraft } from "./components/CardDialog";
import { ArticleDialog } from "./components/ArticleDialog";
import { Modal } from "./components/Modal";
import { OAuthConsent } from "./components/OAuthConsent";

type Page = "library" | "words" | "study" | "settings";
const navigation = [
  { id: "library" as const, label: "Библиотека", icon: BookOpen },
  { id: "words" as const, label: "Мой словарь", icon: Layers },
  { id: "study" as const, label: "Повторение", icon: GraduationCap },
];
function readRoute() {
  const match = location.hash.match(
    /^#article\/([a-f0-9-]+)(?:\/block\/\d+)?$/,
  );
  return {
    page: (["words", "study", "settings"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "library") as Page,
    articleId: match?.[1] || null,
  };
}
export function App() {
  const [route, setRoute] = useState(readRoute);
  const [config, setConfig] = useState<Config | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [manage, setManage] = useState(false);
  const [deleteCard, setDeleteCard] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("paperword-theme") || "light",
  );
  const showError = useCallback((message: string) => {
    setNotice("");
    setError(message);
  }, []);
  const refreshData = useCallback(async () => {
    const [nextArticles, nextCards] = await Promise.all([
      api<Article[]>("/articles"),
      api<Card[]>("/cards"),
    ]);
    setArticles(nextArticles);
    setCards(nextCards);
  }, []);
  const refreshConfig = useCallback(async () => {
    const next = await api<Config>("/config");
    setConfig(next);
    return next;
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await refreshConfig();
      if (next.authenticated) await refreshData();
    } catch (error) {
      showError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refreshConfig, refreshData, showError]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#000000" : "#faf9f6");
    localStorage.setItem("paperword-theme", theme);
  }, [theme]);
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setManage(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const hasRunningJob = articles.some((a) => a.job_state === "running");
  useEffect(() => {
    if (!hasRunningJob) return;
    const timer = setInterval(() => {
      void api<Article[]>("/articles")
        .then(setArticles)
        .catch((e) => showError(e.message));
    }, 2200);
    return () => clearInterval(timer);
  }, [hasRunningJob, showError]);
  const article = articles.find((a) => a.id === route.articleId);
  const due = cards
    .flatMap((c) => c.schedules)
    .filter((s) => s.due_at <= new Date().toISOString()).length;
  function navigate(page: Page) {
    location.hash = page;
  }
  function updated(next: Article) {
    setArticles((current) => current.map((a) => (a.id === next.id ? next : a)));
  }
  function open(next: Article, block?: number) {
    location.hash = `article/${next.id}${block !== undefined ? `/block/${block}` : ""}`;
    if (next.status === "inbox")
      void api<Article>(`/articles/${next.id}`, {
        method: "PATCH",
        body: json({ status: "reading" }),
      })
        .then(updated)
        .catch((e) => showError(e.message));
  }
  if (loading)
    return (
      <main className="fatal" role="status">
        <div className="brand">
          paperword<span>↗</span>
        </div>
        <LoaderCircle className="spin" />
        <p>Открываем вашу библиотеку…</p>
      </main>
    );
  if (!config)
    return (
      <main className="fatal">
        <h1>Не удалось подключиться к сервису</h1>
        <p role="alert">{error}</p>
        <button className="primary" onClick={initialize}>
          Попробовать снова
        </button>
      </main>
    );
  if (!config.authenticated) return <Login onLoggedIn={initialize} />;
  if (location.pathname === "/oauth/consent") return <OAuthConsent />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#library"
          aria-label="Paperword — библиотека"
        >
          paperword<span>↗</span>
        </a>
        <p className="brand-caption">READ TO REMEMBER</p>
        <nav className="main-nav" aria-label="Основная навигация">
          {navigation.map((n) => (
            <button
              key={n.id}
              className={route.page === n.id ? "active" : ""}
              aria-current={route.page === n.id ? "page" : undefined}
              onClick={() => navigate(n.id)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.id === "study" && due > 0 && (
                <span className="nav-count">{due}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="small-line" />
          <p>
            Read a little.
            <br />
            Learn a little.
            <br />
            <em>Every day.</em>
          </p>
          <ArrowUpRight size={21} />
        </div>
        <div className="sidebar-bottom">
          <button
            className={route.page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={19} />
            Настройки
          </button>
          <button
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            {theme === "light" ? "Чёрная тема" : "Светлая тема"}
          </button>
          {config.password_required && (
            <button
              onClick={async () => {
                try {
                  await api("/logout", { method: "POST" });
                  setArticles([]);
                  setCards([]);
                  await refreshConfig();
                } catch (e) {
                  showError((e as Error).message);
                }
              }}
            >
              <LogOut size={19} />
              Выйти
            </button>
          )}
          <div className="private-label">
            <span className="connection-dot" />
            Личная библиотека
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            {article
              ? "Библиотека / Чтение"
              : route.page === "library"
                ? "Моя библиотека"
                : route.page === "words"
                  ? "Словарь"
                  : route.page === "study"
                    ? "Практика"
                    : "Настройки"}
          </span>
          <div>
            <span>{cards.length} слов</span>
            <span className="topbar-dot">·</span>
            <span>{articles.length} статей</span>
            <div className="avatar" aria-label="Личный профиль">
              Я
            </div>
          </div>
        </header>
        <main id="main-content">
          {route.articleId ? (
            article ? (
              <Reader
                key={article.id}
                article={article}
                aiConfigured={config.ai_configured}
                onBack={() => navigate("library")}
                onUpdated={updated}
                onWord={setDraft}
                onError={showError}
                onManage={() => setManage(true)}
              />
            ) : (
              <div className="empty-state">
                <h1>Статья не найдена</h1>
                <button className="primary" onClick={() => navigate("library")}>
                  В библиотеку
                </button>
              </div>
            )
          ) : route.page === "library" ? (
            <Library
              articles={articles}
              onAdd={() => setImporting(true)}
              onOpen={open}
              onStar={(a) => {
                void api<Article>(`/articles/${a.id}`, {
                  method: "PATCH",
                  body: json({ starred: !a.starred }),
                })
                  .then(updated)
                  .catch((e) => showError(e.message));
              }}
            />
          ) : route.page === "words" ? (
            <Words
              cards={cards}
              onAdd={() =>
                setDraft({
                  term: "",
                  context: "",
                  article_id: null,
                  block_id: 0,
                })
              }
              onEdit={(c) =>
                setDraft({
                  term: c.source_form,
                  context: c.context,
                  article_id: c.article_id,
                  block_id: c.block_id,
                  edit: c,
                })
              }
              onDelete={setDeleteCard}
              onStudy={() => navigate("study")}
              onSource={(c) => {
                const source = articles.find((a) => a.id === c.article_id);
                if (source) open(source, c.block_id);
              }}
            />
          ) : route.page === "study" ? (
            <Study
              onChanged={() => {
                void refreshData().catch((e) => showError(e.message));
              }}
              onWords={() => navigate("words")}
            />
          ) : (
            <>
              <div className="mobile-theme">
                <button
                  className="secondary"
                  onClick={() =>
                    setTheme((t) => (t === "light" ? "dark" : "light"))
                  }
                >
                  {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
                  {theme === "light" ? "Чёрная тема" : "Светлая тема"}
                </button>
                {config.password_required && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await api("/logout", { method: "POST" });
                        setArticles([]);
                        setCards([]);
                        await refreshConfig();
                      } catch (e) {
                        showError((e as Error).message);
                      }
                    }}
                  >
                    Выйти
                  </button>
                )}
              </div>
              <Settings
                config={config}
                onSaved={() => {
                  void refreshConfig().catch((e) => showError(e.message));
                }}
                onError={showError}
              />
            </>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {[
          ...navigation,
          { id: "settings" as const, label: "Настройки", icon: SettingsIcon },
        ].map((n) => (
          <button
            key={n.id}
            className={route.page === n.id ? "active" : ""}
            onClick={() => navigate(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Закрыть ошибку"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onAdded={(a) => {
            setArticles((current) => [
              a,
              ...current.filter((existing) => existing.id !== a.id),
            ]);
            setNotice("Статья добавлена в библиотеку.");
          }}
        />
      )}
      {draft && (
        <CardDialog
          draft={draft}
          cards={cards}
          aiConfigured={config.ai_configured}
          onClose={() => setDraft(null)}
          onSaved={() => {
            void refreshData().catch((e) => showError(e.message));
            setNotice(
              draft.edit
                ? "Карточка обновлена."
                : "Добавлено в словарь. Оба направления готовы к повторению.",
            );
          }}
        />
      )}
      {manage && article && (
        <ArticleDialog
          article={article}
          onClose={() => setManage(false)}
          onUpdated={updated}
          onDeleted={() => {
            setArticles((current) =>
              current.filter((a) => a.id !== article.id),
            );
            navigate("library");
            void refreshData().catch((e) => showError(e.message));
          }}
        />
      )}
      {deleteCard && (
        <Modal
          title="Удалить слово?"
          onClose={() => !deleting && setDeleteCard(null)}
        >
          <p>
            «{deleteCard.lemma}» и расписание повторений в обоих направлениях
            будут удалены.
          </p>
          <div className="button-row">
            <button
              className="danger"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await api(`/cards/${deleteCard.id}`, { method: "DELETE" });
                  setDeleteCard(null);
                  await refreshData();
                } catch (e) {
                  showError((e as Error).message);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              Удалить
            </button>
            <button className="secondary" onClick={() => setDeleteCard(null)}>
              Отмена
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login-screen">
      <div className="login-panel">
        <div className="brand">
          paperword<span>↗</span>
        </div>
        <span className="eyebrow">ВАШЕ МЕСТО ДЛЯ НОВЫХ ИДЕЙ</span>
        <h1>Рады продолжить.</h1>
        <p>Войдите в личную библиотеку статей и слов.</p>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/login", { method: "POST", body: json({ password }) });
              await onLoggedIn();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Пароль
            <input
              autoFocus
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
            <ArrowUpRight size={17} />
          </button>
        </form>
      </div>
    </main>
  );
}
