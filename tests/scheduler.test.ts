import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLemma, scheduleReview } from "../server/scheduler.ts";
import type { Schedule } from "../src/types.ts";

const start: Schedule = {
  direction: "en-ru",
  due_at: "2026-10-25T12:00:00.000Z",
  interval_days: 0,
  ease: 2.5,
  reps: 0,
  lapses: 0,
};
const now = new Date(start.due_at);
test("new-card ratings schedule 10 minutes, 12 hours, one day, four days", () => {
  const expected = { again: 10 / 1440, hard: 0.5, good: 1, easy: 4 };
  for (const [rating, days] of Object.entries(expected)) {
    const result = scheduleReview(start, rating as keyof typeof expected, now);
    assert.equal(result.interval_days, days);
    assert.equal(Date.parse(result.due_at) - now.getTime(), days * 86_400_000);
    assert.equal(start.reps, 0);
  }
});
test("repeated good answers grow intervals; a lapse resets learning", () => {
  const first = scheduleReview(start, "good", now);
  const second = scheduleReview(first, "good", now);
  const third = scheduleReview(second, "good", now);
  assert.equal(first.interval_days, 1);
  assert.equal(second.interval_days, 3);
  assert.equal(third.interval_days, 7.5);
  const lapse = scheduleReview(third, "again", now);
  assert.equal(lapse.reps, 0);
  assert.equal(lapse.lapses, 1);
});
test("normalization catches case, Unicode spaces, compatibility forms and apostrophes", () => {
  assert.equal(
    normalizeLemma("  Take\u00a0 into   Account "),
    "take into account",
  );
  assert.equal(normalizeLemma("ＯＢＳＥＲＶＥ"), "observe");
  assert.equal(normalizeLemma("one’s own"), "one's own");
});
