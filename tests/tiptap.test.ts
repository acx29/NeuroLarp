//**
// tests/tiptap.test.ts
// Plain-text mirror extraction from Tiptap JSON
//**
import { describe, it, expect } from "vitest";
import { tiptapToText } from "@/lib/tiptap";

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Dijkstra" }] },
    { type: "paragraph", content: [{ type: "text", text: "Relaxation order matters." }] },
    { type: "paragraph", content: [{ type: "text", text: "Settle the closest node first." }] },
  ],
};

describe("tiptapToText", () => {
  it("joins blocks with newlines", () => {
    expect(tiptapToText(doc)).toBe("Dijkstra\nRelaxation order matters.\nSettle the closest node first.");
  });
  it("handles empty and invalid docs", () => {
    expect(tiptapToText(null)).toBe("");
    expect(tiptapToText({})).toBe("");
    expect(tiptapToText({ type: "doc", content: [] })).toBe("");
  });
  it("collapses runs of blank blocks", () => {
    const sparse = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    };
    expect(tiptapToText(sparse)).toBe("a\n\nb");
  });
});
