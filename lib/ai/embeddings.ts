//**
// lib/ai/embeddings.ts
// Pinned embedding model (text-embedding-3-small) — payer varies, model never does
//**
import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { logUsage } from "@/lib/ai/meter";

// The embedding MODEL is pinned app-wide (PLAN 12) — vectors from different
// models are not comparable. The PAYER can vary (caller passes the key).
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

export async function embedTexts(args: {
  userId: string;
  apiKey: string; // user's OpenAI key when BYOK+OpenAI, else app key
  byok: boolean;
  texts: string[];
}): Promise<number[][]> {
  if (args.texts.length === 0) return [];
  const openai = createOpenAI({ apiKey: args.apiKey });
  const res = await embedMany({
    model: openai.textEmbedding(EMBEDDING_MODEL),
    values: args.texts.map((t) => t.slice(0, 24_000)), // stay under the model's input cap
  });
  await logUsage({
    userId: args.userId,
    kind: "embedding",
    provider: "openai",
    model: EMBEDDING_MODEL,
    inputTokens: res.usage?.tokens ?? 0,
    outputTokens: 0,
    byok: args.byok,
  });
  return res.embeddings;
}
