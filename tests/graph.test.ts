//**
// tests/graph.test.ts
// Graph engine units: cycle detection, subgraph collection, topo order, links
//**
import { describe, it, expect } from "vitest";
import { wouldCycle, collectSubgraph, topoSort, linkedTopicIds, type GraphEdge } from "@/lib/graph";

// a -> parent of b means edge {source: b, target: a, kind: subtopic_of}
const sub = (child: string, parent: string): GraphEdge => ({ source: child, target: parent, kind: "subtopic_of" });
const rel = (a: string, b: string): GraphEdge => ({ source: a, target: b, kind: "related" });

describe("wouldCycle", () => {
  it("rejects self edges", () => {
    expect(wouldCycle([], "a", "a")).toBe(true);
  });
  it("rejects a direct reversal", () => {
    // b is already a subtopic of a; making a a subtopic of b loops
    expect(wouldCycle([sub("b", "a")], "a", "b")).toBe(true);
  });
  it("rejects a transitive loop", () => {
    // c under b under a; a under c would loop
    expect(wouldCycle([sub("b", "a"), sub("c", "b")], "a", "c")).toBe(true);
  });
  it("allows an unrelated link", () => {
    expect(wouldCycle([sub("b", "a"), sub("c", "b")], "d", "a")).toBe(false);
  });
  it("ignores related edges when walking", () => {
    expect(wouldCycle([rel("a", "b")], "a", "b")).toBe(false);
  });
});

describe("collectSubgraph", () => {
  const edges = [sub("graphs", "dsa2"), sub("dijkstra", "graphs"), rel("dijkstra", "greedy"), sub("linalg", "math")];
  it("collects descendants transitively plus one hop of related", () => {
    const g = collectSubgraph(edges, "dsa2");
    expect(new Set(g.topicIds)).toEqual(new Set(["dsa2", "graphs", "dijkstra", "greedy"]));
  });
  it("excludes disconnected branches", () => {
    const g = collectSubgraph(edges, "dsa2");
    expect(g.topicIds).not.toContain("linalg");
    expect(g.topicIds).not.toContain("math");
  });
  it("keeps only edges between members", () => {
    const g = collectSubgraph(edges, "graphs");
    expect(g.edges.every((e) => g.topicIds.includes(e.source) && g.topicIds.includes(e.target))).toBe(true);
  });
});

describe("topoSort", () => {
  it("puts parents before their subtopics", () => {
    const order = topoSort(["dijkstra", "dsa2", "graphs"], [sub("graphs", "dsa2"), sub("dijkstra", "graphs")]);
    expect(order.indexOf("dsa2")).toBeLessThan(order.indexOf("graphs"));
    expect(order.indexOf("graphs")).toBeLessThan(order.indexOf("dijkstra"));
  });
  it("is deterministic among peers (sorted)", () => {
    const order = topoSort(["c", "a", "b"], []);
    expect(order).toEqual(["a", "b", "c"]);
  });
  it("ignores related edges for ordering", () => {
    const order = topoSort(["a", "b"], [rel("b", "a")]);
    expect(order).toEqual(["a", "b"]);
  });
});

describe("linkedTopicIds", () => {
  it("returns neighbors across both directions and kinds", () => {
    const edges = [sub("b", "a"), rel("a", "c")];
    expect(new Set(linkedTopicIds(edges, "a"))).toEqual(new Set(["b", "c"]));
  });
});
