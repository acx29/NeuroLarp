//**
// lib/ai/provider.ts
// BYOK model resolution per request: user's key (decrypted) -> app default; embedding payer selection
//**
import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface ResolvedModel {
  model: LanguageModel;
  provider: "openai" | "anthropic";
  modelId: string;
  byok: boolean;
  /** OpenAI key to bill embeddings to (user's when BYOK+OpenAI, else app's). */
  embeddingApiKey: string;
}

const appOpenAI = () => createOpenAI({ apiKey: env.openaiApiKey });

/** Per-request resolution: user's connected key → app default key (PLAN 12). */
export async function resolveModel(userId: string): Promise<ResolvedModel> {
  const fallback: ResolvedModel = {
    model: appOpenAI()(env.aiModel),
    provider: "openai",
    modelId: env.aiModel,
    byok: false,
    embeddingApiKey: env.openaiApiKey,
  };
  if (!env.enableByok) return fallback;

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("user_api_keys")
    .select("provider, encrypted_key, model")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return fallback;

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.encrypted_key);
  } catch {
    return fallback; // undecryptable (rotated ENCRYPTION_KEY) → app key
  }

  if (row.provider === "anthropic") {
    const modelId = row.model || "claude-haiku-4-5";
    return {
      model: createAnthropic({ apiKey })(modelId),
      provider: "anthropic",
      modelId,
      byok: true,
      // Anthropic has no embeddings endpoint — app key pays, same pinned model.
      embeddingApiKey: env.openaiApiKey,
    };
  }
  const modelId = row.model || env.aiModel;
  return {
    model: createOpenAI({ apiKey })(modelId),
    provider: "openai",
    modelId,
    byok: true,
    embeddingApiKey: apiKey, // OpenAI BYOK: embeddings billed to the user's key too
  };
}
