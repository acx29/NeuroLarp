//**
// app/api/quiz/[id]/attempt/route.ts
// Grade a completed attempt: exact match for mcq/cloze, one batched AI call for
// short answers, then SRS review_state updates for every topic on the quiz
//**
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";
import { applyReview } from "@/lib/srs";

// Grading batches an AI call for short answers; raise the serverless timeout.
export const maxDuration = 120;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?]+$/, "");

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const answers: Array<{ question_id: string; response: string; time_ms?: number }> = Array.isArray(body.answers)
      ? body.answers
      : [];

    const [{ data: quiz }, { data: questions }, { data: quizTopics }] = await Promise.all([
      supabase.from("quizzes").select("id, topic_id").eq("id", id).single(),
      supabase
        .from("quiz_questions")
        .select("id, format, prompt, options, answer, explanation")
        .eq("quiz_id", id),
      supabase.from("quiz_topics").select("topic_id").eq("quiz_id", id),
    ]);
    if (!quiz || !questions?.length) return NextResponse.json({ error: "quiz not found" }, { status: 404 });

    const byId = new Map(questions.map((q) => [q.id, q]));
    const graded = new Map<string, { correct: boolean; partial: number; feedback: string }>();

    // deterministic grading first
    const shortOnes: Array<{ question_id: string; prompt: string; expected: string; response: string }> = [];
    for (const a of answers) {
      const q = byId.get(a.question_id);
      if (!q) continue;
      if (q.format === "short") {
        if (a.response.trim()) {
          shortOnes.push({ question_id: q.id, prompt: q.prompt, expected: q.answer, response: a.response });
        } else {
          graded.set(q.id, { correct: false, partial: 0, feedback: "No answer given." });
        }
      } else {
        const ok = norm(a.response) === norm(q.answer);
        graded.set(q.id, { correct: ok, partial: ok ? 1 : 0, feedback: "" });
      }
    }

    // one batched AI call for the free-text answers
    if (shortOnes.length > 0) {
      await enforceRate(request, user.id, "ai_call");
      const idSet = new Set(shortOnes.map((s) => s.question_id));
      const gradeSchema = z.object({
        grades: z.array(
          z.object({
            question_id: z.string().refine((qid) => idSet.has(qid), "unknown question"),
            correct: z.boolean(),
            partial: z.number().min(0).max(1),
            feedback: z.string().max(400),
          })
        ),
      });
      const out = await aiObject({
        userId: user.id,
        userEmail: user.email ?? null,
        kind: "short_answer_grading",
        schema: gradeSchema,
        system: `You grade short-answer quiz responses. For each item: correct=true when the response demonstrates the expected understanding even in different words; partial is credit 0..1 (correct answers get 1, partially right reasoning 0.3-0.7, wrong 0); feedback is one sentence telling the student what was right or missing.`,
        prompt: shortOnes
          .map(
            (s) => `question_id: ${s.question_id}
QUESTION: ${s.prompt}
EXPECTED: ${s.expected}
STUDENT: ${s.response}`
          )
          .join("\n\n"),
      });
      for (const g of out.grades) {
        graded.set(g.question_id, { correct: g.correct, partial: g.correct ? 1 : g.partial, feedback: g.feedback });
      }
      // model skipped one? mark ungraded conservatively
      for (const s of shortOnes) {
        if (!graded.has(s.question_id)) graded.set(s.question_id, { correct: false, partial: 0, feedback: "Could not grade this answer." });
      }
    }

    const credits = questions.map((q) => graded.get(q.id)?.partial ?? 0);
    const score = credits.reduce((a, b) => a + b, 0) / questions.length;

    const { data: attempt, error: aErr } = await supabase
      .from("quiz_attempts")
      .insert({ user_id: user.id, quiz_id: id, completed_at: new Date().toISOString(), score })
      .select("id")
      .single();
    if (aErr || !attempt) return NextResponse.json({ error: aErr?.message ?? "attempt insert failed" }, { status: 500 });

    await supabase.from("attempt_answers").insert(
      answers
        .filter((a) => byId.has(a.question_id))
        .map((a) => {
          const g = graded.get(a.question_id)!;
          return {
            user_id: user.id,
            attempt_id: attempt.id,
            question_id: a.question_id,
            response: a.response,
            correct: g.correct,
            partial: g.partial,
            time_ms: Math.max(0, Number(a.time_ms) || 0),
            feedback: g.feedback,
          };
        })
    );

    // SRS: every topic on the quiz gets a review with this attempt's accuracy
    const topicIds = (quizTopics ?? []).map((t) => t.topic_id);
    if (topicIds.length) {
      const { data: states } = await supabase.from("review_state").select("*").in("topic_id", topicIds);
      const stateOf = new Map((states ?? []).map((s) => [s.topic_id, s]));
      const upserts = topicIds.map((tid) => {
        const prev = stateOf.get(tid) ?? { interval_days: 1, ease: 2.5, lapses: 0, due_at: new Date().toISOString() };
        const next = applyReview(prev, score);
        return {
          topic_id: tid,
          user_id: user.id,
          ...next,
          priority: Math.round((1 - score) * 100) / 100,
        };
      });
      await supabase.from("review_state").upsert(upserts);
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      score,
      results: questions
        .map((q) => ({
          question_id: q.id,
          correct: graded.get(q.id)?.correct ?? false,
          partial: graded.get(q.id)?.partial ?? 0,
          feedback: graded.get(q.id)?.feedback ?? "",
          answer: q.answer,
          explanation: q.explanation,
        })),
    });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "grading failed" }, { status: 500 });
  }
}
