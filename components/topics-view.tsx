"use client";
//**
// components/topics-view.tsx
// Learning Topics screen: AI new-topic banner, hierarchy tree (indent per depth,
// carets on parents), inline new-topic composer
//**
import { useState } from "react";
import { useRouter } from "next/navigation";
import { noteCountLabel } from "@/lib/utils";

interface Topic {
  id: string;
  title: string;
  color_hue: number;
  created_at: string;
}
interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  kind: string;
}
interface Suggestion {
  id: string;
  kind: string;
  payload: Record<string, string | null>;
  rationale: string;
}

interface TreeRow {
  topic: Topic;
  depth: number;
  hasChildren: boolean;
}

function buildTree(topics: Topic[], edges: Edge[]): TreeRow[] {
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (e.kind !== "subtopic_of") continue;
    const list = children.get(e.target_id) ?? [];
    list.push(e.source_id);
    children.set(e.target_id, list);
    hasParent.add(e.source_id);
  }
  const byId = new Map(topics.map((t) => [t.id, t]));
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const visit = (id: string, depth: number) => {
    if (seen.has(id)) return; // multi-parent nodes render under their first parent
    const t = byId.get(id);
    if (!t) return;
    seen.add(id);
    const kids = (children.get(id) ?? []).sort(
      (a, b) => (byId.get(a)?.created_at ?? "").localeCompare(byId.get(b)?.created_at ?? "")
    );
    rows.push({ topic: t, depth, hasChildren: kids.length > 0 });
    kids.forEach((k) => visit(k, depth + 1));
  };
  topics.filter((t) => !hasParent.has(t.id)).forEach((t) => visit(t.id, 0));
  topics.forEach((t) => visit(t.id, 0)); // orphans in cycles can't exist; safety sweep
  return rows;
}

export function TopicsView(props: {
  topics: Topic[];
  edges: Edge[];
  noteCounts: Record<string, number>;
  suggestion: Suggestion | null;
}) {
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState(props.suggestion);

  const rows = buildTree(props.topics, props.edges);

  const createTopic = async () => {
    const title = name.trim();
    if (!title) return;
    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "failed");
      return;
    }
    setName("");
    setComposerOpen(false);
    setError("");
    router.refresh();
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

  return (
    <>
      <div
        style={{
          height: 52,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 20px",
          borderBottom: "1px solid var(--bd2)",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Learning Topics</span>
        <div style={{ flex: 1 }} />
        {composerOpen ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--sf)",
              border: "1px solid var(--bd)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
              padding: 5,
              animation: "nl-pop 0.2s ease",
            }}
          >
            <input
              autoFocus
              placeholder="Topic name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createTopic();
                if (e.key === "Escape") setComposerOpen(false);
              }}
              style={{
                width: 170,
                height: 28,
                border: "none",
                outline: "none",
                padding: "0 8px",
                fontSize: 13,
                background: "transparent",
                color: "var(--tx)",
              }}
            />
            <div
              onClick={createTopic}
              className="hv-inv"
              style={{
                display: "flex",
                alignItems: "center",
                height: 28,
                padding: "0 11px",
                borderRadius: 6,
                background: "var(--inv)",
                color: "var(--invTx)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
              }}
            >
              Add
            </div>
            <div
              onClick={() => setComposerOpen(false)}
              className="hv-sf3 hv-tx"
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--tx4)",
                fontSize: 11,
              }}
            >
              ✕
            </div>
          </div>
        ) : (
          <button
            onClick={() => setComposerOpen(true)}
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
            New topic
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
          {error && <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>}
          {banner && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                border: "1px solid color-mix(in srgb, var(--nl-accent) 16%, var(--sf))",
                background: "color-mix(in srgb, var(--nl-accent) 4%, var(--sf))",
                borderRadius: 11,
                padding: "13px 16px",
                marginBottom: 28,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".08em", color: "var(--nl-accent)", marginBottom: 4 }}>
                  AI SUGGESTION
                </div>
                <div style={{ fontSize: 13.5, color: "var(--tx2)", lineHeight: 1.5 }}>
                  New topic: <b>{banner.payload.title}</b>. {banner.rationale}
                </div>
              </div>
              <button
                onClick={() => resolveBanner("reject")}
                className="hv-sf3"
                style={{
                  flex: "none",
                  height: 29,
                  padding: "0 11px",
                  borderRadius: 7,
                  background: "var(--sf)",
                  border: "1px solid var(--bd)",
                  color: "var(--tx2)",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                }}
              >
                Reject
              </button>
              <button
                onClick={() => resolveBanner("accept")}
                className="hv-op"
                style={{
                  flex: "none",
                  height: 29,
                  padding: "0 13px",
                  borderRadius: 7,
                  background: "var(--nl-accent)",
                  border: "none",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Create topic
              </button>
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 6px 10px" }}>
            HIERARCHY
          </div>
          {rows.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "24px 6px" }}>
              No topics yet. Create one, or let the AI suggest some from your notes.
            </div>
          )}
          {rows.map((r) => (
            <div
              key={r.topic.id}
              className="hv-row"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 10px",
                paddingLeft: 10 + r.depth * 22,
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ width: 14, fontSize: 10, color: "var(--tx4)", opacity: r.hasChildren ? 1 : 0 }}>▾</span>
              <span style={{ fontSize: r.depth === 0 ? 14 : 13.5, fontWeight: r.depth === 0 ? 650 : 500 }}>
                {r.topic.title}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: "var(--tx4)" }}>
                {noteCountLabel(props.noteCounts[r.topic.id] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
