//**
// app/api/edges/route.ts
// POST /api/edges — create a topic edge; subtopic_of is cycle-checked before insert (PLAN 5/6)
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { wouldCycle, type GraphEdge } from "@/lib/graph";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { source_id, target_id } = body;
  const kind = body.kind === "subtopic_of" ? "subtopic_of" : "related";
  if (!source_id || !target_id || source_id === target_id) {
    return NextResponse.json({ error: "two distinct topics required" }, { status: 400 });
  }

  if (kind === "subtopic_of") {
    const { data: edges } = await supabase.from("topic_edges").select("source_id, target_id, kind");
    const graph: GraphEdge[] = (edges ?? []).map((e) => ({
      source: e.source_id,
      target: e.target_id,
      kind: e.kind as GraphEdge["kind"],
    }));
    if (wouldCycle(graph, source_id, target_id)) {
      return NextResponse.json({ error: "That link would create a cycle in the hierarchy" }, { status: 409 });
    }
  }

  const { data, error } = await supabase
    .from("topic_edges")
    .insert({
      user_id: user.id,
      source_id,
      target_id,
      kind,
      rationale: String(body.rationale ?? ""),
      ai_generated: false,
    })
    .select("id, source_id, target_id, kind, rationale")
    .single();
  if (error) {
    const dup = error.message.includes("topic_edges_pair_uniq");
    return NextResponse.json(
      { error: dup ? "These topics are already linked" : error.message },
      { status: dup ? 409 : 400 }
    );
  }
  return NextResponse.json({ edge: data });
}
