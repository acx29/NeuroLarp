"use client";
//**
// components/graph-view.tsx
// Node Graph screen, built to match the graph mock exactly: pan/zoom dot-grid
// canvas, node cards, bezier edges with 14px hit strokes, animated dashed
// suggested edge + its card, selected-node card, link explainer modal,
// inline new-topic composer, zoom pill, Graph/List segmented toggle,
// link mode for connecting nodes
//**
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { topicColor, noteCountLabel } from "@/lib/utils";

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
  rationale: string;
}
interface Suggestion {
  id: string;
  payload: Record<string, string | null>;
  rationale: string;
}

const NODE_HALF_H = 21; // edge endpoints leave/enter above/below the card, per mock

/** Deterministic layered layout: depth = longest subtopic chain from a root,
 *  siblings spread horizontally per depth row. */
function layout(topics: Topic[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "subtopic_of") continue;
    (parents.get(e.source_id) ?? parents.set(e.source_id, []).get(e.source_id)!).push(e.target_id);
    (children.get(e.target_id) ?? children.set(e.target_id, []).get(e.target_id)!).push(e.source_id);
  }
  const depth = new Map<string, number>();
  const depthOf = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const ps = parents.get(id) ?? [];
    const d = ps.length === 0 ? 0 : Math.max(...ps.map((p) => depthOf(p, seen))) + 1;
    depth.set(id, d);
    return d;
  };
  topics.forEach((t) => depthOf(t.id, new Set()));

  const rows = new Map<number, Topic[]>();
  for (const t of topics) {
    const d = depth.get(t.id) ?? 0;
    (rows.get(d) ?? rows.set(d, []).get(d)!).push(t);
  }
  const pos = new Map<string, { x: number; y: number }>();
  const rowKeys = [...rows.keys()].sort((a, b) => a - b);
  const W = 1060;
  for (const d of rowKeys) {
    const row = rows.get(d)!.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const gap = W / (row.length + 1);
    row.forEach((t, i) => {
      // stagger alternate rows slightly so long edges do not overlap perfectly
      const jitter = row.length > 1 ? 0 : d % 2 === 1 ? 40 : 0;
      pos.set(t.id, { x: Math.round(gap * (i + 1) + jitter), y: 95 + d * 145 });
    });
  }
  return pos;
}

function bezier(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const [p, q] = a.y <= b.y ? [a, b] : [b, a];
  const y1 = p.y + NODE_HALF_H;
  const y2 = q.y - NODE_HALF_H;
  const k = Math.max(30, Math.min(64, (y2 - y1) * 0.5));
  return `M ${p.x} ${y1} C ${p.x} ${y1 + k}, ${q.x} ${y2 - k}, ${q.x} ${y2}`;
}

export function GraphView(props: {
  topics: Topic[];
  edges: Edge[];
  noteCounts: Record<string, number>;
  suggestion: Suggestion | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selected, setSelected] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [edgeModal, setEdgeModal] = useState<Edge | null>(null);
  const [sugVisible, setSugVisible] = useState(true);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  const [area, setArea] = useState({ w: 1100, h: 700 });
  const [composerOpen, setComposerOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [linkMode, setLinkMode] = useState<null | { from: string; to?: string }>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const dragged = useRef(false);

  useEffect(() => {
    const measure = () => {
      if (areaRef.current) setArea({ w: areaRef.current.clientWidth, h: areaRef.current.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (areaRef.current) ro.observe(areaRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEdgeModal(null);
        setLinkMode(null);
        setComposerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const positions = useMemo(() => layout(props.topics, props.edges), [props.topics, props.edges]);
  const worldH = Math.max(620, ...[...positions.values()].map((p) => p.y + 90));
  const fit = Math.min(1, (area.w - 48) / 1060, (area.h - 48) / worldH) || 1;
  const eff = zoom ?? fit;

  const sug = props.suggestion && sugVisible ? props.suggestion : null;
  const sugSource = sug ? props.topics.find((t) => t.id === sug.payload.source_topic_id) : null;
  const sugTarget = sug ? props.topics.find((t) => t.id === sug.payload.target_topic_id) : null;

  const byId = useMemo(() => new Map(props.topics.map((t) => [t.id, t])), [props.topics]);
  const connectionsOf = (id: string) =>
    props.edges
      .filter((e) => e.source_id === id || e.target_id === id)
      .map((e) => byId.get(e.source_id === id ? e.target_id : e.source_id))
      .filter((t): t is Topic => !!t);

  const panStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
    e.preventDefault();
    const sx = e.clientX,
      sy = e.clientY,
      px = pan.x,
      py = pan.y;
    dragged.current = false;
    const mv = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) dragged.current = true;
      setPan({ x: px + ev.clientX - sx, y: py + ev.clientY - sy });
    };
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const nodeClick = async (id: string) => {
    if (linkMode && linkMode.from !== id && !linkMode.to) {
      setLinkMode({ from: linkMode.from, to: id });
      return;
    }
    setSelected(selected === id ? null : id);
  };

  const createEdge = async (kind: "subtopic_of" | "related") => {
    if (!linkMode?.to) return;
    const res = await fetch("/api/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: linkMode.to, target_id: linkMode.from, kind }),
    });
    setLinkMode(null);
    if (res.ok) router.refresh();
    else {
      const d = await res.json();
      alert(d.error ?? "could not link");
    }
  };

  const addTopic = async () => {
    const title = newName.trim();
    if (!title) return;
    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setNewName("");
    setComposerOpen(false);
    router.refresh();
  };

  const resolveSuggestion = async (action: "accept" | "reject") => {
    if (!sug) return;
    setSugVisible(false);
    await fetch(`/api/suggestions/${sug.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  };

  const deleteEdge = async () => {
    if (!edgeModal) return;
    await fetch(`/api/edges/${edgeModal.id}`, { method: "DELETE" });
    setEdgeModal(null);
    router.refresh();
  };

  const edgeNoteCount = (e: Edge) =>
    (props.noteCounts[e.source_id] ?? 0) + (props.noteCounts[e.target_id] ?? 0);

  const selTopic = selected ? byId.get(selected) : null;

  // hierarchy rows for List view
  const listRows = useMemo(() => {
    const children = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of props.edges) {
      if (e.kind !== "subtopic_of") continue;
      (children.get(e.target_id) ?? children.set(e.target_id, []).get(e.target_id)!).push(e.source_id);
      hasParent.add(e.source_id);
    }
    const rows: Array<{ t: Topic; depth: number; hasKids: boolean }> = [];
    const seen = new Set<string>();
    const visit = (id: string, depth: number) => {
      if (seen.has(id)) return;
      const t = byId.get(id);
      if (!t) return;
      seen.add(id);
      const kids = children.get(id) ?? [];
      rows.push({ t, depth, hasKids: kids.length > 0 });
      kids.forEach((k) => visit(k, depth + 1));
    };
    props.topics.filter((t) => !hasParent.has(t.id)).forEach((t) => visit(t.id, 0));
    props.topics.forEach((t) => visit(t.id, 0));
    return rows;
  }, [props.topics, props.edges, byId]);

  return (
    <>
      <div
        style={{
          height: 52,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
          borderBottom: "1px solid var(--bd2)",
        }}
      >
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Node Graph</span>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 12, color: "var(--tx3)", marginLeft: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, borderTop: "1.5px solid var(--edge)" }} />
            connected
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 18, borderTop: "1.5px dashed var(--nl-vio)" }} />
            suggested
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: "var(--sf3)", borderRadius: 8, padding: 2 }}>
          {(["graph", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                height: 26,
                padding: "0 13px",
                border: "none",
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: 550,
                cursor: "pointer",
                background: view === v ? "var(--segOn)" : "transparent",
                color: view === v ? "var(--tx)" : "var(--tx3)",
                boxShadow: view === v ? "0 1px 2px rgba(0,0,0,.08)" : "none",
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {view === "graph" ? (
          <div
            ref={areaRef}
            onMouseDown={panStart}
            onWheel={(e) => setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY })}
            onClick={(e) => {
              if (dragged.current) {
                dragged.current = false;
                return;
              }
              if ((e.target as HTMLElement).closest("[data-no-pan]")) return;
              setSelected(null);
            }}
            style={{
              position: "absolute",
              inset: 0,
              overflow: "hidden",
              cursor: "grab",
              backgroundImage: "radial-gradient(var(--dots) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: `translate(-50%,-50%) translate(${pan.x}px,${pan.y}px) scale(${eff})`,
                width: 1060,
                height: worldH,
              }}
            >
              <svg width={1060} height={worldH} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                {props.edges.map((e) => {
                  const a = positions.get(e.source_id);
                  const b = positions.get(e.target_id);
                  if (!a || !b) return null;
                  const hov = hoverEdge === e.id;
                  const endpointSel = selected === e.source_id || selected === e.target_id;
                  return (
                    <path
                      key={e.id}
                      d={bezier(a, b)}
                      style={{
                        fill: "none",
                        stroke: hov ? "var(--nl-accent)" : endpointSel ? "var(--edgeHi)" : "var(--edge)",
                        strokeWidth: hov ? 2 : 1.5,
                        transition: "stroke .12s ease",
                      }}
                    />
                  );
                })}
                {sug && sugSource && sugTarget && positions.get(sugSource.id) && positions.get(sugTarget.id) && (
                  <path
                    d={bezier(positions.get(sugSource.id)!, positions.get(sugTarget.id)!)}
                    style={{
                      fill: "none",
                      stroke: "var(--nl-vio)",
                      strokeWidth: 1.5,
                      strokeDasharray: "5 5",
                      animation: "nl-dash 1.6s linear infinite",
                    }}
                  />
                )}
                {props.edges.map((e) => {
                  const a = positions.get(e.source_id);
                  const b = positions.get(e.target_id);
                  if (!a || !b) return null;
                  return (
                    <path
                      key={`hit-${e.id}`}
                      d={bezier(a, b)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEdgeModal(e);
                      }}
                      onMouseEnter={() => setHoverEdge(e.id)}
                      onMouseLeave={() => setHoverEdge(null)}
                      style={{ fill: "none", stroke: "rgba(0,0,0,0)", strokeWidth: 14, cursor: "pointer", pointerEvents: "stroke" }}
                    />
                  );
                })}
              </svg>
              {props.topics.map((t) => {
                const p = positions.get(t.id);
                if (!p) return null;
                const color = topicColor(t.color_hue);
                const isSel = selected === t.id;
                const isLinkFrom = linkMode?.from === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      nodeClick(t.id);
                    }}
                    className="hv-lift"
                    style={{
                      position: "absolute",
                      left: p.x,
                      top: p.y,
                      transform: "translate(-50%,-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "var(--sf)",
                      border: isSel || isLinkFrom ? `1px solid ${color}` : "1px solid var(--bd)",
                      borderRadius: 10,
                      padding: "8px 13px",
                      boxShadow: isSel
                        ? `0 0 0 3px ${color.replace(")", " / 0.18)")}, 0 4px 14px rgba(0,0,0,0.07)`
                        : "0 1px 2px rgba(0,0,0,0.04)",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 550, whiteSpace: "nowrap" }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: "var(--tx4)" }}>{props.noteCounts[t.id] ?? 0}</span>
                  </div>
                );
              })}
            </div>

            <div data-no-pan style={{ position: "absolute", left: 20, top: 16, display: "flex", alignItems: "center", gap: 8, cursor: "default" }}>
              {!composerOpen ? (
                <div
                  onClick={() => setComposerOpen(true)}
                  className="hv-tx hv-bdD"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 8,
                    border: "1px solid var(--bd)",
                    background: "var(--sf)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    fontSize: 12.5,
                    fontWeight: 550,
                    color: "var(--tx2)",
                    cursor: "pointer",
                  }}
                >
                  <svg width="13" height="13">
                    <path d="M6.5 2.8v7.4M2.8 6.5h7.4" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round" }} />
                  </svg>
                  New topic
                </div>
              ) : (
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
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTopic();
                      if (e.key === "Escape") setComposerOpen(false);
                    }}
                    style={{ width: 170, height: 28, border: "none", outline: "none", padding: "0 8px", fontSize: 13, background: "transparent", color: "var(--tx)" }}
                  />
                  <div
                    onClick={addTopic}
                    className="hv-inv"
                    style={{ display: "flex", alignItems: "center", height: 28, padding: "0 11px", borderRadius: 6, background: "var(--inv)", color: "var(--invTx)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
                  >
                    Add
                  </div>
                  <div
                    onClick={() => setComposerOpen(false)}
                    className="hv-sf3 hv-tx"
                    style={{ width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx4)", fontSize: 11 }}
                  >
                    ✕
                  </div>
                </div>
              )}
              {linkMode && !linkMode.to && (
                <div style={{ fontSize: 12.5, color: "var(--tx3)", background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 8, padding: "6px 10px" }}>
                  Click another topic to link it with {byId.get(linkMode.from)?.title}
                  <span onClick={() => setLinkMode(null)} className="hv-tx" style={{ marginLeft: 8, cursor: "pointer", color: "var(--tx4)" }}>
                    ✕
                  </span>
                </div>
              )}
              {linkMode?.to && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--sf)",
                    border: "1px solid var(--bd)",
                    borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    padding: "6px 10px",
                    fontSize: 12.5,
                    animation: "nl-pop 0.15s ease",
                  }}
                >
                  <span style={{ color: "var(--tx3)" }}>
                    {byId.get(linkMode.to)?.title} is…
                  </span>
                  <button
                    onClick={() => createEdge("subtopic_of")}
                    className="hv-op"
                    style={{ height: 26, padding: "0 10px", borderRadius: 6, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
                  >
                    a subtopic
                  </button>
                  <button
                    onClick={() => createEdge("related")}
                    className="hv-sf3"
                    style={{ height: 26, padding: "0 10px", borderRadius: 6, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
                  >
                    related
                  </button>
                </div>
              )}
            </div>

            <div
              data-no-pan
              style={{
                position: "absolute",
                left: 20,
                bottom: 20,
                display: "flex",
                alignItems: "center",
                background: "var(--sf)",
                border: "1px solid var(--bd)",
                borderRadius: 8,
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                overflow: "hidden",
                cursor: "default",
              }}
            >
              <div onClick={() => setZoom(Math.max(0.3, eff / 1.25))} className="hv-sf3" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx3)", fontSize: 14 }}>
                −
              </div>
              <div style={{ fontSize: 12, color: "var(--tx3)", minWidth: 44, textAlign: "center" }}>
                {Math.round((eff / (fit || 1)) * 100)}%
              </div>
              <div onClick={() => setZoom(Math.min(2.5, eff * 1.25))} className="hv-sf3" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx3)", fontSize: 14 }}>
                +
              </div>
              <div style={{ width: 1, height: 16, background: "var(--bd2)" }} />
              <div
                onClick={() => {
                  setZoom(null);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reframe"
                className="hv-sf3"
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx3)" }}
              >
                <svg width="14" height="14">
                  <path d="M2.6 7.1 7 3.2l4.4 3.9M4 6.5v4.9h6V6.5" style={{ fill: "none", stroke: "currentColor", strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" }} />
                </svg>
              </div>
            </div>

            {selTopic && (
              <div
                data-no-pan
                style={{
                  position: "absolute",
                  right: 20,
                  bottom: 20,
                  width: 262,
                  background: "var(--sf)",
                  border: "1px solid var(--bd)",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                  padding: 14,
                  cursor: "default",
                  animation: "nl-pop 0.2s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: topicColor(selTopic.color_hue) }} />
                  <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{selTopic.title}</span>
                  <span
                    onClick={() => setSelected(null)}
                    className="hv-sf3 hv-tx"
                    style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx4)", fontSize: 11 }}
                  >
                    ✕
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--tx4)", marginTop: 2, paddingLeft: 16 }}>
                  {noteCountLabel(props.noteCounts[selTopic.id] ?? 0)}
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--tx4)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 13 }}>
                  Connected to
                </div>
                {connectionsOf(selTopic.id).length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {connectionsOf(selTopic.id).map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setSelected(c.id)}
                        className="hv-bd"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 9px",
                          borderRadius: 999,
                          border: "1px solid var(--bd)",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--tx3)",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: topicColor(c.color_hue) }} />
                        {c.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--tx4)", marginTop: 8 }}>No connections yet.</div>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 13 }}>
                  <span
                    onClick={() => router.push(`/notes?topic=${selTopic.id}`)}
                    className="hv-tx"
                    style={{ fontSize: 12.5, fontWeight: 550, color: "var(--tx2)", cursor: "pointer" }}
                  >
                    View notes →
                  </span>
                  <span
                    onClick={() => setLinkMode({ from: selTopic.id })}
                    className="hv-tx"
                    style={{ fontSize: 12.5, fontWeight: 550, color: "var(--tx2)", cursor: "pointer" }}
                  >
                    Link to…
                  </span>
                </div>
              </div>
            )}

            {sug && sugSource && sugTarget && (
              <div
                data-no-pan
                className="hv-fade"
                style={{
                  position: "absolute",
                  right: 20,
                  top: 16,
                  width: 332,
                  cursor: "default",
                  background: "var(--sf)",
                  border: "1px solid var(--bd)",
                  borderRadius: 12,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
                  padding: 16,
                  animation: "nl-pop 0.28s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "var(--nl-vio)", fontSize: 13 }}>✦</span>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>Suggested connection</span>
                  <span
                    onClick={() => resolveSuggestion("reject")}
                    className="hv-sf3 hv-tx"
                    style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--tx4)", fontSize: 11 }}
                  >
                    ✕
                  </span>
                </div>
                {/* pill text ellipsizes so long titles stay inside the 332px card */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "15px 0" }}>
                  <div title={sugSource.title} style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--bd)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 550, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                    <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: topicColor(sugSource.color_hue) }} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sugSource.title}</span>
                  </div>
                  <div style={{ flex: "none", width: 26, borderTop: "1.5px dashed var(--nl-vio)" }} />
                  <div title={sugTarget.title} style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--bd)", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 550, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                    <span style={{ flex: "none", width: 6, height: 6, borderRadius: "50%", background: topicColor(sugTarget.color_hue) }} />
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sugTarget.title}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--tx3)" }}>{sug.rationale}</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                  <div
                    onClick={() => resolveSuggestion("reject")}
                    className="hv-bd"
                    style={{ display: "flex", alignItems: "center", height: 31, padding: "0 12px", borderRadius: 8, border: "1px solid var(--bd)", fontSize: 12.5, fontWeight: 550, color: "var(--tx2)", cursor: "pointer" }}
                  >
                    Reject
                  </div>
                  <div
                    onClick={() => resolveSuggestion("accept")}
                    className="hv-inv"
                    style={{ display: "flex", alignItems: "center", height: 31, padding: "0 14px", borderRadius: 8, background: "var(--inv)", color: "var(--invTx)", fontSize: 12.5, fontWeight: 550, cursor: "pointer" }}
                  >
                    Accept
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, overflow: "auto", background: "var(--sf)" }}>
            <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
              <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 6px 10px" }}>
                HIERARCHY
              </div>
              {listRows.map((r) => (
                <div
                  key={r.t.id}
                  className="hv-row"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", paddingLeft: 10 + r.depth * 22, borderRadius: 8, cursor: "pointer" }}
                >
                  <span style={{ width: 14, fontSize: 10, color: "var(--tx4)", opacity: r.hasKids ? 1 : 0 }}>▾</span>
                  <span style={{ fontSize: r.depth === 0 ? 14 : 13.5, fontWeight: r.depth === 0 ? 650 : 500 }}>{r.t.title}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: "var(--tx4)" }}>{noteCountLabel(props.noteCounts[r.t.id] ?? 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {edgeModal && (
        <div
          onClick={() => setEdgeModal(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 420, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 22, animation: "nl-pop .18s ease" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
              <span onClick={() => setEdgeModal(null)} className="hv-tx" style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}>
                ✕
              </span>
            </div>
            {/* pills shrink with ellipsis so long titles never overflow the modal */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span
                title={byId.get(edgeModal.source_id)?.title}
                style={{ flex: "0 1 auto", minWidth: 0, height: 27, lineHeight: "25px", padding: "0 11px", border: "1px solid var(--nl-accent)", borderRadius: 999, fontSize: 12, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {byId.get(edgeModal.source_id)?.title}
              </span>
              <span style={{ flex: "1 0 16px", borderTop: "2px solid var(--nl-accent)", minWidth: 16 }} />
              <span
                title={byId.get(edgeModal.target_id)?.title}
                style={{ flex: "0 1 auto", minWidth: 0, height: 27, lineHeight: "25px", padding: "0 11px", border: "1px solid var(--nl-accent)", borderRadius: 999, fontSize: 12, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {byId.get(edgeModal.target_id)?.title}
              </span>
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".08em", color: "var(--tx4)", marginBottom: 6 }}>
              WHY THIS LINK EXISTS
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--tx2)", marginBottom: 18 }}>
              {edgeModal.rationale ||
                (edgeModal.kind === "subtopic_of"
                  ? `${byId.get(edgeModal.source_id)?.title} is a subtopic of ${byId.get(edgeModal.target_id)?.title} in your hierarchy.`
                  : "You linked these topics as related.")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span onClick={deleteEdge} className="hv-tx" style={{ fontSize: 12, color: "var(--tx4)", cursor: "pointer" }}>
                Remove link
              </span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => router.push(`/notes?topic=${edgeModal.source_id}`)}
                className="hv-sf3"
                style={{ height: 32, padding: "0 13px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12.5, fontWeight: 550, cursor: "pointer" }}
              >
                View notes ({edgeNoteCount(edgeModal)})
              </button>
              <button
                onClick={() => router.push(`/quiz?open=${edgeModal.target_id}&pair=${edgeModal.source_id}`)}
                className="hv-op"
                style={{ height: 32, padding: "0 14px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
              >
                Quiz me on this link
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
