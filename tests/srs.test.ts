//**
// tests/srs.test.ts
// Spaced-repetition scheduler units: lapses, growth, caps, labels
//**
import { describe, it, expect } from "vitest";
import { applyReview, stabilityLabel, type ReviewState } from "@/lib/srs";

const base: ReviewState = { interval_days: 6, ease: 2.5, lapses: 0, due_at: new Date().toISOString() };
const NOW = new Date("2026-08-21T12:00:00Z");

describe("applyReview", () => {
  it("lapses below 0.6: interval resets to 1, ease drops, lapse counted", () => {
    const r = applyReview(base, 0.4, NOW);
    expect(r.interval_days).toBe(1);
    expect(r.ease).toBeCloseTo(2.3);
    expect(r.lapses).toBe(1);
  });
  it("ease never drops below 1.3", () => {
    const r = applyReview({ ...base, ease: 1.35 }, 0, NOW);
    expect(r.ease).toBe(1.3);
  });
  it("success grows the interval by ease", () => {
    const r = applyReview(base, 1, NOW);
    expect(r.ease).toBeCloseTo(2.6);
    expect(r.interval_days).toBeGreaterThan(base.interval_days);
  });
  it("first success maps to 2 or 3 days", () => {
    expect(applyReview({ ...base, interval_days: 1 }, 0.9, NOW).interval_days).toBe(3);
    expect(applyReview({ ...base, interval_days: 1 }, 0.7, NOW).interval_days).toBe(2);
  });
  it("interval caps at 365 days", () => {
    const r = applyReview({ ...base, interval_days: 360, ease: 2.8 }, 1, NOW);
    expect(r.interval_days).toBeLessThanOrEqual(365);
  });
  it("due_at moves forward by the interval", () => {
    const r = applyReview({ ...base, interval_days: 1 }, 0.9, NOW);
    expect(new Date(r.due_at).getTime()).toBe(NOW.getTime() + r.interval_days * 86_400_000);
  });
  it("clamps quality outside 0..1", () => {
    expect(applyReview(base, 4, NOW).ease).toBeCloseTo(2.6);
    expect(applyReview(base, -3, NOW).lapses).toBe(1);
  });
});

describe("stabilityLabel", () => {
  it("buckets by interval length", () => {
    expect(stabilityLabel(1)).toBe("fragile");
    expect(stabilityLabel(5)).toBe("forming");
    expect(stabilityLabel(20)).toBe("solid");
    expect(stabilityLabel(90)).toBe("durable");
  });
});
