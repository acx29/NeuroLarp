//**
// app/(app)/quiz/page.tsx
// Quiz screen data: topic cards with linked counts + last accuracy, saved
// quizzes, weak-point pills from recent misses. ?open=&pair= pre-opens the modal.
//**
import { supabaseServer } from "@/lib/supabase/server";
import { QuizView } from "@/components/quiz-view";
import { relTime } from "@/lib/utils";

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; pair?: string }>;
}) {
  const { open, pair } = await searchParams;
  const supabase = await supabaseServer();

  const [{ data: topics }, { data: edges }, { data: quizzes }, { data: questions }, { data: attempts }, { data: misses }] =
    await Promise.all([
      supabase.from("topics").select("id, title, color_hue").order("created_at"),
      supabase.from("topic_edges").select("id, source_id, target_id"),
      supabase.from("quizzes").select("id, topic_id, mode, is_mix, title, created_at").order("created_at", { ascending: false }),
      supabase.from("quiz_questions").select("id, quiz_id"),
      supabase
        .from("quiz_attempts")
        .select("quiz_id, score, completed_at")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false }),
      supabase
        .from("attempt_answers")
        .select("created_at, quiz_questions(prompt, topic_id)")
        .eq("correct", false)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const linked = new Map<string, Array<{ id: string; title: string }>>();
  const titleOf = new Map((topics ?? []).map((t) => [t.id, t.title]));
  for (const e of edges ?? []) {
    for (const [a, b] of [
      [e.source_id, e.target_id],
      [e.target_id, e.source_id],
    ]) {
      const list = linked.get(a) ?? [];
      if (titleOf.has(b)) list.push({ id: b, title: titleOf.get(b)! });
      linked.set(a, list);
    }
  }

  const quizParent = new Map((quizzes ?? []).map((q) => [q.id, q.topic_id]));
  const lastPct = new Map<string, number>();
  for (const a of attempts ?? []) {
    const t = quizParent.get(a.quiz_id);
    if (t && a.score !== null && !lastPct.has(t)) lastPct.set(t, Math.round(a.score * 100));
  }

  const weak = new Map<string, string[]>();
  for (const m of misses ?? []) {
    const t = m.quiz_questions?.topic_id;
    const p = m.quiz_questions?.prompt;
    if (!t || !p) continue;
    const list = weak.get(t) ?? [];
    const label = p.length > 34 ? p.slice(0, 34).trimEnd() + "…" : p;
    if (list.length < 3 && !list.includes(label)) list.push(label);
    weak.set(t, list);
  }

  const qCount = new Map<string, number>();
  for (const q of questions ?? []) qCount.set(q.quiz_id, (qCount.get(q.quiz_id) ?? 0) + 1);
  const bestPct = new Map<string, number>();
  for (const a of attempts ?? []) {
    if (a.score === null) continue;
    bestPct.set(a.quiz_id, Math.max(bestPct.get(a.quiz_id) ?? 0, Math.round(a.score * 100)));
  }

  return (
    <QuizView
      topics={(topics ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        linkedCount: (linked.get(t.id) ?? []).length,
        lastPct: lastPct.get(t.id) ?? null,
      }))}
      linkedMap={Object.fromEntries(linked)}
      weakMap={Object.fromEntries(weak)}
      savedQuizzes={(quizzes ?? []).map((q) => ({
        id: q.id,
        title: q.title,
        qCount: qCount.get(q.id) ?? 0,
        bestPct: bestPct.get(q.id) ?? null,
        time: relTime(q.created_at),
      }))}
      openTopicId={open ?? null}
      pairTopicId={pair ?? null}
    />
  );
}
