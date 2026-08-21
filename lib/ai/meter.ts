//**
// lib/ai/meter.ts
// Pre-call quota gate (per-user monthly + global daily) and per-call ai_usage metering insert
//**
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { costUsd, TIER_CAPS_USD } from "@/lib/ai/costs";
import { env, isAdminEmail } from "@/lib/env";

export class QuotaError extends Error {
  code = "quota_reached" as const;
  constructor(public scope: "user" | "global") {
    super(scope === "user" ? "Monthly AI quota reached" : "Service AI budget reached for today");
  }
}

/** Pre-call gate (PLAN 13/14). BYOK users and admins skip the per-user cap;
 *  the global daily ceiling applies to app-key spend only. Bounds new work —
 *  the in-flight call may overshoot by at most one call's cost. */
export async function checkQuota(userId: string, userEmail: string | null, byok: boolean): Promise<void> {
  if (byok) return;
  const admin = supabaseAdmin();

  if (!isAdminEmail(userEmail)) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data } = await admin
      .from("ai_usage")
      .select("cost_usd.sum()")
      .eq("user_id", userId)
      .eq("byok", false)
      .gte("created_at", monthStart.toISOString());
    const spent = Number((data?.[0] as { sum?: number } | undefined)?.sum ?? 0);
    if (spent >= TIER_CAPS_USD.free) throw new QuotaError("user");
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: g } = await admin
    .from("ai_usage")
    .select("cost_usd.sum()")
    .eq("byok", false)
    .gte("created_at", dayStart.toISOString());
  const globalSpent = Number((g?.[0] as { sum?: number } | undefined)?.sum ?? 0);
  if (globalSpent >= env.dailySpendCeilingUsd) throw new QuotaError("global");
}

/** One insert per AI call — the metering row (PLAN 13). */
export async function logUsage(args: {
  userId: string;
  kind: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  byok: boolean;
}): Promise<void> {
  const admin = supabaseAdmin();
  await admin.from("ai_usage").insert({
    user_id: args.userId,
    kind: args.kind,
    provider: args.provider,
    model: args.model,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cost_usd: costUsd(args.model, args.inputTokens, args.outputTokens),
    byok: args.byok,
  });
}
