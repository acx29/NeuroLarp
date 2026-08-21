//**
// app/api/notes/route.ts
// POST /api/notes — create a note (title/content/topic), content_text derived server-side
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { tiptapToText } from "@/lib/tiptap";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const content = body.content ?? { type: "doc", content: [{ type: "paragraph" }] };
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      title: body.title ?? "Untitled",
      content,
      content_text: tiptapToText(content),
      topic_id: body.topic_id ?? null,
      provenance: body.provenance ?? {},
    })
    .select("id, title, topic_id, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ note: data });
}
