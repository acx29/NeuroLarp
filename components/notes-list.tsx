"use client";
//**
// components/notes-list.tsx
// Notes screen: header + New note, eyebrow count, rows (title, snippet, topic pill, time)
//**
import { useRouter } from "next/navigation";
import { relTime, topicColor } from "@/lib/utils";

interface NoteRow {
  id: string;
  title: string;
  content_text: string;
  topic_id: string | null;
  updated_at: string;
  provenance: unknown;
}
interface Topic {
  id: string;
  title: string;
  color_hue: number;
}

export function NotesList(props: { notes: NoteRow[]; topics: Topic[]; q: string }) {
  const router = useRouter();

  const newNote = async () => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.note) router.push(`/home?note=${data.note.id}`);
  };

  const snippet = (n: NoteRow): string => {
    const prov = n.provenance as { origin?: string; image_count?: number } | null;
    if (prov?.origin === "photo" && prov.image_count) {
      return `${prov.image_count} image${prov.image_count === 1 ? "" : "s"} · handwriting parsed into text`;
    }
    const line = n.content_text.split("\n").find((l) => l.trim());
    return line?.trim() || "Empty note";
  };

  return (
    <>
      <div
        style={{
          height: 52,
          flex: "none",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderBottom: "1px solid var(--bd2)",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Notes</span>
        {props.q && (
          <span style={{ fontSize: 12.5, color: "var(--tx4)", marginLeft: 10 }}>
            search: “{props.q}”
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={newNote}
          className="hv-op"
          style={{
            height: 30,
            padding: "0 13px",
            borderRadius: 7,
            background: "var(--nl-accent)",
            border: "none",
            color: "#fff",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          New note
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 6px 10px" }}>
            ALL NOTES · {props.notes.length}
          </div>
          {props.notes.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "24px 6px" }}>
              Nothing here yet. Start typing on Home and it saves itself.
            </div>
          )}
          {props.notes.map((n) => {
            const topic = props.topics.find((t) => t.id === n.topic_id) ?? null;
            return (
              <div
                key={n.id}
                onClick={() => router.push(`/home?note=${n.id}`)}
                className="hv-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "13px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--bd2)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{n.title || "Untitled"}</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tx4)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {snippet(n)}
                  </div>
                </div>
                <span
                  style={{
                    flex: "none",
                    height: 22,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 10px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 520,
                    border: topic ? "1px solid var(--bd)" : "1px dashed var(--bd)",
                    color: topic ? "var(--tx3)" : "var(--tx4)",
                  }}
                >
                  {topic && (
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: topicColor(topic.color_hue) }} />
                  )}
                  {topic ? topic.title : "No topic"}
                </span>
                <span style={{ flex: "none", width: 52, textAlign: "right", fontSize: 12, color: "var(--tx4)" }}>
                  {relTime(n.updated_at)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
