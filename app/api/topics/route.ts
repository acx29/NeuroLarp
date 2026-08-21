//**
// app/api/topics/route.ts
// POST /api/topics — create a topic with the next rotating hue
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { nextHue } from "@/lib/utils";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  const { data: existing } = await supabase.from("topics").select("color_hue");
  const { data, error } = await supabase
    .from("topics")
    .insert({
      user_id: user.id,
      title,
      description: String(body.description ?? ""),
      color_hue: nextHue((existing ?? []).map((t) => t.color_hue)),
    })
    .select("id, title, color_hue")
    .single();
  if (error) {
    const dup = error.message.includes("topics_user_title_uniq");
    return NextResponse.json(
      { error: dup ? "You already have a topic with that name" : error.message },
      { status: dup ? 409 : 400 }
    );
  }
  return NextResponse.json({ topic: data });
}
