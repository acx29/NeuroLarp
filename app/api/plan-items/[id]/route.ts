//**
// app/api/plan-items/[id]/route.ts
// PATCH a plan item's status (pending | done | dismissed)
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
  const status = ["pending", "done", "dismissed"].includes(body.status) ? body.status : null;
  if (!status) return NextResponse.json({ error: "invalid status" }, { status: 400 });
  const { error } = await supabase.from("plan_items").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
