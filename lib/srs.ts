//**
// lib/srs.ts
// SM-2-style spaced-repetition scheduler updating review_state from quiz accuracy
//**
// SM-2-style per-topic scheduler (PLAN: review_state).
// Quality is quiz accuracy 0..1 for the topic in one attempt.

export interface ReviewState {
  interval_days: number;
  ease: number;
  lapses: number;
  due_at: string; // ISO
}

export interface ReviewUpdate {
  interval_days: number;
  ease: number;
  lapses: number;
  due_at: string;
  last_reviewed_at: string;
}

const DAY_MS = 86_400_000;

export function applyReview(state: ReviewState, quality: number, now = new Date()): ReviewUpdate {
  const q = Math.max(0, Math.min(1, quality));
  let { interval_days, ease, lapses } = state;

  if (q < 0.6) {
    // lapse: memory failed — short interval, ease penalty
    lapses += 1;
    ease = Math.max(1.3, ease - 0.2);
    interval_days = 1;
  } else {
    // SM-2 ease adjustment mapped from accuracy (0.6 → -0.14, 1.0 → +0.1)
    ease = Math.max(1.3, Math.min(3.0, ease + (0.1 - (1 - q) * 0.6)));
    interval_days = interval_days <= 1 ? (q >= 0.85 ? 3 : 2) : Math.round(interval_days * ease * 10) / 10;
    interval_days = Math.min(interval_days, 365);
  }

  return {
    interval_days,
    ease,
    lapses,
    due_at: new Date(now.getTime() + interval_days * DAY_MS).toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}

/** Memory stability display bucket for Progress (current interval length). */
export function stabilityLabel(intervalDays: number): string {
  if (intervalDays < 2) return "fragile";
  if (intervalDays < 7) return "forming";
  if (intervalDays < 30) return "solid";
  return "durable";
}
