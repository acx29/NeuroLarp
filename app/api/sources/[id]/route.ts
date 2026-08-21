//**
// app/api/sources/[id]/route.ts
// DELETE a source (cascades sections/chunks; removes the stored PDF if any)
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

  const { data: src } = await supabase.from("sources").select("file_path").eq("id", id).single();
  if (src?.file_path) await supabase.storage.from("sources").remove([src.file_path]);
  const { error } = await supabase.from("sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
