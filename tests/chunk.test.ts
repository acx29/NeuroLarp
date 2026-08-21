//**
// tests/chunk.test.ts
// Source-ingestion chunker units: merging, hard splits, whitespace
//**
import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/chunk";

describe("chunkText", () => {
  it("returns nothing for empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });
  it("merges small paragraphs into one chunk", () => {
    const out = chunkText("one\n\ntwo\n\nthree");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("one");
    expect(out[0]).toContain("three");
  });
  it("splits when the target size is exceeded", () => {
    const para = "x".repeat(900);
    const out = chunkText(`${para}\n\n${para}\n\n${para}`);
    expect(out.length).toBeGreaterThan(1);
  });
  it("hard-splits a single oversized paragraph", () => {
    const out = chunkText("y".repeat(5000));
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(1600);
  });
  it("collapses internal whitespace runs", () => {
    const out = chunkText("hello    world\nsame   paragraph");
    expect(out[0]).toBe("hello world same paragraph");
  });
});
