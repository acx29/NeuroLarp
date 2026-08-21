//**
// app/api/plans/[id]/route.ts
// PATCH plan status; POST inserts an extra review session for a dipping topic
// (the plan-suggestion banner's Apply action)
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const status = ["active", "done", "archived"].includes(body.status) ? body.status : null;
  if (!status) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const { error } = await supabase.from("plans").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const topicId = String(body.topic_id ?? "");
  const { data: topic } = await supabase.from("topics").select("id, title").eq("id", topicId).single();
  if (!topic) return NextResponse.json({ error: "topic not found" }, { status: 404 });

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const { error } = await supabase.from("plan_items").insert({
    user_id: user.id,
    plan_id: id,
    due_date: tomorrow,
    kind: "quiz",
    topic_id: topic.id,
    title: `Extra review: ${topic.title}`,
    rationale: "Added because accuracy dipped on recent sets.",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
