import { useEffect, useState } from "react";
import {
  ArrowRight,
  RotateCcw,
  Check,
  ArrowLeftRight,
  LoaderCircle,
} from "lucide-react";
import { api, json } from "../api";
import type { Review, Schedule } from "../types";

const ratings = [
  ["again", "Again", "10 minutes"],
  ["hard", "Hard", "12 hours"],
  ["good", "Good", "1 day"],
  ["easy", "Easy", "4 days"],
] as const;
export function Study({
  onChanged,
  onWords,
}: {
  onChanged: () => void;
  onWords: () => void;
}) {
  const [direction, setDirection] = useState("all");
  const [queue, setQueue] = useState<Review[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState(0);
  const [nextDue, setNextDue] = useState("");
  const current = queue[index];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setIndex(0);
    setRevealed(false);
    api<Review[]>(`/reviews?direction=${direction}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setQueue(data);
        setLoading(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [direction, session]);
  async function rate(rating: (typeof ratings)[number][0]) {
    if (!current || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Schedule>(`/cards/${current.id}/review`, {
        method: "POST",
        body: json({
          rating,
          direction: current.direction,
          expected_due_at: current.due_at,
        }),
      });
      setNextDue(
        new Date(next.due_at).toLocaleString("en-GB", {
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
      setIndex((i) => i + 1);
      setRevealed(false);
      onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function keydown(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement)?.matches("input,textarea,select,button") ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        busy ||
        !current
      )
        return;
      if ((e.code === "Space" || e.key === "Enter") && !revealed) {
        e.preventDefault();
        setRevealed(true);
      }
      if (revealed && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        void rate(ratings[Number(e.key) - 1][0]);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [current, busy, revealed]);
  function intervalLabel(
    rating: (typeof ratings)[number][0],
    fallback: string,
  ) {
    const schedule = current?.schedules.find(
      (s) => s.direction === current.direction,
    );
    if (!schedule || !schedule.reps || rating === "again") return fallback;
    let days =
      rating === "hard"
        ? Math.max(0.5, schedule.interval_days * 1.2)
        : rating === "easy"
          ? Math.max(4, schedule.interval_days * schedule.ease * 1.3)
          : schedule.reps === 1
            ? 3
            : Math.max(1, schedule.interval_days * schedule.ease);
    return days < 1 ? `${Math.round(days * 24)} h` : `${Math.round(days)} d`;
  }
  return (
    <div className="page study-page">
      <div className="eyebrow">A LITTLE PRACTICE EVERY DAY</div>
      <div className="page-heading">
        <div>
          <h1>Review</h1>
          <p className="subtitle">
            Recall the meaning before revealing the answer.
          </p>
        </div>
        <label className="direction-select">
          <ArrowLeftRight size={17} />
          <select
            aria-label="Review direction"
            value={direction}
            disabled={busy}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="all">Both directions</option>
            <option value="en-ru">English → Russian</option>
            <option value="ru-en">Russian → English</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            className="text-button"
            onClick={() => setSession((s) => s + 1)}
          >
            Refresh queue
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          <LoaderCircle className="spin" />
          Loading cards…
        </div>
      ) : current ? (
        <div className="study-workspace">
          <div className="study-progress">
            <span>
              CARD {index + 1} / {queue.length}
            </span>
            <span>{current.direction === "en-ru" ? "EN → RU" : "RU → EN"}</span>
          </div>
          <progress
            value={index}
            max={queue.length}
            aria-label="Session progress"
          />
          <div className={`flashcard ${revealed ? "revealed" : ""}`}>
            <span className="card-caption">
              {current.direction === "en-ru"
                ? "WHAT IS IT IN RUSSIAN?"
                : "WHAT IS IT IN ENGLISH?"}
            </span>
            <h2 lang={current.direction === "en-ru" ? "en" : "ru"}>
              {current.direction === "en-ru"
                ? current.lemma
                : current.translation}
            </h2>
            {revealed ? (
              <div className="card-answer">
                <div className="answer-divider" />
                <h3 lang={current.direction === "en-ru" ? "ru" : "en"}>
                  {current.direction === "en-ru"
                    ? current.translation
                    : current.lemma}
                </h3>
                {current.context && (
                  <blockquote lang="en">{current.context}</blockquote>
                )}
                {current.notes && <p className="hint">{current.notes}</p>}
              </div>
            ) : (
              <p className="card-prompt">Take a few seconds to recall it.</p>
            )}
          </div>
          {!revealed ? (
            <button
              className="primary reveal-button"
              onClick={() => setRevealed(true)}
            >
              Show answer
              <ArrowRight size={18} />
            </button>
          ) : (
            <div className="rating-buttons">
              {ratings.map(([key, label, interval], i) => (
                <button
                  key={key}
                  disabled={busy}
                  className={`rating ${key}`}
                  onClick={() => rate(key)}
                >
                  <span className="rating-key">{i + 1}</span>
                  <strong>{label}</strong>
                  <span>{intervalLabel(key, interval)}</span>
                </button>
              ))}
            </div>
          )}
          <p className="study-shortcuts">
            {revealed
              ? "Keys 1–4 — rate your answer"
              : "Space — show the answer"}{" "}
            · Each direction has its own schedule
          </p>
        </div>
      ) : (
        <div className="study-complete">
          <div className="complete-icon">
            <Check size={34} />
          </div>
          <span className="eyebrow">
            {queue.length ? "SESSION COMPLETE" : "ALL CAUGHT UP"}
          </span>
          <h2>
            {queue.length
              ? "The words are becoming familiar."
              : "No cards are due right now."}
          </h2>
          <p>
            {queue.length
              ? `Reviews saved: ${queue.length}.`
              : "Add new words or come back when reviews are due."}
            {nextDue && ` The last card will be due ${nextDue}.`}
          </p>
          <div className="button-row">
            <button className="primary" onClick={onWords}>
              Open vocabulary
            </button>
            <button
              className="secondary"
              onClick={() => setSession((s) => s + 1)}
            >
              <RotateCcw size={16} />
              Check queue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
