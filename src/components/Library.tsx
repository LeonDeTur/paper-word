import { useState } from "react";
import {
  Search,
  ArrowUpRight,
  Star,
  BookOpen,
  Plus,
  FileText,
} from "lucide-react";
import type { Article } from "../types";

const names = { inbox: "Новая", reading: "Читаю", done: "Прочитана" };
export function Library({
  articles,
  onOpen,
  onAdd,
  onStar,
}: {
  articles: Article[];
  onOpen: (a: Article) => void;
  onAdd: () => void;
  onStar: (a: Article) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tag, setTag] = useState("");
  const tags = [...new Set(articles.flatMap((a) => a.tags))];
  const list = articles.filter(
    (a) =>
      (!search ||
        `${a.title} ${a.tags.join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "all" ||
        (filter === "starred" ? a.starred : a.status === filter)) &&
      (!tag || a.tags.includes(tag)),
  );
  const reading = articles.find((a) => a.status === "reading");
  return (
    <div className="page library-page">
      <div className="eyebrow">ВАШЕ ПРОСТРАНСТВО ДЛЯ ЧТЕНИЯ</div>
      <div className="page-heading">
        <div>
          <h1>Библиотека</h1>
          <p className="subtitle">
            Читайте о том, что интересно. Запоминайте то, что пригодится.
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={18} />
          Добавить статью
        </button>
      </div>
      {reading && !search && filter === "all" && (
        <button className="continue-reading" onClick={() => onOpen(reading)}>
          <div className="continue-icon">
            <BookOpen size={24} />
          </div>
          <div>
            <span className="eyebrow">ПРОДОЛЖИТЬ ЧТЕНИЕ</span>
            <strong>{reading.title}</strong>
            <span className="muted">
              Фрагмент {reading.read_block + 1} из {reading.blocks.length}
            </span>
          </div>
          <ArrowUpRight size={24} />
        </button>
      )}
      <div className="library-toolbar">
        <div className="filters" aria-label="Фильтр статей">
          {[
            ["all", "Все статьи"],
            ["inbox", "Новые"],
            ["reading", "Читаю"],
            ["done", "Прочитаны"],
            ["starred", "Избранное"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
              {key === "all" && (
                <span className="count">{articles.length}</span>
              )}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Поиск статей"
            placeholder="Найти статью"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {tags.length > 0 && (
        <div className="tag-filter">
          <button className={!tag ? "active" : ""} onClick={() => setTag("")}>
            Все темы
          </button>
          {tags.map((t) => (
            <button
              key={t}
              className={tag === t ? "active" : ""}
              onClick={() => setTag(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {!list.length ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <FileText size={36} strokeWidth={1.25} />
          </div>
          <h2>
            {articles.length
              ? "Ничего не найдено"
              : "Большие идеи начинаются с одной статьи"}
          </h2>
          <p>
            {articles.length
              ? "Попробуйте другой запрос или сбросьте фильтры."
              : "Добавьте готовый перевод, PDF или ссылку. Ваша библиотека и словарь будут расти вместе."}
          </p>
          {articles.length ? (
            <button
              className="secondary"
              onClick={() => {
                setFilter("all");
                setSearch("");
                setTag("");
              }}
            >
              Сбросить фильтры
            </button>
          ) : (
            <button className="primary" onClick={onAdd}>
              <Plus size={17} />
              Добавить первую статью
            </button>
          )}
        </div>
      ) : (
        <div className="article-list">
          {list.map((a, i) => {
            const translated = a.blocks.filter((b) => b.ru).length;
            const progress =
              a.status === "done"
                ? 100
                : a.status === "reading"
                  ? Math.round(((a.read_block + 1) / a.blocks.length) * 100)
                  : 0;
            return (
              <article className="article-row" key={a.id}>
                <div className="article-number">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="article-body">
                  <div className="article-meta">
                    <span className={`status ${a.status}`}>
                      {names[a.status]}
                    </span>
                    <span>
                      {Math.max(
                        1,
                        Math.ceil(
                          a.blocks.reduce(
                            (n, b) => n + b.text.split(/\s+/).length,
                            0,
                          ) / 180,
                        ),
                      )}{" "}
                      мин чтения
                    </span>
                    <span>
                      {new Date(a.created_at).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <button className="article-title" onClick={() => onOpen(a)}>
                    {a.title}
                    <ArrowUpRight size={20} />
                  </button>
                  <div className="article-description">
                    {a.blocks
                      .find((b) => b.kind === "paragraph")
                      ?.text.slice(0, 185)}
                  </div>
                  <div className="article-bottom">
                    <div className="tags">
                      {a.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                      <span className="translation-state">
                        {a.job_state === "running"
                          ? "Переводим…"
                          : translated
                            ? `RU ${translated}/${a.blocks.filter((b) => b.kind !== "figure").length}`
                            : "Перевод не добавлен"}
                      </span>
                    </div>
                    {progress > 0 && (
                      <span className="reading-progress">
                        Прочитано {progress}%
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`icon-button star ${a.starred ? "selected" : ""}`}
                  aria-label={
                    a.starred ? "Убрать из избранного" : "В избранное"
                  }
                  onClick={() => onStar(a)}
                >
                  <Star size={19} fill={a.starred ? "currentColor" : "none"} />
                </button>
              </article>
            );
          })}
        </div>
      )}
      <div className="library-footnote">
        <span>ENGLISH IN CONTEXT</span>
        <span>Одна статья. Несколько новых слов. Каждый день.</span>
      </div>
    </div>
  );
}
