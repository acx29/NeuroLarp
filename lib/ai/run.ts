//**
// lib/ai/run.ts
// Single entry point for all AI generation: gate -> resolve model -> call -> meter
//**
import "server-only";
import { generateObject, generateText, type ModelMessage } from "ai";
import type { z } from "zod";
import { resolveModel } from "@/lib/ai/provider";
import { checkQuota, logUsage } from "@/lib/ai/meter";

// UI copy rule: no em-dashes in anything a user sees, including model output.
const NO_EMDASH = "\nNever use em-dashes (—) in any output text; use commas, periods, or middots instead.";

interface RunBase {
  userId: string;
  userEmail: string | null;
  kind: string; // ai_usage.kind — e.g. "analyze_note", "quiz_generation"
  system?: string;
  prompt?: string;
  messages?: ModelMessage[];
}

/** Gate → resolve model (BYOK) → call → meter. Every generation goes through here. */
export async function aiObject<T>(
  args: RunBase & { schema: z.ZodType<T> }
): Promise<T> {
  const resolved = await resolveModel(args.userId);
  await checkQuota(args.userId, args.userEmail, resolved.byok);
  const res = await generateObject({
    model: resolved.model,
    schema: args.schema,
    system: args.system ? args.system + NO_EMDASH : undefined,
    ...(args.messages ? { messages: args.messages } : { prompt: args.prompt ?? "" }),
  });
  await logUsage({
    userId: args.userId,
    kind: args.kind,
    provider: resolved.provider,
    model: resolved.modelId,
    inputTokens: res.usage.inputTokens ?? 0,
    outputTokens: res.usage.outputTokens ?? 0,
    byok: resolved.byok,
  });
  return res.object;
}

export async function aiText(args: RunBase): Promise<string> {
  const resolved = await resolveModel(args.userId);
  await checkQuota(args.userId, args.userEmail, resolved.byok);
  const res = await generateText({
    model: resolved.model,
    system: args.system ? args.system + NO_EMDASH : undefined,
    ...(args.messages ? { messages: args.messages } : { prompt: args.prompt ?? "" }),
  });
  await logUsage({
    userId: args.userId,
    kind: args.kind,
    provider: resolved.provider,
    model: resolved.modelId,
    inputTokens: res.usage.inputTokens ?? 0,
    outputTokens: res.usage.outputTokens ?? 0,
    byok: resolved.byok,
  });
  return res.text;
}
