//**
// lib/rate.ts
// Sliding-window rate limits over rate_events (hashed IP + per-user), generous by design
//**
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hashIp } from "@/lib/crypto";

export class RateLimitError extends Error {
  code = "rate_limited" as const;
  constructor(action: string) {
    super(`Too many ${action} requests — slow down and retry shortly`);
  }
}

// Sliding-window limits (PLAN 14). Generous on purpose: students share campus
// NAT IPs, so IP limits are burst control, never identity.
const LIMITS: Record<string, { perIpPerMin?: number; perUserPerMin?: number }> = {
  ai_call: { perIpPerMin: 30, perUserPerMin: 20 },
  upload: { perIpPerMin: 20, perUserPerMin: 15 },
};

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? "local").trim();
}

export async function enforceRate(req: Request, userId: string | null, action: string): Promise<void> {
  const limits = LIMITS[action];
  if (!limits) return;
  const admin = supabaseAdmin();
  const ipHash = hashIp(clientIp(req));
  const windowStart = new Date(Date.now() - 60_000).toISOString();

  if (limits.perIpPerMin) {
    const { count } = await admin
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("action", action)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= limits.perIpPerMin) throw new RateLimitError(action);
  }
  if (limits.perUserPerMin && userId) {
    const { count } = await admin
      .from("rate_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", action)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= limits.perUserPerMin) throw new RateLimitError(action);
  }
  await admin.from("rate_events").insert({ ip_hash: ipHash, user_id: userId, action });
}
