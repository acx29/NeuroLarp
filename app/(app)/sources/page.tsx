//**
// app/(app)/sources/page.tsx
// Sources data: all sources with topic pills, kind-specific sub lines, and the
// latest pending source suggestion (identify_source or assign_source)
//**
import { supabaseServer } from "@/lib/supabase/server";
import { SourcesView, type SourceRow } from "@/components/sources-view";
import { relTime } from "@/lib/utils";

export default async function SourcesPage() {
  const supabase = await supabaseServer();
  const [{ data: sources }, { data: sourceTopics }, { data: topics }, { data: suggestions }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, name, kind, url, meta, ingest_status, ingest_error, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("source_topics").select("source_id, topic_id"),
    supabase.from("topics").select("id, title"),
    supabase
      .from("suggestions")
      .select("id, kind, payload, rationale")
      .eq("status", "pending")
      .in("kind", ["identify_source", "assign_source"])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const topicTitle = new Map((topics ?? []).map((t) => [t.id, t.title]));
  const pills = new Map<string, string[]>();
  for (const st of sourceTopics ?? []) {
    const t = topicTitle.get(st.topic_id);
    if (!t) continue;
    (pills.get(st.source_id) ?? pills.set(st.source_id, []).get(st.source_id)!).push(t);
  }

  const rows: SourceRow[] = (sources ?? []).map((s) => {
    const meta = (s.meta ?? {}) as { pages?: number; authors?: string; canonical_title?: string; transcript_chars?: number };
    let sub = "";
    if (s.kind === "pdf") {
      sub =
        s.ingest_status === "ready"
          ? `PDF · ${meta.pages ?? "?"} pages`
          : s.ingest_status === "error"
            ? `PDF · ingest failed`
            : `PDF · processing`;
    } else if (s.kind === "yt") {
      sub =
        s.ingest_status === "ready"
          ? "YouTube · transcribed automatically"
          : s.ingest_status === "error"
            ? "YouTube · transcript unavailable"
            : "YouTube · transcribing";
    } else if (s.kind === "book") {
      sub = meta.canonical_title ? `Book · ${meta.authors || meta.canonical_title}` : "Book · declared by name";
    } else {
      sub = "Article · saved from URL";
    }
    return {
      id: s.id,
      name: s.name,
      kind: s.kind as SourceRow["kind"],
      sub,
      pills: pills.get(s.id) ?? [],
      time: relTime(s.created_at),
    };
  });

  const sug = (suggestions ?? [])[0] ?? null;
  let banner: { id: string; html: { pre: string; bold1: string; mid: string; bold2: string; post: string }; accept: string } | null = null;
  if (sug) {
    const p = sug.payload as { source_id?: string; identified_title?: string; topic_id?: string };
    const srcName = (sources ?? []).find((s) => s.id === p.source_id)?.name ?? "this source";
    if (sug.kind === "identify_source") {
      banner = {
        id: sug.id,
        html: {
          pre: "Recognized ",
          bold1: srcName,
          mid: " as ",
          bold2: p.identified_title ?? "a known work",
          post: ". Confirm to add its chapters.",
        },
        accept: "Confirm",
      };
    } else {
      banner = {
        id: sug.id,
        html: {
          pre: "Assign ",
          bold1: srcName,
          mid: " to ",
          bold2: topicTitle.get(p.topic_id ?? "") ?? "a topic",
          post: `. ${sug.rationale}`,
        },
        accept: "Assign",
      };
    }
  }

  return <SourcesView rows={rows} banner={banner} />;
}
