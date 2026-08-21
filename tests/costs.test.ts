//**
// tests/costs.test.ts
// Metering math: per-model pricing and the conservative unknown-model fallback
//**
import { describe, it, expect } from "vitest";
import { costUsd, MODEL_PRICES, TIER_CAPS_USD } from "@/lib/ai/costs";

describe("costUsd", () => {
  it("prices gpt-5-mini per its rate card", () => {
    // 1M in + 1M out = 0.13 + 1.00
    expect(costUsd("gpt-5-mini", 1_000_000, 1_000_000)).toBeCloseTo(1.13);
  });
  it("prices embeddings with zero output cost", () => {
    expect(costUsd("text-embedding-3-small", 500_000, 0)).toBeCloseTo(0.01);
  });
  it("falls back to conservative pricing for unknown models", () => {
    expect(costUsd("mystery-model", 1_000_000, 1_000_000)).toBeCloseTo(6);
  });
  it("scales linearly with tokens", () => {
    expect(costUsd("gpt-5-mini", 10_000, 2_000)).toBeCloseTo((10_000 * 0.13 + 2_000 * 1.0) / 1_000_000);
  });
});

describe("configuration sanity", () => {
  it("every priced model has non-negative rates", () => {
    for (const p of Object.values(MODEL_PRICES)) {
      expect(p.inputPerM).toBeGreaterThanOrEqual(0);
      expect(p.outputPerM).toBeGreaterThanOrEqual(0);
    }
  });
  it("premium cap exceeds free cap", () => {
    expect(TIER_CAPS_USD.premium).toBeGreaterThan(TIER_CAPS_USD.free);
  });
});
