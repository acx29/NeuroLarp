//**
// app/api/plans/generate/route.ts
// Plan generation: collect the goal topic's subgraph, topo-sort it (general
// before specific), enrich with review stats and linked readings, then have the
// model lay out dated study/quiz/read sessions
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { planSchema } from "@/lib/ai/schemas";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";
import { collectSubgraph, topoSort, type GraphEdge } from "@/lib/graph";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await enforceRate(request, user.id, "ai_call");
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const goalTopicId = String(body.goal_topic_id ?? "");
    const dueDate = String(body.due_date ?? "");
    if (!name || !goalTopicId || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ error: "name, goal topic, and due date required" }, { status: 400 });
    }

    const [{ data: topics }, { data: edges }, { data: notes }, { data: reviews }] = await Promise.all([
      supabase.from("topics").select("id, title"),
      supabase.from("topic_edges").select("source_id, target_id, kind"),
      supabase.from("notes").select("topic_id"),
      supabase.from("review_state").select("topic_id, due_at, interval_days, priority"),
    ]);
    const graph: GraphEdge[] = (edges ?? []).map((e) => ({
      source: e.source_id,
      target: e.target_id,
      kind: e.kind as GraphEdge["kind"],
    }));
    const sub = collectSubgraph(graph, goalTopicId);
    const order = topoSort(sub.topicIds, sub.edges);
    const scope = new Set(order);
    if (!scope.has(goalTopicId)) return NextResponse.json({ error: "goal topic not found" }, { status: 404 });

    const titleOf = new Map((topics ?? []).map((t) => [t.id, t.title]));
    const noteCount = new Map<string, number>();
    for (const n of notes ?? []) {
      if (n.topic_id && scope.has(n.topic_id)) noteCount.set(n.topic_id, (noteCount.get(n.topic_id) ?? 0) + 1);
    }
    const reviewOf = new Map((reviews ?? []).map((r) => [r.topic_id, r]));

    // readings: sections mapped to in-scope topics
    const { data: sectionTopics } = await supabase.from("section_topics").select("section_id, topic_id");
    const scopeSections = new Set(
      (sectionTopics ?? []).filter((st) => scope.has(st.topic_id)).map((st) => st.section_id)
    );
    const { data: sections } = scopeSections.size
      ? await supabase.from("source_sections").select("id, label, title").in("id", [...scopeSections])
      : { data: [] as Array<{ id: string; label: string; title: string }> };

    const today = new Date().toISOString().slice(0, 10);
    const topicLines = order
      .map((id, i) => {
        const r = reviewOf.get(id);
        return `${i + 1}. ${titleOf.get(id)} (id ${id}) · notes: ${noteCount.get(id) ?? 0} · weak-priority: ${r ? r.priority : "unknown"} · recall interval: ${r ? `${r.interval_days}d` : "none"}`;
      })
      .join("\n");
    const sectionLines = (sections ?? []).map((s) => `- ${s.id} :: ${s.label} ${s.title}`).join("\n");

    const out = await aiObject({
      userId: user.id,
      userEmail: user.email ?? null,
      kind: "plan_generation",
      schema: planSchema(scope, new Set((sections ?? []).map((s) => s.id))),
      system: `You build a dated study plan for a student.
Rules:
- Sessions run from ${today} to ${dueDate}, 3 to 5 per week, never more than 2 on one day.
- Follow the numbered topic order: earlier numbers are broader and come first.
- For each topic: a study session before its first quiz session. Weak-priority near 1 means the topic needs extra quiz sessions; near 0 means it is solid.
- kind read requires a source_section_id from the reading list; use read sessions when relevant readings exist.
- The final week before ${dueDate} is review: quiz sessions across the whole scope.
- title is imperative and specific. rationale is one sentence.`,
      prompt: `GOAL: ${name} (goal topic: ${titleOf.get(goalTopicId)})
TOPICS IN LEARNING ORDER:
${topicLines}
READINGS (id :: label title):
${sectionLines || "(none)"}`,
    });

    const { data: plan, error: pErr } = await supabase
      .from("plans")
      .insert({
        user_id: user.id,
        name,
        goal_topic_id: goalTopicId,
        due_date: dueDate,
        status: "active",
        meta: { topic_count: order.length },
      })
      .select("id")
      .single();
    if (pErr || !plan) return NextResponse.json({ error: pErr?.message ?? "plan insert failed" }, { status: 500 });

    const items = out.items
      .filter((it) => it.due_date >= today && it.due_date <= dueDate)
      .map((it) => ({
        user_id: user.id,
        plan_id: plan.id,
        due_date: it.due_date,
        kind: it.kind,
        topic_id: it.topic_id,
        source_section_id: it.source_section_id,
        title: it.title,
        rationale: it.rationale,
      }));
    if (items.length) await supabase.from("plan_items").insert(items);

    return NextResponse.json({ plan_id: plan.id, item_count: items.length });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "plan generation failed" }, { status: 500 });
  }
}
