//**
// app/api/quiz/[id]/route.ts
// GET quiz questions for the runner. Answers and explanations stay server-side
// until the attempt is graded.
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: quiz }, { data: questions }] = await Promise.all([
    supabase.from("quizzes").select("id, title, mode, is_mix, topic_id").eq("id", id).single(),
    supabase
      .from("quiz_questions")
      .select("id, ordinal, format, prompt, options")
      .eq("quiz_id", id)
      .order("ordinal"),
  ]);
  if (!quiz) return NextResponse.json({ error: "quiz not found" }, { status: 404 });
  return NextResponse.json({ quiz, questions: questions ?? [] });
}
