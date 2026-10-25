import { useState } from "react";
import { Modal } from "./Modal";
import { api, json } from "../api";
import type { Article } from "../types";

export function ArticleDialog({
  article,
  onClose,
  onUpdated,
  onDeleted,
}: {
  article: Article;
  onClose: () => void;
  onUpdated: (a: Article) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(article.title);
  const [tags, setTags] = useState(article.tags.join(", "));
  const [status, setStatus] = useState(article.status);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await api<Article>(`/articles/${article.id}`, {
          method: "PATCH",
          body: json({
            title,
            tags: [
              ...new Set(
                tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ],
            status,
          }),
        }),
      );
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/articles/${article.id}`, { method: "DELETE" });
      onDeleted();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Об статье" onClose={() => !busy && onClose()}>
      <form className="stack" onSubmit={save}>
        <label>
          Название
          <input
            required
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Темы через запятую
          <input
            placeholder="AI, исследования, разработка"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <label>
          Статус
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Article["status"])}
          >
            <option value="inbox">Новая</option>
            <option value="reading">Читаю</option>
            <option value="done">Прочитана</option>
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Сохранить
        </button>
        <div className="danger-zone">
          <p>
            Удаление статьи сохранит добавленные из неё слова и их контекст.
          </p>
          {confirm ? (
            <div className="button-row">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={remove}
              >
                Удалить статью навсегда
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirm(false)}
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => setConfirm(true)}
            >
              Удалить статью
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
