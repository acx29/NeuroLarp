//**
// app/(app)/topics/page.tsx
// Learning Topics: AI suggestion banner + indented hierarchy tree from subtopic_of edges
//**
import { supabaseServer } from "@/lib/supabase/server";
import { TopicsView } from "@/components/topics-view";

export default async function TopicsPage() {
  const supabase = await supabaseServer();
  const [{ data: topics }, { data: edges }, { data: notes }, { data: suggestion }] = await Promise.all([
    supabase.from("topics").select("id, title, color_hue, created_at").order("created_at"),
    supabase.from("topic_edges").select("id, source_id, target_id, kind"),
    supabase.from("notes").select("topic_id"),
    supabase
      .from("suggestions")
      .select("id, kind, payload, rationale")
      .eq("status", "pending")
      .eq("kind", "new_topic")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const counts: Record<string, number> = {};
  for (const n of notes ?? []) {
    if (n.topic_id) counts[n.topic_id] = (counts[n.topic_id] ?? 0) + 1;
  }

  return (
    <TopicsView
      topics={topics ?? []}
      edges={edges ?? []}
      noteCounts={counts}
      suggestion={
        suggestion
          ? { ...suggestion, payload: (suggestion.payload ?? {}) as Record<string, string | null> }
          : null
      }
    />
  );
}
