import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  Languages,
  Sparkles,
  Check,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  BookmarkPlus,
  Pencil,
  X,
  List,
  Square,
} from "lucide-react";
import { api, json } from "../api";
import type { Article, Block } from "../types";
import type { CardDraft } from "./CardDialog";
import { WordTooltip } from "./WordTooltip";

const PAGE_SIZE = 24;
export function Reader({
  article,
  aiConfigured,
  onBack,
  onUpdated,
  onWord,
  onError,
  onManage,
}: {
  article: Article;
  aiConfigured: boolean;
  onBack: () => void;
  onUpdated: (a: Article) => void;
  onWord: (draft: CardDraft) => void;
  onError: (message: string) => void;
  onManage: () => void;
}) {
  const [allRu, setAllRu] = useState(false);
  const [visibleRu, setVisibleRu] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(Math.floor(article.read_block / PAGE_SIZE));
  const [contents, setContents] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [selection, setSelection] = useState<{
    term: string;
    block: Block;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [wordHint, setWordHint] = useState<{
    anchor: HTMLElement;
    translation: string;
  } | null>(null);
  const hintId = useId();
  const hideHintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function keepWordHint() {
    clearTimeout(hideHintTimer.current);
  }
  function hideWordHint() {
    clearTimeout(hideHintTimer.current);
    setWordHint(null);
  }
  function leaveWordHint() {
    clearTimeout(hideHintTimer.current);
    hideHintTimer.current = setTimeout(() => setWordHint(null), 160);
  }
  function showWordHint(anchor: HTMLElement, term: string) {
    keepWordHint();
    setWordHint({
      anchor,
      translation:
        article.dictionary[term.toLowerCase()]?.trim() || "No translation yet",
    });
  }
  useEffect(() => {
    const dismiss = () => {
      clearTimeout(hideHintTimer.current);
      setWordHint(null);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      clearTimeout(hideHintTimer.current);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, []);
  const body = useRef<HTMLDivElement>(null);
  const onUpdateRef = useRef(onUpdated);
  onUpdateRef.current = onUpdated;
  const lastRead = useRef(article.read_block);
  const blocks = article.blocks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => {
    const target = location.hash.match(/\/block\/(\d+)$/)?.[1];
    const index = target ? Number(target) : article.read_block;
    setPage(Math.floor(index / PAGE_SIZE));
    const timer = setTimeout(
      () =>
        document
          .getElementById(`block-${index}`)
          ?.scrollIntoView({ block: "start" }),
      120,
    );
    return () => clearTimeout(timer);
  }, [article.id]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function track() {
      const elements =
        body.current?.querySelectorAll<HTMLElement>("[data-block]");
      const current = [...(elements || [])].find(
        (el) => el.getBoundingClientRect().bottom > 180,
      );
      if (!current) return;
      const block = Number(current.dataset.block);
      clearTimeout(timer);
      if (block === lastRead.current) return;
      timer = setTimeout(() => {
        lastRead.current = block;
        void api<Article>(`/articles/${article.id}`, {
          method: "PATCH",
          body: json({ read_block: block }),
        })
          .then(onUpdateRef.current)
          .catch((e) => onError(e.message));
      }, 700);
    }
    window.addEventListener("scroll", track, { passive: true });
    return () => {
      window.removeEventListener("scroll", track);
      clearTimeout(timer);
    };
  }, [article.id, page, onError]);
  const toggle = (id: number) => {
    if (allRu) {
      setAllRu(false);
      setVisibleRu(
        new Set(article.blocks.filter((b) => b.id !== id).map((b) => b.id)),
      );
      return;
    }
    setVisibleRu((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  async function action(path: string, method = "POST", payload?: unknown) {
    setPending(true);
    try {
      const result = await api<Article>(path, {
        method,
        ...(payload ? { body: json(payload) } : {}),
      });
      if (result.id) onUpdated(result);
      return true;
    } catch (error) {
      onError((error as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  }
  function draft(term: string, block: Block) {
    hideWordHint();
    if (term.length > 160) {
      onError("Select a word or phrase up to 160 characters for a card.");
      return;
    }
    onWord({
      term,
      context: block.text,
      article_id: article.id,
      block_id: block.id,
      translation: article.dictionary[term.toLowerCase()],
    });
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }
  function selectText(block: Block) {
    const term = window.getSelection()?.toString().trim() || "";
    if (term && term.length <= 160) setSelection({ term, block });
  }
  function turn(next: number) {
    hideWordHint();
    setPage(next);
    setSelection(null);
    window.scrollTo({ top: 0 });
  }
  const translated = article.blocks.filter((b) => b.ru).length;
  const translatable = article.blocks.filter((b) => b.kind !== "figure").length;
  return (
    <div className="reader-page">
      <div className="reader-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={17} />
          <span>Library</span>
        </button>
        <div className="reader-tools">
          <button
            className={`secondary compact ${allRu ? "pressed" : ""}`}
            aria-pressed={allRu}
            onClick={() => setAllRu(!allRu)}
          >
            <Languages size={17} />
            RU ALL
          </button>
          <button
            className="icon-button"
            aria-label="Contents"
            aria-expanded={contents}
            onClick={() => setContents(!contents)}
          >
            <List size={20} />
          </button>
          <button className="secondary compact" onClick={onManage}>
            About article
          </button>
        </div>
      </div>
      {contents && (
        <nav className="reader-contents" aria-label="Contents">
          <h2>Contents</h2>
          {article.blocks.filter((b) => b.kind === "heading").length ? (
            article.blocks
              .filter((b) => b.kind === "heading")
              .map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setPage(Math.floor(b.id / PAGE_SIZE));
                    setContents(false);
                    setTimeout(
                      () =>
                        document
                          .getElementById(`block-${b.id}`)
                          ?.scrollIntoView(),
                      60,
                    );
                  }}
                >
                  {b.text}
                </button>
              ))
          ) : (
            <p className="hint">
              This article has no sections. Use the page controls.
            </p>
          )}
        </nav>
      )}
      <header className="reader-header">
        <div className="eyebrow">READ. UNDERSTAND. REMEMBER.</div>
        <h1>{article.title}</h1>
        <div className="reader-meta">
          <span>{translatable} blocks</span>
          <span>
            Translated {translated}/{translatable}
          </span>
          {article.source_url && (
            <a href={article.source_url} target="_blank" rel="noreferrer">
              Source <ExternalLink size={13} />
            </a>
          )}
          {article.has_original && (
            <a href={`/api/articles/${article.id}/original`}>
              Original <Download size={13} />
            </a>
          )}
        </div>
        <p className="reader-tip">
          Hover over a word to see its translation. Click a word or select a
          phrase to save a card.
        </p>
      </header>
      <div className="translation-bar">
        <div>
          <span
            className={`connection-dot ${article.job_state === "running" ? "working" : ""}`}
          />
          <span>
            {article.job_state === "running"
              ? `Translating: ${translated} of ${translatable}`
              : translated === translatable
                ? "Translation complete"
                : "Add a translation manually or with AI"}
          </span>
        </div>
        {article.job_state === "running" ? (
          <button
            className="text-button"
            disabled={pending}
            onClick={() => action(`/articles/${article.id}/cancel`)}
          >
            <Square size={13} />
            Stop
          </button>
        ) : (
          translated < translatable && (
            <button
              className="text-button"
              disabled={!aiConfigured || pending}
              title={
                !aiConfigured
                  ? "Select a model in Settings"
                  : "Translate missing blocks"
              }
              onClick={() => action(`/articles/${article.id}/translate`)}
            >
              <Sparkles size={15} />
              {translated ? "Resume translation" : "Translate with AI"}
            </button>
          )
        )}
      </div>
      {article.job_error && (
        <p className="error" role="alert">
          {article.job_error}
        </p>
      )}
      <div className="reader-content" ref={body} lang="en">
        {blocks.map((block) => (
          <section
            key={block.id}
            id={`block-${block.id}`}
            data-block={block.id}
            className={`reading-block ${block.kind}`}
          >
            {block.kind === "figure" ? (
              <figure>
                {block.image ? (
                  <img src={block.image} alt={block.text} loading="lazy" />
                ) : (
                  <div className="figure-placeholder">
                    Figure available in the original article
                  </div>
                )}
                <figcaption>{block.text}</figcaption>
              </figure>
            ) : (
              <>
                <div
                  className="original-text"
                  onMouseUp={() => selectText(block)}
                  onTouchEnd={() => selectText(block)}
                >
                  {block.kind === "heading" ? (
                    <h2>{block.text}</h2>
                  ) : (
                    <p>
                      {block.text
                        .split(/(\p{L}[\p{L}\p{M}'’\-]*)/u)
                        .map((part, index) =>
                          /\p{L}/u.test(part) ? (
                            <button
                              key={index}
                              type="button"
                              className="word"
                              aria-describedby={
                                wordHint?.anchor.dataset.hintWord ===
                                `${block.id}-${index}`
                                  ? hintId
                                  : undefined
                              }
                              data-hint-word={`${block.id}-${index}`}
                              onPointerEnter={(event) => {
                                if (event.pointerType !== "touch")
                                  showWordHint(event.currentTarget, part);
                              }}
                              onPointerLeave={leaveWordHint}
                              onFocus={(event) =>
                                showWordHint(event.currentTarget, part)
                              }
                              onBlur={hideWordHint}
                              onClick={() => {
                                if (!window.getSelection()?.toString().trim())
                                  draft(part, block);
                              }}
                            >
                              {part}
                            </button>
                          ) : (
                            part
                          ),
                        )}
                    </p>
                  )}
                </div>
                <div className="block-actions">
                  <button
                    className={`ru-toggle ${allRu || visibleRu.has(block.id) ? "active" : ""}`}
                    aria-label={`Translation of block ${block.id + 1}`}
                    aria-expanded={allRu || visibleRu.has(block.id)}
                    onClick={() => toggle(block.id)}
                  >
                    RU
                  </button>
                  <button
                    className="block-action"
                    onClick={() =>
                      draft(
                        window.getSelection()?.toString().trim() || "",
                        block,
                      )
                    }
                  >
                    <BookmarkPlus size={14} />
                    Word / phrase
                  </button>
                  <button
                    className="block-action edit-translation"
                    aria-label={`Edit translation of block ${block.id + 1}`}
                    disabled={article.job_state === "running"}
                    onClick={() => {
                      setEditing(block.id);
                      setEditText(block.ru);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                </div>
                {(allRu || visibleRu.has(block.id)) && (
                  <div className="translated-text" lang="ru">
                    {block.ru || (
                      <span className="muted">No translation yet.</span>
                    )}
                  </div>
                )}
                {editing === block.id && (
                  <form
                    className="translation-editor"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const saved = await action(
                        `/articles/${article.id}/blocks/${block.id}`,
                        "PATCH",
                        { ru: editText },
                      );
                      if (saved) setEditing(null);
                    }}
                  >
                    <label lang="ru">
                      Russian translation
                      <textarea
                        autoFocus
                        rows={5}
                        value={editText}
                        maxLength={60_000}
                        onChange={(e) => setEditText(e.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <button className="primary compact" disabled={pending}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="secondary compact"
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      <div className="reader-pagination">
        <button
          className="secondary"
          disabled={page === 0}
          onClick={() => turn(page - 1)}
        >
          <ChevronLeft size={17} />
          Previous
        </button>
        <span>
          Part {page + 1} of{" "}
          {Math.max(1, Math.ceil(article.blocks.length / PAGE_SIZE))}
        </span>
        <button
          className="secondary"
          disabled={(page + 1) * PAGE_SIZE >= article.blocks.length}
          onClick={() => turn(page + 1)}
        >
          Next
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="reader-finish">
        <span>Another idea, understood.</span>
        <button
          className="primary"
          disabled={pending || article.status === "done"}
          onClick={() =>
            action(`/articles/${article.id}`, "PATCH", {
              status: "done",
              read_block: article.blocks.length - 1,
            })
          }
        >
          <Check size={17} />
          {article.status === "done" ? "Article read" : "Mark as read"}
        </button>
      </div>
      {selection && (
        <div className="selection-bar">
          <span lang="en">{selection.term}</span>
          <button
            className="primary compact"
            onClick={() => draft(selection.term, selection.block)}
          >
            <PlusIcon />
            Save card
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss selection"
            onClick={() => setSelection(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {wordHint && (
        <WordTooltip
          id={hintId}
          anchor={wordHint.anchor}
          translation={wordHint.translation}
          onEnter={keepWordHint}
          onLeave={leaveWordHint}
        />
      )}
    </div>
  );
}
function PlusIcon() {
  return <BookmarkPlus size={16} />;
}
