//**
// app/api/settings/byok/route.ts
// BYOK key management (flag-gated): verify the key against the provider's
// model-list endpoint, encrypt it, store hint only. DELETE removes the key.
// The user_api_keys table is service-role only, so all access is via admin client.
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";
import { env, isAdminEmail } from "@/lib/env";

const ALLOWED_MODELS: Record<string, string[]> = {
  openai: ["gpt-5-mini", "gpt-5-nano"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-5"],
};

async function verifyKey(provider: string, apiKey: string): Promise<boolean> {
  // list-models is the cheapest authenticated call on both providers
  const res =
    provider === "openai"
      ? await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        })
      : await fetch("https://api.anthropic.com/v1/models", {
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        });
  return res.ok;
}

async function gate() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, status: 401 as const, error: "unauthorized" };
  if (!env.enableByok && !isAdminEmail(user.email)) {
    return { user: null, status: 403 as const, error: "BYOK is not enabled" };
  }
  return { user, status: 200 as const, error: "" };
}

export async function POST(request: Request) {
  const g = await gate();
  if (!g.user) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = await request.json().catch(() => ({}));
  const provider = body.provider === "anthropic" ? "anthropic" : "openai";
  const apiKey = String(body.api_key ?? "").trim();
  const model = String(body.model ?? "");
  if (!apiKey) return NextResponse.json({ error: "API key required" }, { status: 400 });
  if (!ALLOWED_MODELS[provider].includes(model)) {
    return NextResponse.json({ error: "pick a supported model" }, { status: 400 });
  }

  const ok = await verifyKey(provider, apiKey).catch(() => false);
  if (!ok) return NextResponse.json({ error: "the provider rejected that key" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("user_api_keys").upsert(
    {
      user_id: g.user.id,
      provider,
      encrypted_key: encryptSecret(apiKey),
      key_hint: apiKey.slice(-4),
      model,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, hint: apiKey.slice(-4), provider, model });
}

export async function DELETE() {
  const g = await gate();
  if (!g.user) return NextResponse.json({ error: g.error }, { status: g.status });
  const admin = supabaseAdmin();
  const { error } = await admin.from("user_api_keys").delete().eq("user_id", g.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
