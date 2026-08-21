//**
// app/api/sources/route.ts
// POST creates a source. YouTube links are transcribed, chunked, and embedded
// inline; declared books run the identify flow and land in the suggestions inbox
//**
import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { identifySourceSchema } from "@/lib/ai/schemas";
import { resolveModel } from "@/lib/ai/provider";
import { embedTexts } from "@/lib/ai/embeddings";
import { chunkText } from "@/lib/chunk";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";

// YouTube transcript fetch + embedding, or book identification, run inline here.
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await enforceRate(request, user.id, "upload");
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const kind = ["book", "pdf", "yt", "web"].includes(body.kind) ? body.kind : null;
    const url = String(body.url ?? "").trim();
    if (!name || !kind) return NextResponse.json({ error: "name and kind required" }, { status: 400 });
    if ((kind === "yt" || kind === "web") && !/^https?:\/\//.test(url)) {
      return NextResponse.json({ error: "a valid URL is required" }, { status: 400 });
    }

    const { data: source, error: sErr } = await supabase
      .from("sources")
      .insert({
        user_id: user.id,
        name,
        kind,
        url,
        ingest_status: kind === "yt" ? "processing" : kind === "pdf" ? "pending" : "none",
      })
      .select("id, name, kind")
      .single();
    if (sErr || !source) return NextResponse.json({ error: sErr?.message ?? "insert failed" }, { status: 500 });

    if (kind === "yt") {
      try {
        const segments = await YoutubeTranscript.fetchTranscript(url);
        const text = segments.map((s) => s.text).join(" ");
        const chunks = chunkText(text);
        const resolved = await resolveModel(user.id);
        const vectors = await embedTexts({
          userId: user.id,
          apiKey: resolved.embeddingApiKey,
          byok: resolved.byok,
          texts: chunks,
        });
        if (chunks.length) {
          await supabase.from("source_chunks").insert(
            chunks.map((content, i) => ({
              user_id: user.id,
              source_id: source.id,
              ordinal: i,
              content,
              embedding: JSON.stringify(vectors[i]),
            }))
          );
        }
        await supabase
          .from("sources")
          .update({ ingest_status: "ready", meta: { transcript_chars: text.length, chunk_count: chunks.length } })
          .eq("id", source.id);
      } catch (e) {
        await supabase
          .from("sources")
          .update({ ingest_status: "error", ingest_error: e instanceof Error ? e.message : "transcript unavailable" })
          .eq("id", source.id);
      }
    }

    if (kind === "book") {
      // identify the work from its declared name; result goes to the inbox as a
      // reversible suggestion (PLAN decision 8), confidence shown to the user
      try {
        const out = await aiObject({
          userId: user.id,
          userEmail: user.email ?? null,
          kind: "identify_source",
          schema: identifySourceSchema,
          system: `A student declared a study source by name only. Decide whether you recognize the actual published work. If recognized, give its canonical title, authors, and its real table of contents as sections (label = chapter number or code, title = chapter title). Confidence below 0.5 means recognized=false.`,
          prompt: `Declared source name: ${name}`,
        });
        if (out.recognized && out.confidence >= 0.5) {
          await supabase.from("suggestions").insert({
            user_id: user.id,
            kind: "identify_source",
            confidence: out.confidence,
            rationale: `Recognized as ${out.identified_title}${out.authors ? ` by ${out.authors}` : ""} (${Math.round(out.confidence * 100)}% sure).`,
            payload: {
              source_id: source.id,
              identified_title: out.identified_title,
              authors: out.authors,
              edition_guess: out.edition_guess,
              sections: out.sections,
            },
          });
        }
      } catch {
        // identification is optional; the source exists either way
      }
    }

    return NextResponse.json({ source });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "source create failed" }, { status: 500 });
  }
}
