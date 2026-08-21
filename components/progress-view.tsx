"use client";
//**
// components/progress-view.tsx
// Progress screen: 240px topic rail (active row gets a 9% accent tint), four
// stat cards, accuracy-per-set bar chart (last two bars accent), recent activity
//**
import { useState } from "react";

export interface TopicStats {
  practiced: number;
  due: string;
  questionsAnswered: number;
  setCount: number;
  avgAccuracy: number | null;
  trend: { dir: "up" | "down" | "flat"; pts: number } | null;
  intervalDays: number | null;
  difficulty: number | null;
  bars: Array<{ label: string; pct: number }>;
}
export interface ActivityRow {
  txt: string;
  meta: string;
  time: string;
  at: string;
}

function Card(props: { label: string; value: string; sub: string; subColor?: string }) {
  return (
    <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: "14px 15px" }}>
      <div style={{ fontSize: 11.5, color: "var(--tx4)", marginBottom: 8 }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 650 }}>{props.value}</div>
      <div style={{ fontSize: 12, color: props.subColor ?? "var(--tx4)", marginTop: 4 }}>{props.sub}</div>
    </div>
  );
}

export function ProgressView(props: {
  topics: Array<{ id: string; title: string; acc: number | null }>;
  stats: Record<string, TopicStats>;
  activity: ActivityRow[];
}) {
  const [activeId, setActiveId] = useState(props.topics[0]?.id ?? null);
  const active = props.topics.find((t) => t.id === activeId) ?? null;
  const s = active ? props.stats[active.id] : null;

  const trendSub = !s
    ? ""
    : s.trend === null
      ? s.setCount < 4
        ? "take more sets for a trend"
        : "steady"
      : s.trend.dir === "down"
        ? `↓ ${s.trend.pts} pts on last two sets`
        : s.trend.dir === "up"
          ? `↑ ${s.trend.pts} pts on last two sets`
          : "steady across recent sets";
  const trendColor = s?.trend?.dir === "down" ? "#DC2626" : s?.trend?.dir === "up" ? "#10B981" : undefined;

  return (
    <>
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid var(--bd2)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Progress</span>
        <div style={{ flex: 1 }} />
        <span style={{ height: 28, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", border: "1px solid var(--bd)", borderRadius: 7, fontSize: 12.5, color: "var(--tx3)" }}>
          Last 30 days <span style={{ fontSize: 9, color: "var(--tx4)" }}>▾</span>
        </span>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ width: 240, flex: "none", borderRight: "1px solid var(--bd2)", overflow: "auto", padding: "16px 10px" }}>
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 10px 10px" }}>
            TOPICS
          </div>
          {props.topics.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--tx4)", padding: "4px 10px" }}>No topics yet.</div>
          )}
          {props.topics.map((t) => {
            const on = t.id === activeId;
            return (
              <div
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={on ? undefined : "hv-sf3"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 10px",
                  borderRadius: 7,
                  fontSize: 13,
                  background: on ? "color-mix(in srgb, var(--nl-accent) 9%, var(--sf))" : "transparent",
                  fontWeight: on ? 600 : 500,
                  cursor: "pointer",
                }}
              >
                <span>{t.title}</span>
                <span style={{ fontSize: 12, color: "var(--tx4)" }}>{t.acc === null ? "–" : `${t.acc}%`}</span>
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "28px 30px 80px" }}>
          {active && s ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 650, letterSpacing: "-0.01em" }}>{active.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--tx3)", margin: "5px 0 24px" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--nl-accent)" }} />
                {s.practiced === 0
                  ? "Not practiced yet this month"
                  : `Practiced ${s.practiced} ${s.practiced === 1 ? "time" : "times"} this month`}{" "}
                · {s.due}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
                <Card
                  label="Questions answered"
                  value={String(s.questionsAnswered)}
                  sub={`across ${s.setCount} ${s.setCount === 1 ? "set" : "sets"}`}
                />
                <Card
                  label="Avg accuracy"
                  value={s.avgAccuracy === null ? "–" : `${s.avgAccuracy}%`}
                  sub={trendSub}
                  subColor={trendColor}
                />
                <Card
                  label="Recall interval"
                  value={s.intervalDays === null ? "–" : `${s.intervalDays} ${s.intervalDays === 1 ? "day" : "days"}`}
                  sub={s.intervalDays === null ? "quiz to start the schedule" : s.due}
                />
                <Card
                  label="Difficulty"
                  value={s.difficulty === null ? "–" : `${s.difficulty} / 5`}
                  sub={s.difficulty === null ? "no misses yet" : "rated from your misses"}
                />
              </div>
              <div style={{ border: "1px solid var(--bd2)", borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Accuracy per quiz set</div>
                {s.bars.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: "var(--tx4)", padding: "20px 0 40px" }}>
                    No graded sets yet. Generate a quiz to see your curve.
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 130 }}>
                    {s.bars.map((b, i) => (
                      <div
                        key={b.label}
                        style={{ flex: 1, maxWidth: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}
                      >
                        <span style={{ fontSize: 10.5, color: "var(--tx4)" }}>{b.pct}%</span>
                        <div
                          style={{
                            width: "100%",
                            borderRadius: "5px 5px 2px 2px",
                            height: `${b.pct}%`,
                            background: i >= s.bars.length - 2 ? "var(--nl-accent)" : "var(--sf3)",
                          }}
                        />
                        <span style={{ fontSize: 10.5, color: "var(--tx4)" }}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 2px 10px" }}>
                RECENT ACTIVITY
              </div>
              {props.activity.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--tx4)", padding: "10px 2px" }}>Nothing yet.</div>
              )}
              {props.activity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: "1px solid var(--bd2)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#D8D8DC", flex: "none" }} />
                  <span style={{ fontSize: 13.5, fontWeight: 550 }}>{a.txt}</span>
                  <span style={{ fontSize: 12.5, color: "var(--tx4)" }}>{a.meta}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: "var(--tx4)" }}>{a.time}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", paddingTop: 40 }}>
              Create topics and take quizzes to see progress here.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
