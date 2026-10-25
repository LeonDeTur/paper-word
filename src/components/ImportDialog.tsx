import { useState } from "react";
import { FileUp, Link2, AlignLeft, LoaderCircle } from "lucide-react";
import { Modal } from "./Modal";
import { api, json } from "../api";
import type { Article } from "../types";

export function ImportDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (article: Article) => void;
}) {
  const [tab, setTab] = useState("file");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let article: Article;
      if (tab === "file") {
        if (!file) throw new Error("Выберите файл.");
        if (file.size > 15 * 1024 * 1024)
          throw new Error("Максимальный размер файла — 15 МБ.");
        const data = new FormData();
        data.set("file", file);
        article = await api<Article>("/import/file", {
          method: "POST",
          body: data,
        });
      } else
        article = await api<Article>(`/import/${tab}`, {
          method: "POST",
          body: json(tab === "url" ? { url } : { title, text }),
        });
      onAdded(article);
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Добавить статью" onClose={() => !busy && onClose()}>
      <div className="segments" aria-label="Способ добавления">
        {[
          ["file", FileUp, "Файл"],
          ["url", Link2, "Ссылка"],
          ["text", AlignLeft, "Текст"],
        ].map(([key, Icon, label]) => (
          <button
            key={String(key)}
            disabled={busy}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(String(key));
              setError("");
            }}
          >
            <Icon size={16} />
            {String(label)}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="stack">
        {tab === "file" && (
          <>
            <label className="dropzone">
              <FileUp size={34} />
              <strong>
                {file ? file.name : "Выберите файл или перетащите его сюда"}
              </strong>
              <span>HTML, PDF, TXT или Markdown · до 15 МБ</span>
              <input
                aria-label="Файл статьи"
                type="file"
                required
                accept=".html,.htm,.pdf,.txt,.md"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <p className="hint">
              Из HTML извлекаются текст и доступные переводы. Для PDF
              сохраняется оригинал; сканы без текстового слоя требуют OCR.
            </p>
          </>
        )}
        {tab === "url" && (
          <>
            <label>
              Ссылка на статью
              <input
                type="url"
                placeholder="https://…"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <p className="hint">
              Подойдёт прямая ссылка на HTML или PDF. Если сайт закрывает
              доступ, загрузите файл.
            </p>
          </>
        )}
        {tab === "text" && (
          <>
            <label>
              Название
              <input
                required
                maxLength={500}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Английский текст
              <textarea
                required
                rows={9}
                maxLength={500_000}
                placeholder="Разделяйте абзацы пустой строкой"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} />
              Добавляем…
            </>
          ) : (
            "Добавить в библиотеку"
          )}
        </button>
      </form>
    </Modal>
  );
}
