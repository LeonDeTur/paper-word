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
      title={draft.edit ? "Edit card" : "Save word"}
      onClose={() => !busy && onClose()}
    >
      <form className="stack" onSubmit={save}>
        {draft.context && (
          <blockquote lang="en" className="context-preview">
            {draft.context}
          </blockquote>
        )}
        <label>
          Word or phrase in its base form
          <input
            autoFocus
            required
            maxLength={160}
            placeholder="For example, take into account"
            value={lemma}
            onChange={(e) => setLemma(e.target.value)}
            disabled={suggesting}
            lang="en"
          />
        </label>
        <p className="hint">
          Use verbs without “to” and nouns in the singular. Keep phrases
          together.
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
            ? "Finding the base form…"
            : "Suggest base form and translation with AI"}
        </button>
        {!aiConfigured && (
          <p className="hint">
            Select a model in Settings for AI suggestions. You can also fill in
            the fields manually.
          </p>
        )}
        <label>
          Russian translation
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
          Note <span className="muted">· optional</span>
          <textarea
            rows={2}
            maxLength={3000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {duplicate && (
          <p className="notice">
            <Check size={16} />“{duplicate.lemma}” is already in your
            vocabulary. A duplicate will not be added.
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
          {busy ? "Saving…" : draft.edit ? "Save changes" : "Add EN ↔ RU"}
        </button>
      </form>
    </Modal>
  );
}
