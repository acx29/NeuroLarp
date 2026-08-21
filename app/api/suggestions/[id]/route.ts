//**
// app/api/suggestions/[id]/route.ts
// Accept/Reject a suggestion; accept performs the real mutation (cycle-checked edges etc.)
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { wouldCycle, type GraphEdge } from "@/lib/graph";
import { nextHue } from "@/lib/utils";

// Accept/Reject for the suggestions inbox (PLAN decision 8). Nothing the AI
// proposes mutates the graph until this route runs with action=accept.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { action } = await request.json();
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "action must be accept|reject" }, { status: 400 });
  }

  const { data: sug } = await supabase
    .from("suggestions")
    .select("id, kind, payload, rationale, status")
    .eq("id", id)
    .single();
  if (!sug) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (sug.status !== "pending") return NextResponse.json({ error: "already resolved" }, { status: 409 });

  if (action === "accept") {
    const p = sug.payload as Record<string, string | null>;
    try {
      switch (sug.kind) {
        case "new_edge": {
          const { data: edges } = await supabase.from("topic_edges").select("source_id, target_id, kind");
          const graph: GraphEdge[] = (edges ?? []).map((e) => ({
            source: e.source_id,
            target: e.target_id,
            kind: e.kind as GraphEdge["kind"],
          }));
          if (p.edge_kind === "subtopic_of" && wouldCycle(graph, p.source_topic_id!, p.target_topic_id!)) {
            return NextResponse.json({ error: "accepting would create a cycle" }, { status: 409 });
          }
          const { error } = await supabase.from("topic_edges").insert({
            user_id: user.id,
            source_id: p.source_topic_id!,
            target_id: p.target_topic_id!,
            kind: (p.edge_kind as "subtopic_of" | "related") ?? "related",
            rationale: sug.rationale,
            ai_generated: true,
          });
          if (error) throw new Error(error.message);
          break;
        }
        case "assign_note": {
          const { error } = await supabase.from("notes").update({ topic_id: p.topic_id }).eq("id", p.note_id!);
          if (error) throw new Error(error.message);
          break;
        }
        case "new_topic": {
          const { data: topics } = await supabase.from("topics").select("color_hue");
          const { data: created, error } = await supabase
            .from("topics")
            .insert({
              user_id: user.id,
              title: p.title!,
              color_hue: nextHue((topics ?? []).map((t) => t.color_hue)),
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          if (p.assign_note_id && created) {
            await supabase.from("notes").update({ topic_id: created.id }).eq("id", p.assign_note_id);
          }
          break;
        }
        case "assign_source": {
          const { error } = await supabase
            .from("source_topics")
            .insert({ user_id: user.id, source_id: p.source_id!, topic_id: p.topic_id! });
          if (error) throw new Error(error.message);
          break;
        }
        case "identify_source": {
          const meta = sug.payload as unknown as {
            source_id: string;
            identified_title: string;
            authors: string;
            edition_guess: string;
            sections?: Array<{ label: string; title: string }>;
          };
          const { data: src } = await supabase.from("sources").select("meta").eq("id", meta.source_id).single();
          const { error } = await supabase
            .from("sources")
            .update({
              meta: {
                ...((src?.meta as Record<string, unknown>) ?? {}),
                canonical_title: meta.identified_title,
                authors: meta.authors,
                edition: meta.edition_guess,
                identity_confirmed: true,
              },
            })
            .eq("id", meta.source_id);
          if (error) throw new Error(error.message);
          if (meta.sections?.length) {
            await supabase.from("source_sections").insert(
              meta.sections.map((s, i) => ({
                user_id: user.id,
                source_id: meta.source_id,
                label: s.label,
                title: s.title,
                ordinal: i,
              }))
            );
          }
          break;
        }
        case "section_map": {
          const { error } = await supabase
            .from("section_topics")
            .insert({ user_id: user.id, section_id: p.section_id!, topic_id: p.topic_id! });
          if (error) throw new Error(error.message);
          break;
        }
      }
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "accept failed" }, { status: 400 });
    }
  }

  await supabase
    .from("suggestions")
    .update({ status: action === "accept" ? "accepted" : "rejected", resolved_at: new Date().toISOString() })
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
