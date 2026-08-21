"use client";
//**
// components/note-editor.tsx
// Home: Tiptap editor with autosave, debounced AI analysis, photo
// upload -> transcription review -> insert (ephemeral, decision 15), and the
// suggested-connection toast wired to the suggestions inbox
//**
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { relTime, topicColor } from "@/lib/utils";

interface Topic {
  id: string;
  title: string;
  color_hue: number;
}
interface NoteRow {
  id: string;
  title: string;
  content: unknown;
  topic_id: string | null;
  updated_at: string;
  provenance: unknown;
}
interface Suggestion {
  id: string;
  kind: string;
  payload: Record<string, string | null>;
  rationale: string;
}

const ANALYZE_DEBOUNCE_MS = 60_000; // PLAN decision 4
const SAVE_DEBOUNCE_MS = 800;

export function NoteEditor(props: { initialNote: NoteRow | null; topics: Topic[] }) {
  const router = useRouter();
  const [noteId, setNoteId] = useState<string | null>(props.initialNote?.id ?? null);
  const [title, setTitle] = useState(props.initialNote?.title ?? "");
  const [topicId, setTopicId] = useState<string | null>(props.initialNote?.topic_id ?? null);
  const [editedAt, setEditedAt] = useState<string | null>(props.initialNote?.updated_at ?? null);
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);
  const [toast, setToast] = useState<Suggestion | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // the error notice clears itself; it is informational only
  useEffect(() => {
    if (!analyzeError) return;
    const t = setTimeout(() => setAnalyzeError(null), 6000);
    return () => clearTimeout(t);
  }, [analyzeError]);
  const [upload, setUpload] = useState<
    | { stage: "closed" }
    | { stage: "pick"; busy: boolean; error: string }
    | { stage: "review"; pages: Array<{ text: string }>; suggestedTitle: string; count: number }
  >({ stage: "closed" });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(noteId);
  noteIdRef.current = noteId;
  const titleRef = useRef(title);
  titleRef.current = title;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Type to continue, or drop photos of handwritten notes…" }),
    ],
    content: (props.initialNote?.content as object) ?? undefined,
    immediatelyRender: false,
    editorProps: { attributes: { class: "tiptap" } },
    onUpdate: () => scheduleSave(),
  });

  const runAnalyze = useCallback(async (manual = false) => {
    const id = noteIdRef.current;
    if (!id) return;
    if (manual) setAnalyzing(true);
    try {
      const res = await fetch("/api/ai/analyze-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        // background runs stay silent; the manual button reports what happened
        if (manual) setAnalyzeError(String(data.error ?? "analysis failed"));
        return;
      }
      const suggestions = (data.suggestions ?? []) as Suggestion[];
      const s = suggestions.find((x) => x.kind === "new_edge") ?? suggestions[0];
      if (s) setToast(s);
      else if (manual) setAnalyzeError("No new suggestions for this note right now.");
    } catch {
      if (manual) setAnalyzeError("analysis failed");
    } finally {
      if (manual) setAnalyzing(false);
    }
  }, []);

  const doSave = useCallback(async () => {
    setSaveState("saving");
    const content = editor?.getJSON();
    try {
      if (!noteIdRef.current) {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: titleRef.current || "Untitled", content }),
        });
        const data = await res.json();
        if (data.note) setNoteId(data.note.id);
      } else {
        await fetch(`/api/notes/${noteIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: titleRef.current || "Untitled", content }),
        });
      }
      setEditedAt(new Date().toISOString());
      setSaveState("saved");
      if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
      analyzeTimer.current = setTimeout(runAnalyze, ANALYZE_DEBOUNCE_MS);
    } catch {
      setSaveState("saved"); // retried on next edit
    }
  }, [editor, runAnalyze]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, SAVE_DEBOUNCE_MS);
  }, [doSave]);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (analyzeTimer.current) clearTimeout(analyzeTimer.current);
    },
    []
  );

  const assignTopic = async (t: string | null) => {
    setTopicId(t);
    setTopicPickerOpen(false);
    if (noteIdRef.current) {
      await fetch(`/api/notes/${noteIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: t }),
      });
      router.refresh();
    }
  };

  const resolveToast = async (action: "accept" | "reject") => {
    if (!toast) return;
    setToast(null);
    await fetch(`/api/suggestions/${toast.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  };

  // ---- photo upload (ephemeral pipeline) ----
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function downscale(file: File): Promise<Blob | null> {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      // canvas re-encode: EXIF/GPS never leaves the browser (decision 15/16)
      return await new Promise((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.85));
    } catch {
      return null;
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 10);
    if (list.length === 0) return;
    setUpload({ stage: "pick", busy: true, error: "" });
    const blobs: Blob[] = [];
    for (const f of list) {
      const b = await downscale(f);
      if (b) blobs.push(b);
    }
    if (blobs.length === 0) {
      setUpload({ stage: "pick", busy: false, error: "Couldn't read those images. Try PNG or JPG." });
      return;
    }
    const form = new FormData();
    blobs.forEach((b, i) => form.append("images", new File([b], `photo-${i}.jpg`, { type: "image/jpeg" })));
    try {
      const res = await fetch("/api/ingest/photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "transcription failed");
      setUpload({ stage: "review", pages: data.pages, suggestedTitle: data.suggested_title, count: data.count });
    } catch (e) {
      setUpload({ stage: "pick", busy: false, error: e instanceof Error ? e.message : "upload failed" });
    }
  };

  const addTranscription = () => {
    if (upload.stage !== "review" || !editor) return;
    const paragraphs = upload.pages
      .flatMap((p) => p.text.split(/\n{2,}/))
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] }));
    editor.chain().focus("end").insertContent(paragraphs).run();
    if (!titleRef.current && upload.suggestedTitle) setTitle(upload.suggestedTitle);
    setUpload({ stage: "closed" });
    scheduleSave();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUpload({ stage: "closed" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const topic = props.topics.find((t) => t.id === topicId) ?? null;
  const toastPills = (): [string, string] | null => {
    if (!toast) return null;
    const name = (id: string | null) => props.topics.find((t) => t.id === id)?.title ?? "?";
    if (toast.kind === "new_edge") return [name(toast.payload.source_topic_id), name(toast.payload.target_topic_id)];
    if (toast.kind === "assign_note") return ["This note", name(toast.payload.topic_id)];
    if (toast.kind === "new_topic") return ["New topic", toast.payload.title ?? "?"];
    return null;
  };
  const pills = toastPills();

  return (
    <>
      <div
        style={{
          height: 52,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 20px",
          borderBottom: "1px solid var(--bd2)",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--tx4)" }}>Home</span>
        <span style={{ fontSize: 12, color: "var(--bd)" }}>›</span>
        <span style={{ fontSize: 13, fontWeight: 550 }}>{title || "Untitled"}</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--tx3)" }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: saveState === "saved" ? "#10B981" : "var(--tx4)",
            }}
          />
          {saveState === "saved" ? "Saved" : "Saving…"}
        </div>
        <button
          onClick={() => runAnalyze(true)}
          disabled={analyzing}
          className="hv-sf3"
          title="Scan this note for topic and connection suggestions now"
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            background: "var(--sf)",
            border: "1px solid var(--bd)",
            color: "var(--tx2)",
            fontSize: 12.5,
            fontWeight: 550,
            cursor: "pointer",
            opacity: analyzing ? 0.7 : 1,
          }}
        >
          {analyzing ? (
            <>
              <span className="nl-spin" />
              Analyzing…
            </>
          ) : (
            "Analyze"
          )}
        </button>
        <button
          onClick={() => setUpload({ stage: "pick", busy: false, error: "" })}
          className="hv-sf3"
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: 7,
            background: "var(--sf)",
            border: "1px solid var(--bd)",
            color: "var(--tx2)",
            fontSize: 12.5,
            fontWeight: 550,
            cursor: "pointer",
          }}
        >
          Upload files
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 32px 140px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, position: "relative" }}>
            <span
              onClick={() => setTopicPickerOpen(!topicPickerOpen)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                height: 24,
                padding: "0 11px",
                border: topic ? "1px solid var(--bd)" : "1px dashed var(--bd)",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 520,
                color: topic ? "var(--tx3)" : "var(--tx4)",
                whiteSpace: "nowrap",
                flex: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: topic ? topicColor(topic.color_hue) : "var(--tx4)",
                }}
              />
              {topic ? topic.title : "No topic"}
            </span>
            {editedAt && (
              <span style={{ fontSize: 12, color: "var(--tx4)" }}>
                {relTime(editedAt) === "now" ? "Edited just now" : `Edited ${relTime(editedAt)} ago`}
              </span>
            )}
            {topicPickerOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 30,
                  left: 0,
                  width: 220,
                  background: "var(--sf)",
                  border: "1px solid var(--bd)",
                  borderRadius: 10,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                  padding: 6,
                  zIndex: 30,
                  animation: "nl-pop .15s ease",
                }}
              >
                {props.topics.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => assignTopic(t.id)}
                    className="hv-sf2"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 9px",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 520,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: topicColor(t.color_hue) }} />
                    {t.title}
                  </div>
                ))}
                <div
                  onClick={() => assignTopic(null)}
                  className="hv-sf2"
                  style={{ padding: "7px 9px", borderRadius: 7, fontSize: 13, color: "var(--tx4)", cursor: "pointer" }}
                >
                  No topic
                </div>
              </div>
            )}
          </div>

          <input
            value={title}
            placeholder="Untitled"
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave();
            }}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              margin: "0 0 22px",
              fontSize: 40,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
              color: "var(--tx)",
              padding: 0,
            }}
          />
          <div className="nl-editor">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {analyzeError && !toast && (
        <div
          style={{
            position: "absolute",
            right: 22,
            bottom: 22,
            maxWidth: 340,
            background: "var(--sf)",
            border: "1px solid var(--bd)",
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
            padding: "10px 14px",
            fontSize: 12.5,
            color: "var(--tx3)",
            animation: "nl-pop .18s ease",
            zIndex: 30,
          }}
        >
          {analyzeError}
        </div>
      )}

      {pills && toast && (
        <div
          style={{
            position: "absolute",
            right: 22,
            bottom: 22,
            width: 340,
            background: "var(--sf)",
            border: "1px solid var(--bd)",
            borderRadius: 12,
            boxShadow: "0 12px 36px rgba(0,0,0,.12)",
            padding: 16,
            zIndex: 20,
            animation: "nl-pop .2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".08em", color: "var(--nl-accent)" }}>
              {toast.kind === "new_edge" ? "SUGGESTED CONNECTION" : "AI SUGGESTION"}
            </span>
            <span
              onClick={() => resolveToast("reject")}
              className="hv-tx"
              style={{ fontSize: 14, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}
            >
              ✕
            </span>
          </div>
          {/* pills shrink with ellipsis so long topic titles never escape the card;
              the full name shows on hover via title */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span
              title={pills[0]}
              style={{
                flex: "0 1 auto",
                minWidth: 0,
                height: 26,
                lineHeight: "24px",
                padding: "0 10px",
                border: "1px solid var(--bd)",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 550,
                color: "var(--tx2)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pills[0]}
            </span>
            <span style={{ flex: "1 0 14px", borderTop: "1.5px dashed var(--nl-accent)", minWidth: 14 }} />
            <span
              title={pills[1]}
              style={{
                flex: "0 1 auto",
                minWidth: 0,
                height: 26,
                lineHeight: "24px",
                padding: "0 10px",
                border: "1px solid var(--nl-accent)",
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 550,
                color: "var(--tx)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {pills[1]}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--tx3)", marginBottom: 14 }}>{toast.rationale}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => resolveToast("reject")}
              className="hv-sf3"
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 7,
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                color: "var(--tx2)",
                fontSize: 12.5,
                fontWeight: 550,
                cursor: "pointer",
              }}
            >
              Reject
            </button>
            <button
              onClick={() => resolveToast("accept")}
              className="hv-op"
              style={{
                height: 30,
                padding: "0 14px",
                borderRadius: 7,
                background: "var(--nl-accent)",
                border: "none",
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flex: "none",
              }}
            >
              {toast.kind === "new_edge" ? "Accept link" : "Accept"}
            </button>
          </div>
        </div>
      )}

      {upload.stage !== "closed" && (
        <div
          onClick={() => setUpload({ stage: "closed" })}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12,12,16,0.45)",
            display: "grid",
            placeItems: "center",
            zIndex: 60,
            animation: "nl-fade .15s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 430,
              background: "var(--sf)",
              borderRadius: 14,
              boxShadow: "0 24px 64px rgba(0,0,0,.28)",
              padding: 24,
              animation: "nl-pop .18s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 650 }}>
                {upload.stage === "review" ? "Review transcription" : "Upload notes"}
              </span>
              <span
                onClick={() => setUpload({ stage: "closed" })}
                className="hv-tx"
                style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}
              >
                ✕
              </span>
            </div>

            {upload.stage === "pick" && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleFiles(e.target.files)}
                />
                <div
                  data-dz
                  className="hv-dz"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleFiles(e.dataTransfer.files);
                  }}
                  style={{
                    border: "1.5px dashed var(--bd)",
                    borderRadius: 12,
                    height: 220,
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
                    <svg width="40" height="40" viewBox="0 0 40 40" style={{ animation: "nl-nudge 2.4s ease-in-out infinite" }}>
                      <path
                        d="M31 31 L11 11 M11 24 V11 H24"
                        style={{ fill: "none", stroke: "var(--tx)", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" }}
                      />
                    </svg>
                    <div style={{ fontSize: 14, fontWeight: 550 }}>
                      {upload.busy ? (
                        <>
                          <span className="nl-spin" />
                          Parsing handwriting…
                        </>
                      ) : (
                        "Drag photos here, or click to browse"
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--tx4)" }}>
                      PNG · JPG · HEIC · handwriting is parsed automatically
                    </div>
                  </div>
                </div>
                {upload.error && <div style={{ fontSize: 12.5, color: "#DC2626", marginTop: 10 }}>{upload.error}</div>}
                <div style={{ fontSize: 12, color: "var(--tx4)", marginTop: 12 }}>
                  Files attach to the open note unless you assign a topic. Photos are parsed, never stored.
                </div>
              </>
            )}

            {upload.stage === "review" && (
              <>
                <div style={{ fontSize: 12.5, color: "var(--tx3)", marginBottom: 12 }}>
                  {upload.count} image{upload.count === 1 ? "" : "s"} parsed. Check it against your photos, then add.
                </div>
                <div style={{ maxHeight: 320, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {upload.pages.map((p, i) => (
                    <textarea
                      key={i}
                      value={p.text}
                      onChange={(e) => {
                        const pages = [...upload.pages];
                        pages[i] = { text: e.target.value };
                        setUpload({ ...upload, pages });
                      }}
                      rows={Math.min(10, Math.max(3, p.text.split("\n").length))}
                      style={{
                        width: "100%",
                        border: "1px solid var(--bd)",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        outline: "none",
                        resize: "vertical",
                        background: "var(--sf)",
                        color: "var(--tx2)",
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                  <button
                    onClick={() => setUpload({ stage: "closed" })}
                    className="hv-sf3"
                    style={{
                      height: 32,
                      padding: "0 13px",
                      borderRadius: 7,
                      background: "var(--sf)",
                      border: "1px solid var(--bd)",
                      color: "var(--tx2)",
                      fontSize: 12.5,
                      fontWeight: 550,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addTranscription}
                    className="hv-op"
                    style={{
                      height: 32,
                      padding: "0 14px",
                      borderRadius: 7,
                      background: "var(--nl-accent)",
                      border: "none",
                      color: "#fff",
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Add to note
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
