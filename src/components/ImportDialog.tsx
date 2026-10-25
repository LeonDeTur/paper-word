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
        if (!file) throw new Error("Choose a file.");
        if (file.size > 15 * 1024 * 1024)
          throw new Error("The maximum file size is 15 MB.");
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
    <Modal title="Add article" onClose={() => !busy && onClose()}>
      <div className="segments" aria-label="Import method">
        {[
          ["file", FileUp, "File"],
          ["url", Link2, "URL"],
          ["text", AlignLeft, "Text"],
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
                {file ? file.name : "Choose a file or drop it here"}
              </strong>
              <span>HTML, PDF, TXT or Markdown · up to 15 MB</span>
              <input
                aria-label="Article file"
                type="file"
                required
                accept=".html,.htm,.pdf,.txt,.md"
                disabled={busy}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <p className="hint">
              Text and available translations are extracted from HTML. The
              original PDF is saved; scans without a text layer require OCR.
            </p>
          </>
        )}
        {tab === "url" && (
          <>
            <label>
              Article URL
              <input
                type="url"
                placeholder="https://…"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <p className="hint">
              Use a direct URL to HTML or PDF. If the website blocks access,
              upload the file.
            </p>
          </>
        )}
        {tab === "text" && (
          <>
            <label>
              Title
              <input
                required
                maxLength={500}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              English text
              <textarea
                required
                rows={9}
                maxLength={500_000}
                placeholder="Separate paragraphs with a blank line"
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
              Adding…
            </>
          ) : (
            "Add to library"
          )}
        </button>
      </form>
    </Modal>
  );
}
