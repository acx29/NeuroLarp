//**
// tests/schemas.test.ts
// Whitelist validation: AI outputs must reference only IDs we sent
//**
import { describe, it, expect } from "vitest";
import { analyzeNoteSchema, quizGenerationSchema, planSchema } from "@/lib/ai/schemas";

const topicIds = new Set(["t1", "t2"]);

// flat suggestion helper: all fields present, unused ones null (the shape the
// model is instructed to emit)
const flat = (over: Record<string, unknown>) => ({
  kind: "assign_note",
  topic_id: null,
  title: null,
  source_topic_id: null,
  target_topic_id: null,
  edge_kind: null,
  rationale: "r",
  confidence: 0.9,
  ...over,
});

describe("analyzeNoteSchema", () => {
  it("accepts suggestions that reference known topics", () => {
    const r = analyzeNoteSchema(topicIds).safeParse({
      suggestions: [
        flat({ kind: "assign_note", topic_id: "t1" }),
        flat({ kind: "new_edge", source_topic_id: "t2", target_topic_id: "t1", edge_kind: "subtopic_of" }),
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects unknown topic ids (the whitelist rule)", () => {
    const r = analyzeNoteSchema(topicIds).safeParse({
      suggestions: [flat({ kind: "assign_note", topic_id: "made-up" })],
    });
    expect(r.success).toBe(false);
  });
  it("rejects a new_edge with missing kind-specific fields", () => {
    const r = analyzeNoteSchema(topicIds).safeParse({
      suggestions: [flat({ kind: "new_edge", source_topic_id: "t1" })],
    });
    expect(r.success).toBe(false);
  });
  it("rejects a new_topic without a title", () => {
    const r = analyzeNoteSchema(topicIds).safeParse({ suggestions: [flat({ kind: "new_topic" })] });
    expect(r.success).toBe(false);
  });
  it("caps the batch at 5 suggestions", () => {
    const many = Array.from({ length: 6 }, () => flat({ kind: "new_topic", title: "T" }));
    expect(analyzeNoteSchema(topicIds).safeParse({ suggestions: many }).success).toBe(false);
  });
});

describe("quizGenerationSchema", () => {
  it("accepts a valid mixed set", () => {
    const r = quizGenerationSchema.safeParse({
      title: "Dijkstra set",
      questions: [
        { format: "mcq", prompt: "Which structure backs Dijkstra?", options: ["Heap", "Stack", "Trie", "Queue"], answer: "Heap", explanation: "Priority queue.", difficulty: 2, pair_index: null },
        { format: "cloze", prompt: "Settle the ____ frontier node first.", options: [], answer: "closest", explanation: "Greedy choice.", difficulty: 3, pair_index: 0 },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects an empty question list", () => {
    expect(quizGenerationSchema.safeParse({ title: "x", questions: [] }).success).toBe(false);
  });
  it("rejects out-of-range difficulty", () => {
    const q = { format: "short", prompt: "Explain relaxation.", options: [], answer: "…", explanation: "", difficulty: 9, pair_index: null };
    expect(quizGenerationSchema.safeParse({ title: "x", questions: [q] }).success).toBe(false);
  });
});

describe("planSchema", () => {
  const schema = planSchema(topicIds, new Set(["s1"]));
  it("accepts items referencing known ids", () => {
    const r = schema.safeParse({
      items: [
        { topic_id: "t1", kind: "study", due_date: "2026-09-01", source_section_id: null, title: "Review Dijkstra basics", rationale: "start broad" },
        { topic_id: "t2", kind: "read", due_date: "2026-09-02", source_section_id: "s1", title: "Read chapter 24", rationale: "covers it" },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects unknown section ids", () => {
    const r = schema.safeParse({
      items: [{ topic_id: "t1", kind: "read", due_date: "2026-09-01", source_section_id: "nope", title: "Read", rationale: "r" }],
    });
    expect(r.success).toBe(false);
  });
  it("rejects malformed dates", () => {
    const r = schema.safeParse({
      items: [{ topic_id: "t1", kind: "study", due_date: "Sep 1", source_section_id: null, title: "Study", rationale: "r" }],
    });
    expect(r.success).toBe(false);
  });
});
