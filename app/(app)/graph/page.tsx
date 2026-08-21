//**
// app/(app)/graph/page.tsx
// Node Graph: loads topics, edges, note counts, and the pending edge suggestion
//**
import { supabaseServer } from "@/lib/supabase/server";
import { GraphView } from "@/components/graph-view";

export default async function GraphPage() {
  const supabase = await supabaseServer();
  const [{ data: topics }, { data: edges }, { data: notes }, { data: suggestion }] = await Promise.all([
    supabase.from("topics").select("id, title, color_hue, created_at").order("created_at"),
    supabase.from("topic_edges").select("id, source_id, target_id, kind, rationale"),
    supabase.from("notes").select("topic_id"),
    supabase
      .from("suggestions")
      .select("id, payload, rationale")
      .eq("status", "pending")
      .eq("kind", "new_edge")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const counts: Record<string, number> = {};
  for (const n of notes ?? []) {
    if (n.topic_id) counts[n.topic_id] = (counts[n.topic_id] ?? 0) + 1;
  }

  return (
    <GraphView
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
