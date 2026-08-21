//**
// app/(app)/layout.tsx
// Authenticated layout: loads profile/due-count/plan card data, renders the Shell
//**
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { count: dueCount }, { data: plan }] = await Promise.all([
    supabase.from("profiles").select("username, email, settings").eq("id", user.id).maybeSingle(),
    supabase
      .from("review_state")
      .select("topic_id", { count: "exact", head: true })
      .lte("due_at", new Date().toISOString()),
    supabase
      .from("plans")
      .select("id, name, due_date, plan_items(status)")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  let featureCard: { planId: string; name: string; done: number; total: number; daysLeft: number } | null = null;
  if (plan && settings.dismissedPlanCard !== plan.id) {
    const items = (plan.plan_items ?? []) as Array<{ status: string }>;
    const done = items.filter((i) => i.status === "done").length;
    const daysLeft = plan.due_date
      ? Math.max(0, Math.ceil((new Date(plan.due_date).getTime() - Date.now()) / 86_400_000))
      : 0;
    featureCard = { planId: plan.id, name: plan.name, done, total: items.length, daysLeft };
  }

  return (
    <Shell
      userId={user.id}
      username={profile?.username ?? "user"}
      email={profile?.email ?? user.email ?? ""}
      settings={settings}
      dueCount={dueCount ?? 0}
      featureCard={featureCard}
    >
      {children}
    </Shell>
  );
}
