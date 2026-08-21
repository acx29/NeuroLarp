//**
// app/api/quiz/generate/route.ts
// Quiz generation: notes define scope, model knowledge writes the questions,
// mix questions target the intersection of the parent topic and a linked topic
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { quizGenerationSchema } from "@/lib/ai/schemas";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";

// Question-set generation can run tens of seconds; raise the serverless timeout.
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await enforceRate(request, user.id, "ai_call");
    const body = await request.json();
    const topicId = String(body.topic_id ?? "");
    const mode = body.mode === "standard" ? "standard" : "dynamic";
    const count = Math.max(4, Math.min(20, Number(body.count) || 8));
    const focus: string[] = Array.isArray(body.focus) ? body.focus.map(String).slice(0, 6) : [];
    const requestedMix: string[] = Array.isArray(body.mix_topic_ids) ? body.mix_topic_ids.map(String) : [];

    const [{ data: topic }, { data: edges }, { data: allTopics }] = await Promise.all([
      supabase.from("topics").select("id, title, description").eq("id", topicId).single(),
      supabase.from("topic_edges").select("id, source_id, target_id, kind"),
      supabase.from("topics").select("id, title"),
    ]);
    if (!topic) return NextResponse.json({ error: "topic not found" }, { status: 404 });

    // mix partners must actually be linked to the parent topic
    const titleOf = new Map((allTopics ?? []).map((t) => [t.id, t.title]));
    const linkedEdge = new Map<string, string>(); // partner topic id -> edge id
    for (const e of edges ?? []) {
      if (e.source_id === topicId) linkedEdge.set(e.target_id, e.id);
      if (e.target_id === topicId) linkedEdge.set(e.source_id, e.id);
    }
    const mixIds = requestedMix.filter((id) => linkedEdge.has(id));
    const isMix = mixIds.length > 0;

    // scope: the user's notes on the parent + mix topics
    const { data: notes } = await supabase
      .from("notes")
      .select("title, content_text, topic_id")
      .in("topic_id", [topicId, ...mixIds])
      .order("updated_at", { ascending: false })
      .limit(30);
    let budget = 8000;
    const scope = (notes ?? [])
      .map((n) => {
        const t = titleOf.get(n.topic_id ?? "") ?? "";
        const chunk = `[${t}] ${n.title}\n${n.content_text}`.slice(0, Math.max(0, budget));
        budget -= chunk.length;
        return chunk;
      })
      .filter((c) => c.length > 0)
      .join("\n---\n");

    // dynamic mode context: what the user recently got wrong on this topic
    let missContext = "";
    if (mode === "dynamic") {
      const { data: misses } = await supabase
        .from("attempt_answers")
        .select("correct, created_at, quiz_questions(prompt, topic_id)")
        .eq("correct", false)
        .order("created_at", { ascending: false })
        .limit(20);
      const relevant = (misses ?? [])
        .filter((m) => m.quiz_questions?.topic_id === topicId)
        .map((m) => m.quiz_questions?.prompt ?? "")
        .filter(Boolean)
        .slice(0, 8);
      if (relevant.length) missContext = `\nRECENTLY MISSED QUESTIONS (probe these areas again from new angles):\n${relevant.map((p) => `- ${p}`).join("\n")}`;
    }

    const mixList = mixIds.map((id, i) => `${i}: ${titleOf.get(id)}`).join("\n");
    const out = await aiObject({
      userId: user.id,
      userEmail: user.email ?? null,
      kind: "quiz_generation",
      schema: quizGenerationSchema,
      system: `You write exam-quality quiz questions for a student. Use your own knowledge of the subject to write substantive questions; the student's notes below only define the SCOPE of what they are studying, not the limit of question content.
Rules:
- Exactly ${count} questions, mixing formats: mcq (4 options, exactly one correct, answer text must equal one option verbatim), short (one to three sentence free answer), cloze (prompt contains ____ marking the blank, answer is the blank's text).
- Difficulty 1-5, varied.
${isMix ? `- This is a MIX quiz. At least half the questions must target the INTERSECTION of "${topic.title}" and one paired topic (how the two interact, where one applies inside the other). Set pair_index to that topic's index from the pair list. Parent-only questions use pair_index null.` : "- All questions target the single topic. pair_index is always null."}
${focus.length ? `- Prioritize these weak areas: ${focus.join("; ")}.` : ""}
- Explanations teach in two sentences or fewer.
- Title the quiz in six words or fewer.`,
      prompt: `TOPIC: ${topic.title}${topic.description ? ` (${topic.description})` : ""}
${isMix ? `PAIRED TOPICS (index: title):\n${mixList}` : ""}
STUDENT'S NOTES (scope):
${scope || "(no notes yet; use standard curriculum for the topic)"}
${missContext}`,
    });

    // server-side validation beyond the schema: mcq answers must be an option
    const questions = out.questions
      .filter((q) => q.format !== "mcq" || (q.options.length >= 3 && q.options.includes(q.answer)))
      .filter((q) => q.format !== "cloze" || q.prompt.includes("____"))
      .slice(0, count);
    if (questions.length === 0) return NextResponse.json({ error: "generation produced no valid questions" }, { status: 502 });

    const { data: quiz, error: qErr } = await supabase
      .from("quizzes")
      .insert({
        user_id: user.id,
        topic_id: topicId,
        mode,
        is_mix: isMix,
        title: out.title || `${topic.title} ${mode}`,
        config: { count, focus, mix_topic_ids: mixIds },
      })
      .select("id")
      .single();
    if (qErr || !quiz) return NextResponse.json({ error: qErr?.message ?? "quiz insert failed" }, { status: 500 });

    await supabase.from("quiz_topics").insert(
      [topicId, ...mixIds].map((tid) => ({ quiz_id: quiz.id, topic_id: tid, user_id: user.id }))
    );
    const { error: insErr } = await supabase.from("quiz_questions").insert(
      questions.map((q, i) => ({
        user_id: user.id,
        quiz_id: quiz.id,
        ordinal: i,
        format: q.format,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        topic_id: topicId,
        edge_id:
          q.pair_index !== null && q.pair_index < mixIds.length
            ? linkedEdge.get(mixIds[q.pair_index]) ?? null
            : null,
      }))
    );
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ quiz_id: quiz.id, question_count: questions.length });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "generation failed" }, { status: 500 });
  }
}
