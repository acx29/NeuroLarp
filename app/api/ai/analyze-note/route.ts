//**
// app/api/ai/analyze-note/route.ts
// The suggestion pipeline: note + topic inventory -> LLM -> dedupe -> suggestions inbox
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { analyzeNoteSchema } from "@/lib/ai/schemas";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";

// Debounced on-save + manual Analyze trigger (PLAN decision 4). One LLM call:
// note text + full topic/edge inventory in, whitelist-validated suggestions out,
// deduped, written to the one reversible suggestions inbox (decision 8).
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await enforceRate(request, user.id, "ai_call");
    const { noteId } = await request.json();

    const [{ data: note }, { data: topics }, { data: edges }, { data: pending }] = await Promise.all([
      supabase.from("notes").select("id, title, content_text, topic_id").eq("id", noteId).single(),
      supabase.from("topics").select("id, title, description"),
      supabase.from("topic_edges").select("source_id, target_id, kind"),
      supabase.from("suggestions").select("kind, payload").eq("status", "pending"),
    ]);
    if (!note) return NextResponse.json({ error: "note not found" }, { status: 404 });
    if (note.content_text.trim().length < 40) {
      return NextResponse.json({ suggestions: [] }); // nothing meaningful to analyze
    }

    const topicIds = new Set((topics ?? []).map((t) => t.id));
    const inventory = (topics ?? [])
      .map((t) => `- ${t.id} :: ${t.title}${t.description ? ` — ${t.description}` : ""}`)
      .join("\n");
    const edgeList = (edges ?? []).map((e) => `${e.source_id} -${e.kind}-> ${e.target_id}`).join("\n");

    const out = await aiObject({
      userId: user.id,
      userEmail: user.email ?? null,
      kind: "analyze_note",
      schema: analyzeNoteSchema(topicIds),
      system: `You analyze a student's note against their topic graph and propose at most 3 high-value suggestions.
Rules:
- Every suggestion object has ALL fields; set the ones your kind does not use to null.
- assign_note (uses topic_id) only when the note clearly belongs to an existing topic and is currently unassigned or misassigned.
- new_topic (uses title) only when several concepts in the note fit no existing topic. Title it like a course unit.
- new_edge (uses source_topic_id, target_topic_id, edge_kind) connects two EXISTING topics whose relationship the note evidences. For subtopic_of, source is the narrower subtopic, target the broader parent. Use related for peer concepts.
- Never propose an edge that already exists (in either direction) or duplicates a pending suggestion.
- Rationales are one sentence, concrete, and reference what in the note justifies the link.
- Confidence below 0.5 means do not include the suggestion.`,
      prompt: `NOTE (title: ${note.title}; currently assigned topic id: ${note.topic_id ?? "none"}):
${note.content_text.slice(0, 6000)}

TOPICS (id :: title — description):
${inventory || "(none yet)"}

EXISTING EDGES:
${edgeList || "(none)"}`,
    });

    // Server-side dedupe: drop anything the model suggested against the rules.
    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    const existingPairs = new Set((edges ?? []).map((e) => pairKey(e.source_id, e.target_id)));
    const pendingPairs = new Set(
      (pending ?? [])
        .filter((p) => p.kind === "new_edge")
        .map((p) => {
          const pl = p.payload as { source_topic_id?: string; target_topic_id?: string };
          return pairKey(pl.source_topic_id ?? "", pl.target_topic_id ?? "");
        })
    );
    const existingTitles = new Set((topics ?? []).map((t) => t.title.toLowerCase()));

    // the schema's superRefine guarantees kind-specific fields are present;
    // this filter applies the business rules (dedupe, confidence floor)
    const rows = out.suggestions
      .filter((s) => {
        if (s.confidence < 0.5) return false;
        if (s.kind === "new_edge") {
          const k = pairKey(s.source_topic_id!, s.target_topic_id!);
          return s.source_topic_id !== s.target_topic_id && !existingPairs.has(k) && !pendingPairs.has(k);
        }
        if (s.kind === "assign_note") return s.topic_id !== note.topic_id;
        if (s.kind === "new_topic") return !existingTitles.has(s.title!.toLowerCase());
        return false;
      })
      .map((s) => ({
        user_id: user.id,
        kind: s.kind,
        rationale: s.rationale,
        confidence: s.confidence,
        payload:
          s.kind === "new_edge"
            ? { source_topic_id: s.source_topic_id, target_topic_id: s.target_topic_id, edge_kind: s.edge_kind, note_id: note.id }
            : s.kind === "assign_note"
              ? { note_id: note.id, topic_id: s.topic_id }
              : { title: s.title, assign_note_id: note.topic_id ? null : note.id },
      }));

    const inserted =
      rows.length > 0
        ? (await supabase.from("suggestions").insert(rows).select("id, kind, payload, rationale, confidence")).data ?? []
        : [];
    await supabase.from("notes").update({ last_analyzed_at: new Date().toISOString() }).eq("id", note.id);
    return NextResponse.json({ suggestions: inserted });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "analyze failed" }, { status: 500 });
  }
}
