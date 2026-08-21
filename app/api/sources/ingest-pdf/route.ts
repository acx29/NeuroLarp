//**
// app/api/sources/ingest-pdf/route.ts
// After the browser uploads a PDF to storage, this extracts text with unpdf,
// chunks it, embeds the chunks, and marks the source ready
//**
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveModel } from "@/lib/ai/provider";
import { embedTexts } from "@/lib/ai/embeddings";
import { chunkText } from "@/lib/chunk";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sourceId = String(body.source_id ?? "");
  const filePath = String(body.file_path ?? "");
  if (!sourceId || !filePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "source_id and an owned file_path required" }, { status: 400 });
  }

  try {
    await enforceRate(request, user.id, "upload");
    await supabase.from("sources").update({ ingest_status: "processing", file_path: filePath }).eq("id", sourceId);

    const { data: file, error: dlErr } = await supabase.storage.from("sources").download(filePath);
    if (dlErr || !file) throw new Error(dlErr?.message ?? "download failed");
    const buf = new Uint8Array(await file.arrayBuffer());
    const { text, totalPages } = await extractText(buf, { mergePages: true });

    const chunks = chunkText(typeof text === "string" ? text : String(text));
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
          source_id: sourceId,
          ordinal: i,
          content,
          embedding: JSON.stringify(vectors[i]),
        }))
      );
    }
    await supabase
      .from("sources")
      .update({ ingest_status: "ready", meta: { pages: totalPages, chunk_count: chunks.length } })
      .eq("id", sourceId);
    return NextResponse.json({ ok: true, pages: totalPages, chunks: chunks.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingest failed";
    await supabase.from("sources").update({ ingest_status: "error", ingest_error: msg }).eq("id", sourceId);
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: msg, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
