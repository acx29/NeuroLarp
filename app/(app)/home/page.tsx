//**
// app/(app)/home/page.tsx
// Home: loads a specific note (?note=id) or the most recently edited one, plus topics
//**
import { supabaseServer } from "@/lib/supabase/server";
import { NoteEditor } from "@/components/note-editor";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const { note: noteParam } = await searchParams;
  const supabase = await supabaseServer();

  const noteQuery = noteParam
    ? supabase
        .from("notes")
        .select("id, title, content, topic_id, updated_at, provenance")
        .eq("id", noteParam)
        .maybeSingle()
    : supabase
        .from("notes")
        .select("id, title, content, topic_id, updated_at, provenance")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  const [{ data: note }, { data: topics }] = await Promise.all([
    noteQuery,
    supabase.from("topics").select("id, title, color_hue"),
  ]);

  return <NoteEditor key={note?.id ?? "new"} initialNote={note ?? null} topics={topics ?? []} />;
}
