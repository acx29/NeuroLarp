//**
// lib/env.ts
// Typed accessors for server env vars (Supabase, OpenAI, BYOK flag, admin emails, spend ceiling)
//**
// Typed access to server env. Import only from server code (routes, server components).
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY!,
  openaiApiKey: process.env.OPENAI_API_KEY!,
  aiModel: process.env.AI_MODEL ?? "gpt-5-mini",
  encryptionKey: process.env.ENCRYPTION_KEY!,
  enableByok: process.env.ENABLE_BYOK === "true",
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  dailySpendCeilingUsd: Number(process.env.DAILY_SPEND_CEILING_USD ?? 20),
};

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && env.adminEmails.includes(email.toLowerCase());
}
