//**
// app/api/ingest/photos/route.ts
// Ephemeral photo transcription: magic-byte check -> vision model -> text out, bytes discarded
//**
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { aiObject } from "@/lib/ai/run";
import { transcriptionSchema } from "@/lib/ai/schemas";
import { enforceRate, RateLimitError } from "@/lib/rate";
import { QuotaError } from "@/lib/ai/meter";

// Ephemeral photo pipeline (PLAN decision 15): bytes stay in memory, go to the
// vision model, and are discarded. Nothing reaches storage. Client already
// downscaled via canvas (which also stripped EXIF); limits per decision 16.
const MAX_IMAGES = 10;
const MAX_BYTES = 4 * 1024 * 1024; // per image, post-downscale; the hosting platform caps request bodies anyway

function isJpegOrPng(buf: Uint8Array): boolean {
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return jpeg || png; // magic bytes, not the claimed MIME type
}

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await enforceRate(request, user.id, "upload");
    await enforceRate(request, user.id, "ai_call");

    const form = await request.formData();
    const files = form.getAll("images").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "no images" }, { status: 400 });
    if (files.length > MAX_IMAGES)
      return NextResponse.json({ error: `max ${MAX_IMAGES} images per upload` }, { status: 400 });

    const images: Uint8Array[] = [];
    for (const f of files) {
      if (f.size > MAX_BYTES)
        return NextResponse.json({ error: `${f.name} exceeds 4MB after downscale` }, { status: 400 });
      const buf = new Uint8Array(await f.arrayBuffer());
      if (!isJpegOrPng(buf))
        return NextResponse.json({ error: `${f.name} is not a JPEG/PNG` }, { status: 400 });
      images.push(buf);
    }

    const out = await aiObject({
      userId: user.id,
      userEmail: user.email ?? null,
      kind: "photo_transcription",
      schema: transcriptionSchema,
      system:
        "Transcribe the handwriting in each image into clean plain text, one entry per image, in order. Preserve the writer's structure (headings, bullet lists as '- ' lines, formulas in plain notation). Mark an image legible=false only if genuinely unreadable. Suggest a short note title from the content.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Transcribe these ${images.length} photo(s) of handwritten notes.` },
            ...images.map((img) => ({ type: "image" as const, image: img })),
          ],
        },
      ],
    });

    // images go out of scope here — nothing persisted
    return NextResponse.json({ pages: out.pages, suggested_title: out.suggested_title, count: images.length });
  } catch (e) {
    if (e instanceof RateLimitError || e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 429 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "transcription failed" }, { status: 500 });
  }
}
