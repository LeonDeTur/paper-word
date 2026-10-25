import { useEffect, useRef, useState } from "react";
import { Sparkles, LoaderCircle, Check } from "lucide-react";
import { Modal } from "./Modal";
import { api, json } from "../api";
import type { Card } from "../types";

export type CardDraft = {
  term: string;
  context: string;
  article_id: string | null;
  block_id: number;
  translation?: string;
  edit?: Card;
};
export function CardDialog({
  draft,
  cards,
  aiConfigured,
  onClose,
  onSaved,
}: {
  draft: CardDraft;
  cards: Card[];
  aiConfigured: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lemma, setLemma] = useState(draft.edit?.lemma || draft.term);
  const [translation, setTranslation] = useState(
    draft.edit?.translation || draft.translation || "",
  );
  const [notes, setNotes] = useState(draft.edit?.notes || "");
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const automatic = useRef<Promise<{
    lemma: string;
    translation: string;
  }> | null>(null);
  useEffect(() => {
    if (!draft.term || draft.edit || !aiConfigured) return;
    let active = true;
    setSuggesting(true);
    automatic.current ||= api<{ lemma: string; translation: string }>(
      "/words/suggest",
      {
        method: "POST",
        body: json({ term: draft.term, context: draft.context }),
      },
    );
    automatic.current
      .then((result) => {
        if (active) {
          setLemma(result.lemma);
          setTranslation(result.translation);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setSuggesting(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const normalize = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const duplicate = cards.find(
    (c) => normalize(c.lemma) === normalize(lemma) && c.id !== draft.edit?.id,
  );
  async function suggest() {
    setSuggesting(true);
    setError("");
    try {
      const result = await api<{ lemma: string; translation: string }>(
        "/words/suggest",
        {
          method: "POST",
          body: json({ term: lemma || draft.term, context: draft.context }),
        },
      );
      setLemma(result.lemma);
      setTranslation(result.translation);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSuggesting(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(draft.edit ? `/cards/${draft.edit.id}` : "/cards", {
        method: draft.edit ? "PATCH" : "POST",
        body: json({
          lemma,
          translation,
          notes,
          source_form: draft.term,
          context: draft.context,
          article_id: draft.article_id,
          block_id: draft.block_id,
        }),
      });
      onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={draft.edit ? "Изменить карточку" : "Сохранить слово"}
      onClose={() => !busy && onClose()}
    >
      <form className="stack" onSubmit={save}>
        {draft.context && (
          <blockquote lang="en" className="context-preview">
            {draft.context}
          </blockquote>
        )}
        <label>
          Слово или выражение в начальной форме
          <input
            autoFocus
            required
            maxLength={160}
            placeholder="Например, take into account"
            value={lemma}
            onChange={(e) => setLemma(e.target.value)}
            disabled={suggesting}
            lang="en"
          />
        </label>
        <p className="hint">
          Глагол — без to, существительное — в единственном числе. Сохраняйте
          выражения целиком.
        </p>
        <button
          type="button"
          className="secondary"
          disabled={!aiConfigured || suggesting || !lemma.trim()}
          onClick={suggest}
        >
          {suggesting ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          {suggesting
            ? "Модель подбирает форму…"
            : "Начальная форма и перевод с ИИ"}
        </button>
        {!aiConfigured && (
          <p className="hint">
            Для подсказок ИИ выберите модель в настройках. Можно заполнить поля
            вручную.
          </p>
        )}
        <label>
          Русский перевод
          <textarea
            required
            rows={2}
            maxLength={1000}
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            disabled={suggesting}
          />
        </label>
        <label>
          Заметка <span className="muted">· необязательно</span>
          <textarea
            rows={2}
            maxLength={3000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {duplicate && (
          <p className="notice">
            <Check size={16} />«{duplicate.lemma}» уже есть в словаре. Дубликат
            не будет добавлен.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={busy || suggesting || Boolean(duplicate)}
        >
          {busy
            ? "Сохраняем…"
            : draft.edit
              ? "Сохранить изменения"
              : "Добавить EN ↔ RU"}
        </button>
      </form>
    </Modal>
  );
}
