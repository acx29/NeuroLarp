//**
// lib/supabase/admin.ts
// Service-role Supabase client — only path to server-only tables (user_api_keys, ai_usage, rate_events)
//**
import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

// Service-role client. Bypasses RLS — the ONLY path to user_api_keys / ai_usage / rate_events.
// Never import from client code ("server-only" enforces it at build time).
export function supabaseAdmin() {
  return createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
