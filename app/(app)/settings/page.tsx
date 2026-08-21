//**
// app/(app)/settings/page.tsx
// Account settings: profile, monthly AI usage vs cap, and (flag-gated) BYOK
//**
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SettingsView } from "@/components/settings-view";
import { env, isAdminEmail } from "@/lib/env";
import { TIER_CAPS_USD } from "@/lib/ai/costs";

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout guard redirects

  const { data: profile } = await supabase.from("profiles").select("username, email").eq("id", user.id).single();

  const byokAllowed = env.enableByok || isAdminEmail(user.email);
  const admin = supabaseAdmin();

  // month-to-date platform-paid spend (BYOK calls are excluded from metering caps)
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usage } = await admin
    .from("ai_usage")
    .select("cost_usd.sum()")
    .eq("user_id", user.id)
    .eq("byok", false)
    .gte("created_at", monthStart.toISOString());
  const spent = Number((usage?.[0] as { sum?: number } | undefined)?.sum ?? 0);

  let byokKey: { provider: string; hint: string; model: string } | null = null;
  if (byokAllowed) {
    const { data: key } = await admin
      .from("user_api_keys")
      .select("provider, key_hint, model")
      .eq("user_id", user.id)
      .maybeSingle();
    if (key) byokKey = { provider: key.provider, hint: key.key_hint, model: key.model };
  }

  return (
    <SettingsView
      username={profile?.username ?? ""}
      email={profile?.email || user.email || ""}
      spentUsd={spent}
      capUsd={TIER_CAPS_USD.free}
      byokAllowed={byokAllowed}
      byokKey={byokKey}
      isAdmin={isAdminEmail(user.email)}
    />
  );
}
