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
    <Modal title="About article" onClose={() => !busy && onClose()}>
      <form className="stack" onSubmit={save}>
        <label>
          Title
          <input
            required
            value={title}
            maxLength={500}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Comma-separated topics
          <input
            placeholder="AI, research, engineering"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Article["status"])}
          >
            <option value="inbox">New</option>
            <option value="reading">Reading</option>
            <option value="done">Read</option>
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          Save
        </button>
        <div className="danger-zone">
          <p>
            Deleting the article keeps words saved from it and their context.
          </p>
          {confirm ? (
            <div className="button-row">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={remove}
              >
                Delete article permanently
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button danger-text"
              onClick={() => setConfirm(true)}
            >
              Delete article
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
