import type { Schedule } from "../src/types.ts";

// A transparent, conservative SM-2-style schedule. Each direction has its own state.
export function scheduleReview(
  previous: Schedule,
  rating: "again" | "hard" | "good" | "easy",
  now = new Date(),
): Schedule {
  let { interval_days, ease, reps, lapses } = previous;
  if (rating === "again") {
    interval_days = 10 / 1440;
    ease = Math.max(1.3, ease - 0.2);
    reps = 0;
    lapses += 1;
  } else {
    const first = reps === 0;
    interval_days =
      rating === "hard"
        ? first
          ? 0.5
          : Math.max(0.5, interval_days * 1.2)
        : rating === "easy"
          ? first
            ? 4
            : Math.max(4, interval_days * ease * 1.3)
          : first
            ? 1
            : reps === 1
              ? 3
              : Math.max(1, interval_days * ease);
    if (rating === "hard") ease = Math.max(1.3, ease - 0.15);
    if (rating === "easy") ease = Math.min(3.5, ease + 0.15);
    reps += 1;
  }
  return {
    ...previous,
    interval_days,
    ease,
    reps,
    lapses,
    due_at: new Date(now.getTime() + interval_days * 86_400_000).toISOString(),
  };
}

export function normalizeLemma(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
