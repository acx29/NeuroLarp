//**
// lib/ai/costs.ts
// Per-model price map (rates at call time) + cost computation + tier caps
//**
// Per-model list prices, USD per million tokens, at the rate in force when the
// call is made. cost_usd is computed at insert time and never re-priced (PLAN 13).
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-5-mini": { inputPerM: 0.13, outputPerM: 1.0 },
  "gpt-5-nano": { inputPerM: 0.05, outputPerM: 0.4 },
  "text-embedding-3-small": { inputPerM: 0.02, outputPerM: 0 },
  // Anthropic (BYOK options)
  "claude-haiku-4-5": { inputPerM: 1.0, outputPerM: 5.0 },
  "claude-sonnet-5": { inputPerM: 3.0, outputPerM: 15.0 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICES[model] ?? { inputPerM: 1, outputPerM: 5 }; // unknown model: conservative
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000;
}

// Tier caps, USD per calendar month (PLAN 13: values TBD at Stripe time).
export const TIER_CAPS_USD: Record<string, number> = {
  free: 0.5,
  premium: 3.0,
};
