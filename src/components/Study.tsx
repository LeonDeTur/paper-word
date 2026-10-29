import { useCallback, useEffect, useState } from "react";
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
  ["again", "Не помню", "10 минут"],
  ["hard", "Трудно", "12 часов"],
  ["good", "Помню", "1 день"],
  ["easy", "Легко", "4 дня"],
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
  const rate = useCallback(
    async (rating: (typeof ratings)[number][0]) => {
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
          new Date(next.due_at).toLocaleString("ru-RU", {
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
    },
    [current, busy, onChanged],
  );
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
  }, [current, busy, revealed, rate]);
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
    return days < 1 ? `${Math.round(days * 24)} ч` : `${Math.round(days)} дн`;
  }
  return (
    <div className="page study-page">
      <div className="eyebrow">НЕМНОГО ПРАКТИКИ КАЖДЫЙ ДЕНЬ</div>
      <div className="page-heading">
        <div>
          <h1>Повторение</h1>
          <p className="subtitle">
            Вспомните значение, прежде чем перевернуть карточку.
          </p>
        </div>
        <label className="direction-select">
          <ArrowLeftRight size={17} />
          <select
            aria-label="Направление повторения"
            value={direction}
            disabled={busy}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="all">Оба направления</option>
            <option value="en-ru">English → Русский</option>
            <option value="ru-en">Русский → English</option>
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
            Обновить очередь
          </button>
        </div>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          <LoaderCircle className="spin" />
          Загружаем карточки…
        </div>
      ) : current ? (
        <div className="study-workspace">
          <div className="study-progress">
            <span>
              КАРТОЧКА {index + 1} / {queue.length}
            </span>
            <span>{current.direction === "en-ru" ? "EN → RU" : "RU → EN"}</span>
          </div>
          <progress
            value={index}
            max={queue.length}
            aria-label="Прогресс занятия"
          />
          <div className={`flashcard ${revealed ? "revealed" : ""}`}>
            <span className="card-caption">
              {current.direction === "en-ru"
                ? "КАК ЭТО ПО-РУССКИ?"
                : "КАК ЭТО ПО-АНГЛИЙСКИ?"}
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
              <p className="card-prompt">
                Дайте себе несколько секунд, чтобы вспомнить.
              </p>
            )}
          </div>
          {!revealed ? (
            <button
              className="primary reveal-button"
              onClick={() => setRevealed(true)}
            >
              Показать ответ
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
              ? "Клавиши 1–4 — оценить ответ"
              : "Пробел — показать ответ"}{" "}
            · У каждого направления своё расписание
          </p>
        </div>
      ) : (
        <div className="study-complete">
          <div className="complete-icon">
            <Check size={34} />
          </div>
          <span className="eyebrow">
            {queue.length ? "ЗАНЯТИЕ ЗАВЕРШЕНО" : "ВСЁ ПОВТОРЕНО"}
          </span>
          <h2>
            {queue.length
              ? "Слова становятся знакомее."
              : "Сейчас нет карточек к повторению."}
          </h2>
          <p>
            {queue.length
              ? `Ответов сохранено: ${queue.length}.`
              : "Добавьте новые слова или возвращайтесь, когда подойдёт время."}
            {nextDue && ` Последняя карточка появится ${nextDue}.`}
          </p>
          <div className="button-row">
            <button className="primary" onClick={onWords}>
              Открыть словарь
            </button>
            <button
              className="secondary"
              onClick={() => setSession((s) => s + 1)}
            >
              <RotateCcw size={16} />
              Проверить очередь
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
