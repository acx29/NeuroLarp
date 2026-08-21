//**
// app/(app)/plans/page.tsx
// Plans data: plan switcher, meta line, dip-detection for the suggestion
// banner, 112-day activity heatmap, upcoming items
//**
import { supabaseServer } from "@/lib/supabase/server";
import { PlansView, type PlanItemRow } from "@/components/plans-view";

const DAY_MS = 86_400_000;

function dayLabel(dateStr: string): string {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const d = new Date(dateStr);
  const diff = Math.round((d.getTime() - today.getTime()) / DAY_MS);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Tmrw";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planParam } = await searchParams;
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 111 * DAY_MS).toISOString();

  const [{ data: plans }, { data: topics }, { data: attempts }, { data: notes }, { data: quizzes }, { data: quizTopics }] =
    await Promise.all([
      supabase.from("plans").select("id, name, due_date, status, meta, created_at").order("created_at", { ascending: false }),
      supabase.from("topics").select("id, title").order("created_at"),
      supabase
        .from("quiz_attempts")
        .select("quiz_id, score, completed_at")
        .not("completed_at", "is", null)
        .gte("completed_at", since)
        .order("completed_at"),
      supabase.from("notes").select("created_at").gte("created_at", since),
      supabase.from("quizzes").select("id, topic_id"),
      supabase.from("quiz_topics").select("quiz_id, topic_id"),
    ]);

  const active = (plans ?? []).find((p) => p.id === planParam) ?? (plans ?? []).find((p) => p.status === "active") ?? (plans ?? [])[0] ?? null;

  const { data: items } = active
    ? await supabase.from("plan_items").select("id, due_date, kind, topic_id, title, rationale, status").eq("plan_id", active.id).order("due_date")
    : { data: [] as never[] };

  // heatmap: one cell per day for 112 days ending today; level from event count
  const counts = new Array(112).fill(0);
  const startMs = Date.now() - 111 * DAY_MS;
  const bump = (iso: string) => {
    const i = Math.floor((new Date(iso).getTime() - startMs) / DAY_MS);
    if (i >= 0 && i < 112) counts[i] += 1;
  };
  for (const a of attempts ?? []) bump(a.completed_at as string);
  for (const n of notes ?? []) bump(n.created_at);
  const heat = counts.map((c) => (c === 0 ? 0 : c === 1 ? 1 : c <= 3 ? 2 : 3));

  // dip detection for the suggestion banner: worst topic whose last two sets
  // average at least 8 points below the two before
  const topicQuizzes = new Map<string, Set<string>>();
  for (const qt of quizTopics ?? []) {
    (topicQuizzes.get(qt.topic_id) ?? topicQuizzes.set(qt.topic_id, new Set()).get(qt.topic_id)!).add(qt.quiz_id);
  }
  let dip: { topicId: string; topicTitle: string } | null = null;
  let worst = -8;
  for (const t of topics ?? []) {
    const ids = topicQuizzes.get(t.id) ?? new Set();
    const scores = (attempts ?? []).filter((a) => ids.has(a.quiz_id) && a.score !== null).map((a) => a.score as number);
    if (scores.length < 4) continue;
    const last2 = (scores[scores.length - 1] + scores[scores.length - 2]) / 2;
    const prev2 = (scores[scores.length - 3] + scores[scores.length - 4]) / 2;
    const pts = Math.round((last2 - prev2) * 100);
    if (pts < worst) {
      worst = pts;
      dip = { topicId: t.id, topicTitle: t.title };
    }
  }

  const itemRows: PlanItemRow[] = (items ?? []).map((it) => ({
    id: it.id,
    day: dayLabel(it.due_date),
    dueDate: it.due_date,
    kind: it.kind as PlanItemRow["kind"],
    topicId: it.topic_id,
    title: it.title,
    rationale: it.rationale,
    status: it.status as PlanItemRow["status"],
  }));

  return (
    <PlansView
      plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name, status: p.status }))}
      active={
        active
          ? {
              id: active.id,
              name: active.name,
              dueDate: active.due_date,
              topicCount: Number((active.meta as { topic_count?: number })?.topic_count ?? 0),
            }
          : null
      }
      items={itemRows}
      heat={heat}
      dip={dip}
      topics={(topics ?? []).map((t) => ({ id: t.id, title: t.title }))}
    />
  );
}
