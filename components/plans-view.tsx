"use client";
//**
// components/plans-view.tsx
// Plans screen: switcher + New plan modal, title + On track pill + meta line,
// PLAN SUGGESTION banner, 7x16 activity heatmap, UP NEXT session rows
//**
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface PlanItemRow {
  id: string;
  day: string;
  dueDate: string;
  kind: "study" | "quiz" | "read";
  topicId: string | null;
  title: string;
  rationale: string;
  status: "pending" | "done" | "dismissed";
}

const HEAT_COLORS = [
  "var(--sf3)",
  "color-mix(in srgb, var(--nl-accent) 22%, var(--sf))",
  "color-mix(in srgb, var(--nl-accent) 52%, var(--sf))",
  "var(--nl-accent)",
];

export function PlansView(props: {
  plans: Array<{ id: string; name: string; status: string }>;
  active: { id: string; name: string; dueDate: string | null; topicCount: number } | null;
  items: PlanItemRow[];
  heat: number[];
  dip: { topicId: string; topicTitle: string } | null;
  topics: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [goalId, setGoalId] = useState(props.topics[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dipDismissed, setDipDismissed] = useState(true);

  const dipKey = props.active && props.dip ? `nl-plan-sug-${props.active.id}-${props.dip.topicId}` : null;
  useEffect(() => {
    setDipDismissed(dipKey ? localStorage.getItem(dipKey) === "1" : true);
  }, [dipKey]);

  const upNext = props.items.filter((i) => i.status === "pending").slice(0, 6);
  const doneCount = props.items.filter((i) => i.status === "done").length;
  const total = props.items.length;

  let daysLeft: number | null = null;
  let onTrack = true;
  if (props.active?.dueDate) {
    daysLeft = Math.max(0, Math.ceil((new Date(props.active.dueDate).getTime() - Date.now()) / 86_400_000));
    const overdue = props.items.filter((i) => i.status === "pending" && i.dueDate < new Date().toISOString().slice(0, 10));
    onTrack = overdue.length <= 1;
  }

  const createPlan = async () => {
    if (!name.trim() || !goalId || !due) {
      setError("Name, goal topic, and due date are all required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/plans/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), goal_topic_id: goalId, due_date: due }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "plan generation failed");
      setModalOpen(false);
      setName("");
      router.push(`/plans?plan=${data.plan_id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "plan generation failed");
    } finally {
      setBusy(false);
    }
  };

  const applyDip = async () => {
    if (!props.active || !props.dip) return;
    if (dipKey) localStorage.setItem(dipKey, "1");
    setDipDismissed(true);
    await fetch(`/api/plans/${props.active.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_id: props.dip.topicId }),
    });
    router.refresh();
  };

  const markDone = async (itemId: string) => {
    await fetch(`/api/plan-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    router.refresh();
  };

  const itemAction = (item: PlanItemRow) => {
    if (item.kind === "quiz" && item.topicId) router.push(`/quiz?open=${item.topicId}`);
    else if (item.kind === "study" && item.topicId) router.push(`/notes?topic=${item.topicId}`);
    else router.push("/sources");
  };

  const fmtDue = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <>
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "0 20px", borderBottom: "1px solid var(--bd2)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Plans</span>
        {props.active && (
          <span style={{ position: "relative" }}>
            <span
              onClick={() => setSwitcherOpen(!switcherOpen)}
              className="hv-sf3"
              style={{ height: 26, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid var(--bd)", borderRadius: 7, fontSize: 12.5, color: "var(--tx3)", cursor: "pointer" }}
            >
              {props.active.name} <span style={{ fontSize: 9, color: "var(--tx4)" }}>▾</span>
            </span>
            {switcherOpen && (
              <div
                style={{ position: "absolute", left: 0, top: 32, minWidth: 200, background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 9, boxShadow: "0 10px 28px rgba(0,0,0,0.12)", padding: 5, zIndex: 40, animation: "nl-pop .15s ease" }}
              >
                {props.plans.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSwitcherOpen(false);
                      router.push(`/plans?plan=${p.id}`);
                    }}
                    className="hv-sf3"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: p.id === props.active?.id ? 600 : 450 }}
                  >
                    {p.name}
                    {p.status !== "active" && <span style={{ fontSize: 11, color: "var(--tx4)" }}>{p.status}</span>}
                  </div>
                ))}
              </div>
            )}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setModalOpen(true)}
          className="hv-op"
          style={{ height: 30, padding: "0 13px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          New plan
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }} onClick={() => switcherOpen && setSwitcherOpen(false)}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
          {!props.active ? (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "24px 6px" }}>
              No plans yet. Create one and the AI will schedule study, quiz, and reading sessions toward your goal.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em" }}>{props.active.name}</div>
                <span style={{ height: 22, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", border: "1px solid var(--bd)", borderRadius: 999, fontSize: 11.5, color: "var(--tx3)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: onTrack ? "#10B981" : "#D97706" }} />
                  {onTrack ? "On track" : "Behind"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--tx3)", marginBottom: 24 }}>
                {props.active.dueDate ? `Due ${fmtDue(props.active.dueDate)} · ${daysLeft} days left · ` : ""}
                {props.active.topicCount} topics in scope · {doneCount} of {total} sessions done
              </div>
              {props.dip && !dipDismissed && (
                <div style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid color-mix(in srgb, var(--nl-accent) 16%, var(--sf))", background: "color-mix(in srgb, var(--nl-accent) 4%, var(--sf))", borderRadius: 11, padding: "13px 16px", marginBottom: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 650, letterSpacing: ".08em", color: "var(--nl-accent)", marginBottom: 4 }}>
                      PLAN SUGGESTION
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--tx2)", lineHeight: 1.5 }}>
                      Accuracy dipped on <b>{props.dip.topicTitle}</b>, add an extra review session tomorrow.
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (dipKey) localStorage.setItem(dipKey, "1");
                      setDipDismissed(true);
                    }}
                    className="hv-sf3"
                    style={{ flex: "none", height: 29, padding: "0 11px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={applyDip}
                    className="hv-op"
                    style={{ flex: "none", height: 29, padding: "0 13px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Apply
                  </button>
                </div>
              )}
              <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: "18px 20px", marginBottom: 26 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Study activity</span>
                  <span style={{ fontSize: 11.5, color: "var(--tx4)" }}>last 16 weeks</span>
                </div>
                <div style={{ display: "grid", gridTemplateRows: "repeat(7,11px)", gridAutoFlow: "column", gridAutoColumns: "11px", gap: 3 }}>
                  {props.heat.map((lvl, i) => (
                    <span key={i} style={{ borderRadius: 2.5, background: HEAT_COLORS[lvl] }} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 12, fontSize: 11, color: "var(--tx4)", justifyContent: "flex-end" }}>
                  Less
                  <span style={{ width: 10, height: 10, borderRadius: 2.5, background: "var(--bd2)" }} />
                  <span style={{ width: 10, height: 10, borderRadius: 2.5, background: HEAT_COLORS[1] }} />
                  <span style={{ width: 10, height: 10, borderRadius: 2.5, background: HEAT_COLORS[2] }} />
                  <span style={{ width: 10, height: 10, borderRadius: 2.5, background: HEAT_COLORS[3] }} />
                  More
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 2px 10px" }}>
                UP NEXT
              </div>
              {upNext.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--tx4)", padding: "10px 2px" }}>
                  All sessions done. Add another plan or keep quizzing freely.
                </div>
              )}
              {upNext.map((item) => (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderBottom: "1px solid var(--bd2)" }}>
                  <span style={{ flex: "none", width: 46, fontSize: 11.5, fontWeight: 600, color: "var(--tx4)" }}>{item.day}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 550, marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "var(--tx4)" }}>{item.rationale || item.kind}</div>
                  </div>
                  <button
                    onClick={() => itemAction(item)}
                    className={item.kind === "quiz" ? "hv-op" : "hv-sf3"}
                    style={
                      item.kind === "quiz"
                        ? { height: 28, padding: "0 12px", borderRadius: 7, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 550, cursor: "pointer" }
                        : { height: 28, padding: "0 12px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }
                    }
                  >
                    {item.kind === "quiz" ? "Start now" : item.kind === "study" ? "Open notes" : "View"}
                  </button>
                  <button
                    onClick={() => markDone(item.id)}
                    title="Mark done"
                    className="hv-sf3 hv-tx"
                    style={{ width: 28, height: 28, borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx4)", fontSize: 12, cursor: "pointer" }}
                  >
                    ✓
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <div
          onClick={() => !busy && setModalOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 420, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 24, animation: "nl-pop .18s ease" }}
          >
            <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
              <span style={{ fontSize: 16, fontWeight: 650, flex: 1 }}>New plan</span>
              <span onClick={() => !busy && setModalOpen(false)} className="hv-tx" style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}>
                ✕
              </span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 550, marginBottom: 6 }}>Goal</div>
            <input
              autoFocus
              placeholder="Crush the final…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 14 }}
            />
            <div style={{ fontSize: 12.5, fontWeight: 550, marginBottom: 6 }}>Goal topic</div>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 8px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 14 }}
            >
              {props.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12.5, fontWeight: 550, marginBottom: 6 }}>Due date</div>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              style={{ width: "100%", height: 36, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 8 }}
            />
            <div style={{ fontSize: 12, color: "var(--tx4)", marginBottom: 16 }}>
              The plan covers the goal topic plus every subtopic and related topic on your graph.
            </div>
            {error && <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--bd2)", paddingTop: 16 }}>
              <button
                onClick={createPlan}
                disabled={busy}
                className="hv-op"
                style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? (
                  <>
                    <span className="nl-spin" />
                    Generating… this can take a minute
                  </>
                ) : (
                  "Generate plan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
