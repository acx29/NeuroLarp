//**
// app/(app)/notes/page.tsx
// Notes list: all notes with topic pills + relative time; ?q= runs full-text search
//**
import { supabaseServer } from "@/lib/supabase/server";
import { NotesList } from "@/components/notes-list";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; topic?: string }>;
}) {
  const { q, topic } = await searchParams;
  const supabase = await supabaseServer();

  let query = supabase
    .from("notes")
    .select("id, title, content_text, topic_id, updated_at, provenance")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (q?.trim()) query = query.textSearch("fts", q.trim(), { type: "websearch" });
  if (topic) query = query.eq("topic_id", topic);

  const [{ data: notes }, { data: topics }] = await Promise.all([
    query,
    supabase.from("topics").select("id, title, color_hue"),
  ]);

  return <NotesList notes={notes ?? []} topics={topics ?? []} q={q ?? ""} />;
}
