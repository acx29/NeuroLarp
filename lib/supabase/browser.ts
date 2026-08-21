"use client";
//**
// lib/supabase/browser.ts
// Singleton Supabase browser client (publishable key; RLS is the security boundary)
//**
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return client;
}
