//**
// app/api/edges/[id]/route.ts
// DELETE a topic edge (graph screen: edges are deletable)
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("topic_edges").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
