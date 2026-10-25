import { useState } from "react";
import {
  Plus,
  Search,
  ArrowUpRight,
  Pencil,
  Trash2,
  Layers,
  ArrowRight,
} from "lucide-react";
import type { Card } from "../types";

export function Words({
  cards,
  onAdd,
  onEdit,
  onDelete,
  onStudy,
  onSource,
}: {
  cards: Card[];
  onAdd: () => void;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
  onStudy: () => void;
  onSource: (card: Card) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const due = cards.filter((c) =>
    c.schedules.some((s) => s.due_at <= new Date().toISOString()),
  );
  const list = cards.filter(
    (c) =>
      (filter === "all" || due.includes(c)) &&
      `${c.lemma} ${c.translation} ${c.context}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="eyebrow">WORDS THAT STAY WITH YOU</div>
      <div className="page-heading">
        <div>
          <h1>My vocabulary</h1>
          <p className="subtitle">New words in familiar contexts.</p>
        </div>
        <button className="primary" onClick={onAdd}>
          <Plus size={17} />
          Add word
        </button>
      </div>
      <div className="word-summary">
        <div>
          <strong>{cards.length}</strong>
          <span>words and phrases</span>
        </div>
        <div>
          <strong>{due.length}</strong>
          <span>due for review</span>
        </div>
        <button className="text-button" onClick={onStudy}>
          Start session
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="library-toolbar">
        <div className="filters">
          <button
            className={filter === "all" ? "active" : ""}
            onClick={() => setFilter("all")}
          >
            All words
          </button>
          <button
            className={filter === "due" ? "active" : ""}
            onClick={() => setFilter("due")}
          >
            Due for review
          </button>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search words"
            placeholder="Word or translation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {!list.length ? (
        <div className="empty-state">
          <div className="empty-illustration">
            <Layers size={34} strokeWidth={1.25} />
          </div>
          <h2>
            {cards.length ? "No matching words" : "Words make sense in context"}
          </h2>
          <p>
            {cards.length
              ? "Change your search or filter."
              : "Click a word in an article or add it manually. Each entry gets two review directions."}
          </p>
          <button className="secondary" onClick={onAdd}>
            Add word
          </button>
        </div>
      ) : (
        <div className="word-list">
          {list.map((c) => (
            <article className="word-row" key={c.id}>
              <div className="word-main">
                <div className="word-pair">
                  <h2 lang="en">{c.lemma}</h2>
                  <span>{c.translation}</span>
                </div>
                {c.context && (
                  <p className="word-context" lang="en">
                    {c.context}
                  </p>
                )}
                <div className="word-details">
                  {c.article_id && (
                    <button className="source-link" onClick={() => onSource(c)}>
                      {c.article_title}
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                  <span>
                    {c.schedules
                      .map(
                        (s) =>
                          `${s.direction === "en-ru" ? "EN → RU" : "RU → EN"}: ${s.due_at <= new Date().toISOString() ? "due now" : new Date(s.due_at).toLocaleDateString("en-GB")}`,
                      )
                      .join(" · ")}
                  </span>
                </div>
                {c.notes && <p className="hint">{c.notes}</p>}
              </div>
              <div className="word-actions">
                <button
                  className="icon-button"
                  aria-label={`Edit ${c.lemma}`}
                  onClick={() => onEdit(c)}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Delete ${c.lemma}`}
                  onClick={() => onDelete(c)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
