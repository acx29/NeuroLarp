//**
// app/api/notes/[id]/route.ts
// PATCH/DELETE a note; regenerates content_text + embedding on content change
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { tiptapToText } from "@/lib/tiptap";
import { resolveModel } from "@/lib/ai/provider";
import { embedTexts } from "@/lib/ai/embeddings";
import type { Database } from "@/lib/database.types";

type NoteUpdate = Database["public"]["Tables"]["notes"]["Update"];

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const patch: NoteUpdate = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200) || "Untitled";
  if ("topic_id" in body) patch.topic_id = body.topic_id as string | null;
  let newText: string | null = null;
  if (body.content) {
    patch.content = body.content as NoteUpdate["content"];
    newText = tiptapToText(body.content);
    patch.content_text = newText;
  }

  const { data, error } = await supabase
    .from("notes")
    .update(patch)
    .eq("id", id)
    .select("id, title, topic_id, updated_at, content_text")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Refresh the embedding when the text materially changed (vectors are derived data).
  if (newText && newText.length > 20) {
    try {
      const resolved = await resolveModel(user.id);
      const [embedding] = await embedTexts({
        userId: user.id,
        apiKey: resolved.embeddingApiKey,
        byok: resolved.byok && resolved.provider === "openai",
        texts: [`${data.title}\n${newText}`],
      });
      await supabase.from("notes").update({ embedding: JSON.stringify(embedding) }).eq("id", id);
    } catch {
      // non-fatal: search quality degrades until next successful save
    }
  }
  return NextResponse.json({ note: data });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
