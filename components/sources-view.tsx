"use client";
//**
// components/sources-view.tsx
// Sources screen: AI suggestion banner, source rows with 36px kind badges and
// topic pills, New source modal (book / PDF upload / YouTube / web)
//**
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export interface SourceRow {
  id: string;
  name: string;
  kind: "book" | "pdf" | "yt" | "web";
  sub: string;
  pills: string[];
  time: string;
}

const KIND_LABEL: Record<SourceRow["kind"], string> = { book: "BOOK", pdf: "PDF", yt: "YT", web: "WEB" };
const MAX_PDF_BYTES = 100 * 1024 * 1024; // matches the bucket's file_size_limit

export function SourcesView(props: {
  rows: SourceRow[];
  banner: { id: string; html: { pre: string; bold1: string; mid: string; bold2: string; post: string }; accept: string } | null;
}) {
  const router = useRouter();
  const [banner, setBanner] = useState(props.banner);
  const [modalOpen, setModalOpen] = useState(false);
  const [kind, setKind] = useState<SourceRow["kind"]>("book");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const openModal = (k: SourceRow["kind"]) => {
    setKind(k);
    setName("");
    setUrl("");
    setFile(null);
    setError("");
    setModalOpen(true);
  };

  const resolveBanner = async (action: "accept" | "reject") => {
    if (!banner) return;
    const id = banner.id;
    setBanner(null);
    await fetch(`/api/suggestions/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  };

  const create = async () => {
    const trimmed = name.trim() || file?.name.replace(/\.pdf$/i, "") || "";
    if (!trimmed) {
      setError("Give the source a name.");
      return;
    }
    if (kind === "pdf" && !file) {
      setError("Pick a PDF to upload.");
      return;
    }
    if (kind === "pdf" && file && file.size > MAX_PDF_BYTES) {
      setError("That PDF is over the 100 MB limit.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, kind, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");

      if (kind === "pdf" && file) {
        const supabase = supabaseBrowser();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("session expired");
        const path = `${user.id}/${data.source.id}.pdf`;
        const { error: upErr } = await supabase.storage.from("sources").upload(path, file, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (upErr) throw new Error(upErr.message);
        const ing = await fetch("/api/sources/ingest-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: data.source.id, file_path: path }),
        });
        const ingData = await ing.json();
        if (!ing.ok) throw new Error(ingData.error ?? "ingest failed");
      }
      setModalOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
      router.refresh(); // the source row may exist in an error state
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <>
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 8, padding: "0 20px", borderBottom: "1px solid var(--bd2)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Sources</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => openModal("pdf")}
          className="hv-sf3"
          style={{ height: 30, padding: "0 12px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12.5, fontWeight: 550, cursor: "pointer" }}
        >
          Upload PDF
        </button>
        <button
          onClick={() => openModal("book")}
          className="hv-op"
          style={{ height: 30, padding: "0 13px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          New source
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
          {banner && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid color-mix(in srgb, var(--nl-accent) 16%, var(--sf))", background: "color-mix(in srgb, var(--nl-accent) 4%, var(--sf))", borderRadius: 11, padding: "13px 16px", marginBottom: 28 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".08em", color: "var(--nl-accent)", marginBottom: 4 }}>
                  AI SUGGESTION
                </div>
                <div style={{ fontSize: 13.5, color: "var(--tx2)", lineHeight: 1.5 }}>
                  {banner.html.pre}
                  <b>{banner.html.bold1}</b>
                  {banner.html.mid}
                  <b>{banner.html.bold2}</b>
                  {banner.html.post}
                </div>
              </div>
              <button
                onClick={() => resolveBanner("reject")}
                className="hv-sf3"
                style={{ flex: "none", height: 29, padding: "0 11px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
              >
                Reject
              </button>
              <button
                onClick={() => resolveBanner("accept")}
                className="hv-op"
                style={{ flex: "none", height: 29, padding: "0 13px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                {banner.accept}
              </button>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 6px 10px" }}>
            ALL SOURCES · {props.rows.length}
          </div>
          {props.rows.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "12px 6px" }}>
              Nothing yet. Add a book, PDF, or YouTube video and plans can schedule readings from it.
            </div>
          )}
          {props.rows.map((src) => (
            <div
              key={src.id}
              className="hv-sf2"
              style={{ display: "flex", alignItems: "center", gap: 13, padding: "13px 10px", borderRadius: 9, cursor: "pointer", borderBottom: "1px solid var(--bd2)" }}
            >
              <span
                style={{
                  flex: "none",
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--nl-accent) 8%, var(--sf))",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  color: "color-mix(in srgb, var(--nl-accent) 88%, var(--mixTx))",
                }}
              >
                {KIND_LABEL[src.kind]}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{src.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--tx4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {src.sub}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                {(src.pills.length ? src.pills : ["No topic"]).map((p) => (
                  <span
                    key={p}
                    style={{
                      height: 22,
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "0 10px",
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 520,
                      border: src.pills.length ? "1px solid var(--bd)" : "1px dashed var(--bd)",
                      color: src.pills.length ? "var(--tx3)" : "var(--tx4)",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
              <span style={{ flex: "none", width: 36, textAlign: "right", fontSize: 12, color: "var(--tx4)" }}>{src.time}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  remove(src.id);
                }}
                title="Delete source"
                className="hv-tx"
                style={{ flex: "none", fontSize: 12, color: "var(--tx4)", cursor: "pointer", padding: "0 2px" }}
              >
                ✕
              </span>
            </div>
          ))}
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={() => !busy && setModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 430, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 24, animation: "nl-pop .18s ease" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 16, fontWeight: 650 }}>New source</span>
              <span onClick={() => !busy && setModalOpen(false)} className="hv-tx" style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}>
                ✕
              </span>
            </div>
            <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 8, padding: 2, marginBottom: 16 }}>
              {(
                [
                  ["book", "Book"],
                  ["pdf", "PDF"],
                  ["yt", "YouTube"],
                  ["web", "Web"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1,
                    height: 26,
                    border: "none",
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 550,
                    cursor: "pointer",
                    background: kind === k ? "var(--segOn)" : "transparent",
                    color: kind === k ? "var(--tx)" : "var(--tx3)",
                    boxShadow: kind === k ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              autoFocus
              placeholder={kind === "book" ? "Introduction to Algorithms…" : "Name…"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 12 }}
            />
            {(kind === "yt" || kind === "web") && (
              <input
                placeholder={kind === "yt" ? "https://youtube.com/watch?v=…" : "https://…"}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 12 }}
              />
            )}
            {kind === "pdf" && (
              <>
                <div
                  data-dz
                  onClick={() => fileInput.current?.click()}
                  className="hv-dz"
                  style={{ border: "1.5px dashed var(--bd)", borderRadius: 12, height: 120, display: "grid", placeItems: "center", cursor: "pointer", marginBottom: 12 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f && f.type === "application/pdf") setFile(f);
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 550 }}>
                      {file ? file.name : "Drop a PDF here, or click to browse"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--tx4)" }}>Up to 100 MB. Text is extracted and indexed.</div>
                  </div>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </>
            )}
            {kind === "book" && (
              <div style={{ fontSize: 12, color: "var(--tx4)", marginBottom: 12 }}>
                No file needed. The AI checks whether it knows the work and suggests its chapter list for your plans.
              </div>
            )}
            {kind === "yt" && (
              <div style={{ fontSize: 12, color: "var(--tx4)", marginBottom: 12 }}>
                The transcript is fetched and indexed automatically.
              </div>
            )}
            {error && <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--bd2)", paddingTop: 16 }}>
              <button
                onClick={create}
                disabled={busy}
                className="hv-op"
                style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? (
                  <>
                    <span className="nl-spin" />
                    {kind === "pdf" ? "Uploading…" : "Adding…"}
                  </>
                ) : (
                  "Add source"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
