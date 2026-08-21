//**
// app/(app)/progress/page.tsx
// Progress data: per-topic accuracy, stat cards, per-set bars, recent activity.
// Stats cover the last 30 days to match the header label.
//**
import { supabaseServer } from "@/lib/supabase/server";
import { ProgressView, type TopicStats, type ActivityRow } from "@/components/progress-view";
import { relTime } from "@/lib/utils";

const DAY_MS = 86_400_000;

function dueLabel(dueAt: string): string {
  const diff = new Date(dueAt).getTime() - Date.now();
  if (diff <= 0) return "due for review today";
  const days = Math.ceil(diff / DAY_MS);
  return days === 1 ? "next review tomorrow" : `next review in ${days} days`;
}

export default async function ProgressPage() {
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const [
    { data: topics },
    { data: reviewStates },
    { data: quizzes },
    { data: quizTopics },
    { data: attempts },
    { data: answers },
    { data: questions },
    { data: notes },
  ] = await Promise.all([
    supabase.from("topics").select("id, title").order("created_at"),
    supabase.from("review_state").select("topic_id, due_at, interval_days"),
    supabase.from("quizzes").select("id, title, is_mix, mode"),
    supabase.from("quiz_topics").select("quiz_id, topic_id"),
    supabase
      .from("quiz_attempts")
      .select("id, quiz_id, score, completed_at")
      .not("completed_at", "is", null)
      .gte("completed_at", since)
      .order("completed_at"),
    supabase.from("attempt_answers").select("attempt_id, question_id, correct").gte("created_at", since),
    supabase.from("quiz_questions").select("id, difficulty, topic_id"),
    supabase.from("notes").select("id, title, topic_id, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const topicQuizzes = new Map<string, Set<string>>();
  for (const qt of quizTopics ?? []) {
    (topicQuizzes.get(qt.topic_id) ?? topicQuizzes.set(qt.topic_id, new Set()).get(qt.topic_id)!).add(qt.quiz_id);
  }
  const answersByAttempt = new Map<string, Array<{ question_id: string; correct: boolean | null }>>();
  for (const a of answers ?? []) {
    (answersByAttempt.get(a.attempt_id) ?? answersByAttempt.set(a.attempt_id, []).get(a.attempt_id)!).push(a);
  }
  const questionById = new Map((questions ?? []).map((q) => [q.id, q]));
  const reviewByTopic = new Map((reviewStates ?? []).map((r) => [r.topic_id, r]));

  const stats: Record<string, TopicStats> = {};
  const accOf: Record<string, number | null> = {};
  for (const t of topics ?? []) {
    const quizIds = topicQuizzes.get(t.id) ?? new Set();
    const tAttempts = (attempts ?? []).filter((a) => quizIds.has(a.quiz_id) && a.score !== null);
    const scores = tAttempts.map((a) => a.score as number);
    const avg = scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 100) : null;
    accOf[t.id] = avg;

    let qAnswered = 0;
    const missDiffs: number[] = [];
    for (const a of tAttempts) {
      for (const ans of answersByAttempt.get(a.id) ?? []) {
        qAnswered += 1;
        const q = questionById.get(ans.question_id);
        if (ans.correct === false && q?.topic_id === t.id) missDiffs.push(q.difficulty);
      }
    }

    // trend: mean of the last two sets vs the two before them
    let trend: TopicStats["trend"] = null;
    if (scores.length >= 4) {
      const last2 = (scores[scores.length - 1] + scores[scores.length - 2]) / 2;
      const prev2 = (scores[scores.length - 3] + scores[scores.length - 4]) / 2;
      const pts = Math.round((last2 - prev2) * 100);
      trend = pts === 0 ? { dir: "flat", pts: 0 } : { dir: pts > 0 ? "up" : "down", pts: Math.abs(pts) };
    }

    const rs = reviewByTopic.get(t.id);
    const bars = tAttempts.slice(-8).map((a, i) => ({
      label: `S${i + 1}`,
      pct: Math.round((a.score as number) * 100),
    }));

    stats[t.id] = {
      practiced: tAttempts.length,
      due: rs ? dueLabel(rs.due_at) : "no reviews scheduled yet",
      questionsAnswered: qAnswered,
      setCount: tAttempts.length,
      avgAccuracy: avg,
      trend,
      intervalDays: rs ? Math.max(1, Math.round(rs.interval_days)) : null,
      difficulty: missDiffs.length
        ? Math.min(5, Math.max(1, Math.round(missDiffs.reduce((x, y) => x + y, 0) / missDiffs.length)))
        : null,
      bars,
    };
  }

  // recent activity: graded sets and added notes, newest first
  const topicTitle = new Map((topics ?? []).map((t) => [t.id, t.title]));
  const activity: ActivityRow[] = [
    ...(attempts ?? [])
      .filter((a) => a.score !== null)
      .map((a) => {
        const q = quizById.get(a.quiz_id);
        const n = (answersByAttempt.get(a.id) ?? []).length;
        return {
          txt: q?.title ?? "Quiz",
          meta: `${n} questions · ${Math.round((a.score as number) * 100)}%`,
          time: relTime(a.completed_at as string),
          at: a.completed_at as string,
        };
      }),
    ...(notes ?? []).map((n) => ({
      txt: `Note added · ${n.title || "Untitled"}`,
      meta: n.topic_id ? topicTitle.get(n.topic_id) ?? "" : "no topic",
      time: relTime(n.created_at),
      at: n.created_at,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  return (
    <ProgressView
      topics={(topics ?? []).map((t) => ({ id: t.id, title: t.title, acc: accOf[t.id] }))}
      stats={stats}
      activity={activity}
    />
  );
}
