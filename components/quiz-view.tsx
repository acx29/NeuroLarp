"use client";
//**
// components/quiz-view.tsx
// Quiz screen: topic cards + saved quizzes (mock-exact), 470px config modal
// (Dynamic/Standard, mix chips, 4-20 slider, AI-suggested count, weak-point
// pills), then the runner and graded results
//**
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface QuizTopic {
  id: string;
  title: string;
  linkedCount: number;
  lastPct: number | null;
}
interface SavedQuiz {
  id: string;
  title: string;
  qCount: number;
  bestPct: number | null;
  time: string;
}
interface RunnerQuestion {
  id: string;
  ordinal: number;
  format: "mcq" | "short" | "cloze";
  prompt: string;
  options: string[];
}
interface GradedResult {
  question_id: string;
  correct: boolean;
  partial: number;
  feedback: string;
  answer: string;
  explanation: string;
}

const shortName = (t: string) => (t.length > 16 ? t.slice(0, 16).trimEnd() + "…" : t);

export function QuizView(props: {
  topics: QuizTopic[];
  linkedMap: Record<string, Array<{ id: string; title: string }>>;
  weakMap: Record<string, string[]>;
  savedQuizzes: SavedQuiz[];
  openTopicId: string | null;
  pairTopicId: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<null | { topicId: string }>(null);
  const [mode, setMode] = useState<"dynamic" | "standard">("dynamic");
  const [mixOn, setMixOn] = useState(true);
  const [chipSel, setChipSel] = useState<Record<string, boolean>>({});
  const [pillSel, setPillSel] = useState<Record<string, boolean>>({});
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState<"" | "save" | "take" | "again" | "grade">("");
  const [error, setError] = useState("");
  const [runner, setRunner] = useState<null | { quizId: string; title: string; questions: RunnerQuestion[] }>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [times, setTimes] = useState<Record<string, number>>({});
  const [results, setResults] = useState<null | { score: number; graded: GradedResult[] }>(null);
  const qStart = useRef(Date.now());

  const openConfig = (topicId: string, pairId?: string | null) => {
    const links = props.linkedMap[topicId] ?? [];
    const first = pairId && links.some((l) => l.id === pairId) ? pairId : links[0]?.id;
    setConfig({ topicId });
    setMode("dynamic");
    setMixOn(links.length > 0);
    setChipSel(first ? { [first]: true } : {});
    setPillSel({});
    setCount(8);
    setError("");
  };

  // deep link from the graph's edge modal: /quiz?open=<topic>&pair=<other>
  useEffect(() => {
    if (props.openTopicId) openConfig(props.openTopicId, props.pairTopicId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.openTopicId, props.pairTopicId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        setConfig(null);
        setResults(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  const topic = config ? props.topics.find((t) => t.id === config.topicId) : null;
  const links = config ? props.linkedMap[config.topicId] ?? [] : [];
  const pills = config ? props.weakMap[config.topicId] ?? [] : [];
  const selLinks = links.filter((l) => chipSel[l.id]);
  const mixSummary =
    selLinks.length && topic
      ? selLinks.map((l) => `${shortName(topic.title)} × ${shortName(l.title)}`).join("   ·   ")
      : "Pick at least one linked topic";
  const dipped = topic != null && topic.lastPct !== null && topic.lastPct < 70;
  const suggested = dipped ? 10 : 8;
  const suggestReason = dipped ? "accuracy dipped on your recent sets." : "steady coverage for this topic.";

  const startRunner = (quizId: string, title: string, questions: RunnerQuestion[]) => {
    setRunner({ quizId, title, questions });
    setIdx(0);
    setAnswers({});
    setTimes({});
    setResults(null);
    qStart.current = Date.now();
  };

  const generate = async (takeNow: boolean) => {
    if (!config || !topic) return;
    setBusy(takeNow ? "take" : "save");
    setError("");
    try {
      const res = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id: config.topicId,
          mode,
          count,
          mix_topic_ids: mixOn ? selLinks.map((l) => l.id) : [],
          focus: pills.filter((p) => pillSel[p]),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "generation failed");
      if (takeNow) {
        const qres = await fetch(`/api/quiz/${data.quiz_id}`);
        const qdata = await qres.json();
        if (!qres.ok) throw new Error(qdata.error ?? "could not load quiz");
        setConfig(null);
        startRunner(data.quiz_id, qdata.quiz.title, qdata.questions);
      } else {
        setConfig(null);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
    } finally {
      setBusy("");
    }
  };

  const takeAgain = async (quizId: string) => {
    setBusy("again");
    try {
      const res = await fetch(`/api/quiz/${quizId}`);
      const data = await res.json();
      if (res.ok) startRunner(quizId, data.quiz.title, data.questions);
    } finally {
      setBusy("");
    }
  };

  const recordTime = (qid: string) => {
    setTimes((t) => ({ ...t, [qid]: (t[qid] ?? 0) + (Date.now() - qStart.current) }));
    qStart.current = Date.now();
  };

  const submit = async () => {
    if (!runner) return;
    const cur = runner.questions[idx];
    recordTime(cur.id);
    setBusy("grade");
    try {
      const res = await fetch(`/api/quiz/${runner.quizId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: runner.questions.map((q) => ({
            question_id: q.id,
            response: answers[q.id] ?? "",
            time_ms: times[q.id] ?? 0,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "grading failed");
      setResults({ score: data.score, graded: data.results });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "grading failed");
    } finally {
      setBusy("");
    }
  };

  const cur = runner?.questions[idx];

  return (
    <>
      <div style={{ height: 52, flex: "none", display: "flex", alignItems: "center", padding: "0 20px", borderBottom: "1px solid var(--bd2)" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Quiz</span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "36px 32px 80px" }}>
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "0 6px 10px" }}>
            GENERATE FROM A TOPIC
          </div>
          {props.topics.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "12px 6px" }}>
              No topics yet. Add notes and topics first, then quiz yourself here.
            </div>
          )}
          {props.topics.map((t) => (
            <div
              key={t.id}
              onClick={() => openConfig(t.id)}
              className="hv-bd"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "13px 12px",
                border: "1px solid var(--bd2)",
                borderRadius: 10,
                marginBottom: 8,
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--tx4)" }}>
                  {t.linkedCount === 1 ? "1 linked topic" : `${t.linkedCount} linked topics`} ·{" "}
                  {t.lastPct === null ? "no sets yet" : `last set ${t.lastPct}%`}
                </div>
              </div>
              <button
                className="hv-sf3"
                style={{ height: 29, padding: "0 12px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
              >
                Generate
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11, fontWeight: 650, letterSpacing: ".07em", color: "var(--tx4)", padding: "26px 6px 10px" }}>
            SAVED QUIZZES
          </div>
          {props.savedQuizzes.length === 0 && (
            <div style={{ fontSize: 13.5, color: "var(--tx4)", padding: "12px 6px" }}>Nothing saved yet.</div>
          )}
          {props.savedQuizzes.map((sq) => (
            <div key={sq.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 10px", borderBottom: "1px solid var(--bd2)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 550, marginBottom: 2 }}>{sq.title}</div>
                <div style={{ fontSize: 12.5, color: "var(--tx4)" }}>
                  {sq.qCount} questions{sq.bestPct !== null ? ` · best ${sq.bestPct}%` : ""}
                </div>
              </div>
              <span style={{ fontSize: 12, color: "var(--tx4)" }}>{sq.time}</span>
              <button
                onClick={() => takeAgain(sq.id)}
                className="hv-sf3"
                style={{ height: 28, padding: "0 11px", borderRadius: 7, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}
              >
                {busy === "again" ? (
                  <>
                    <span className="nl-spin" />
                    Loading…
                  </>
                ) : (
                  "Take again"
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      {config && topic && (
        <div
          onClick={() => !busy && setConfig(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 470, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 24, animation: "nl-pop .18s ease", maxHeight: "88vh", overflow: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 650 }}>New quiz</span>
              <span
                title={topic.title}
                style={{ minWidth: 0, height: 24, lineHeight: "22px", padding: "0 10px", border: "1px solid var(--bd)", borderRadius: 999, fontSize: 12, fontWeight: 520, color: "var(--tx3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {topic.title}
              </span>
              <div style={{ flex: 1 }} />
              <span onClick={() => !busy && setConfig(null)} className="hv-tx" style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1 }}>
                ✕
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {(
                [
                  ["dynamic", "Dynamic", "Adapts to your recent mistakes and recall curve"],
                  ["standard", "Standard", "Straight coverage of the topic"],
                ] as const
              ).map(([key, label, sub]) => (
                <div
                  key={key}
                  onClick={() => setMode(key)}
                  style={{
                    border: `1.5px solid ${mode === key ? "var(--nl-accent)" : "var(--bd)"}`,
                    background: mode === key ? "color-mix(in srgb, var(--nl-accent) 4%, var(--sf))" : "var(--sf)",
                    borderRadius: 10,
                    padding: "11px 13px",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "var(--tx3)", lineHeight: 1.45 }}>{sub}</div>
                </div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={mixOn}
                disabled={links.length === 0}
                onChange={() => setMixOn(!mixOn)}
                style={{ marginTop: 2, width: 15, height: 15, accentColor: "var(--nl-accent)" }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 550, display: "block" }}>Mix with linked topics</span>
                <span style={{ fontSize: 12, color: "var(--tx3)" }}>
                  {links.length === 0 ? "Link this topic to others on the graph first" : "Questions target the intersection of two topics"}
                </span>
              </span>
            </label>
            {mixOn && links.length > 0 && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, margin: "0 0 8px 25px" }}>
                  {links.map((l) => {
                    const on = !!chipSel[l.id];
                    return (
                      <span
                        key={l.id}
                        onClick={() => setChipSel({ ...chipSel, [l.id]: !on })}
                        style={{
                          height: 27,
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "0 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 550,
                          cursor: "pointer",
                          border: `1px solid ${on ? "var(--nl-accent)" : "var(--bd)"}`,
                          background: on ? "var(--nl-accent)" : "var(--sf)",
                          color: on ? "#fff" : "var(--tx3)",
                        }}
                      >
                        {l.title}
                      </span>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: "var(--tx4)", margin: "0 0 20px 25px", whiteSpace: "pre-wrap" }}>{mixSummary}</div>
              </>
            )}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 550 }}>Questions</span>
              <span style={{ fontSize: 13.5, fontWeight: 650 }}>{count}</span>
            </div>
            <input
              type="range"
              min={4}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--nl-accent)", marginBottom: 8 }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--tx3)", marginBottom: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--nl-accent)", flex: "none" }} />
              AI suggests {suggested}, {suggestReason}
            </div>
            {pills.length > 0 && (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 550, marginBottom: 8 }}>Dial in on weak points</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 24 }}>
                  {pills.map((p) => {
                    const on = !!pillSel[p];
                    return (
                      <span
                        key={p}
                        onClick={() => setPillSel({ ...pillSel, [p]: !on })}
                        style={{
                          height: 27,
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "0 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 550,
                          cursor: "pointer",
                          border: `1px solid ${on ? "var(--nl-accent)" : "var(--bd)"}`,
                          background: on ? "var(--nl-accent)" : "var(--sf)",
                          color: on ? "#fff" : "var(--tx3)",
                        }}
                      >
                        {p}
                      </span>
                    );
                  })}
                </div>
              </>
            )}
            {error && <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid var(--bd2)", paddingTop: 16 }}>
              <button
                onClick={() => generate(false)}
                disabled={!!busy}
                className="hv-sf3"
                style={{ height: 34, padding: "0 14px", borderRadius: 8, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 13, fontWeight: 550, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
              >
                {busy === "save" ? (
                  <>
                    <span className="nl-spin" />
                    Generating…
                  </>
                ) : (
                  "Save for later"
                )}
              </button>
              <button
                onClick={() => generate(true)}
                disabled={!!busy}
                className="hv-op"
                style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy === "take" ? (
                  <>
                    <span className="nl-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate & take now"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {runner && !results && cur && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}>
          <div style={{ width: 560, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 24, animation: "nl-pop .18s ease", maxHeight: "88vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>{runner.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--tx4)" }}>
                {idx + 1} / {runner.questions.length}
              </span>
              <span onClick={() => !busy && setRunner(null)} className="hv-tx" style={{ fontSize: 15, color: "var(--tx4)", cursor: "pointer", lineHeight: 1, marginLeft: 4 }}>
                ✕
              </span>
            </div>
            <div style={{ height: 3, background: "var(--sf3)", borderRadius: 2, marginBottom: 20 }}>
              <div style={{ height: 3, width: `${((idx + 1) / runner.questions.length) * 100}%`, background: "var(--nl-accent)", borderRadius: 2, transition: "width .2s ease" }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 550, lineHeight: 1.55, marginBottom: 16, whiteSpace: "pre-wrap" }}>{cur.prompt}</div>
            {cur.format === "mcq" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {cur.options.map((o) => {
                  const on = answers[cur.id] === o;
                  return (
                    <div
                      key={o}
                      onClick={() => setAnswers({ ...answers, [cur.id]: o })}
                      style={{
                        border: `1.5px solid ${on ? "var(--nl-accent)" : "var(--bd)"}`,
                        background: on ? "color-mix(in srgb, var(--nl-accent) 4%, var(--sf))" : "var(--sf)",
                        borderRadius: 9,
                        padding: "10px 13px",
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        cursor: "pointer",
                      }}
                    >
                      {o}
                    </div>
                  );
                })}
              </div>
            )}
            {cur.format === "cloze" && (
              <input
                autoFocus
                placeholder="Fill in the blank…"
                value={answers[cur.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [cur.id]: e.target.value })}
                style={{ width: "100%", height: 38, border: "1px solid var(--bd)", borderRadius: 8, padding: "0 12px", fontSize: 13.5, background: "var(--sf)", color: "var(--tx)", outline: "none", marginBottom: 20 }}
              />
            )}
            {cur.format === "short" && (
              <textarea
                autoFocus
                placeholder="Answer in a sentence or two…"
                value={answers[cur.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [cur.id]: e.target.value })}
                rows={3}
                style={{ width: "100%", border: "1px solid var(--bd)", borderRadius: 8, padding: "10px 12px", fontSize: 13.5, lineHeight: 1.55, background: "var(--sf)", color: "var(--tx)", outline: "none", resize: "vertical", marginBottom: 20, fontFamily: "inherit" }}
              />
            )}
            {error && <div style={{ fontSize: 12.5, color: "#DC2626", marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", borderTop: "1px solid var(--bd2)", paddingTop: 16 }}>
              <button
                onClick={() => {
                  if (idx > 0) {
                    recordTime(cur.id);
                    setIdx(idx - 1);
                  }
                }}
                disabled={idx === 0 || !!busy}
                className="hv-sf3"
                style={{ height: 34, padding: "0 14px", borderRadius: 8, background: "var(--sf)", border: "1px solid var(--bd)", color: "var(--tx2)", fontSize: 13, fontWeight: 550, cursor: "pointer", opacity: idx === 0 ? 0.5 : 1 }}
              >
                Back
              </button>
              {idx < runner.questions.length - 1 ? (
                <button
                  onClick={() => {
                    recordTime(cur.id);
                    setIdx(idx + 1);
                  }}
                  className="hv-op"
                  style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!!busy}
                  className="hv-op"
                  style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
                >
                  {busy === "grade" ? (
                    <>
                      <span className="nl-spin" />
                      Grading…
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {runner && results && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(12,12,16,0.45)", display: "grid", placeItems: "center", zIndex: 60, animation: "nl-fade .15s ease" }}>
          <div style={{ width: 560, background: "var(--sf)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.28)", padding: 24, animation: "nl-pop .18s ease", maxHeight: "88vh", overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>{Math.round(results.score * 100)}%</span>
              <span style={{ fontSize: 13, color: "var(--tx3)" }}>
                {results.graded.filter((g) => g.correct).length} of {results.graded.length} correct
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--tx4)", marginBottom: 18 }}>
              Recall schedule updated. Progress reflects this set.
            </div>
            {runner.questions.map((q) => {
              const g = results.graded.find((r) => r.question_id === q.id);
              if (!g) return null;
              const partial = !g.correct && g.partial > 0;
              return (
                <div key={q.id} style={{ borderTop: "1px solid var(--bd2)", padding: "13px 0" }}>
                  <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span
                      style={{
                        flex: "none",
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        background: g.correct ? "#10B981" : partial ? "#D97706" : "#DC2626",
                        marginTop: 1,
                      }}
                    >
                      {g.correct ? "✓" : partial ? "½" : "✗"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 550, lineHeight: 1.5, marginBottom: 4 }}>{q.prompt}</div>
                      <div style={{ fontSize: 12.5, color: "var(--tx3)", lineHeight: 1.5 }}>
                        Your answer: {answers[q.id]?.trim() || "(blank)"}
                        {!g.correct && (
                          <>
                            <br />
                            Correct: {g.answer}
                          </>
                        )}
                      </div>
                      {(g.feedback || g.explanation) && (
                        <div style={{ fontSize: 12.5, color: "var(--tx4)", lineHeight: 1.5, marginTop: 4 }}>
                          {g.feedback || g.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid var(--bd2)", paddingTop: 16 }}>
              <button
                onClick={() => {
                  setRunner(null);
                  setResults(null);
                }}
                className="hv-op"
                style={{ height: 34, padding: "0 16px", borderRadius: 8, background: "var(--nl-accent)", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
