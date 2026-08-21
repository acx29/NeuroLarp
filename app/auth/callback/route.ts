//**
// app/auth/callback/route.ts
// OAuth/magic-link code exchange landing (wired now, providers enabled later)
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// OAuth / magic-link landing: exchanges the code for a session cookie.
// Wired now so enabling Google or magic links later is dashboard-only (PLAN: deferred).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/home", url.origin));
}
