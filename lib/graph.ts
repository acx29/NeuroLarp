//**
// lib/graph.ts
// The entire graph engine (PLAN 6): cycle check, subgraph collection, topological sort, linked topics
//**
// Pure graph functions — the entire "graph engine" per PLAN decision 6.
// Per-user graphs are small (≤ a few hundred topics), so callers load all
// edges in one query and these run in memory. Deterministic, unit-tested.

export type EdgeKind = "subtopic_of" | "related";
export interface GraphEdge {
  id?: string;
  source: string; // subtopic (child) for subtopic_of
  target: string; // parent for subtopic_of
  kind: EdgeKind;
}

/** Would inserting `source subtopic_of target` create a cycle?
 *  True when `source` is already reachable from `target` following child→parent edges upward…
 *  i.e. when `target` is a descendant of `source`. Walk from `target` down is equivalent to
 *  walking parent links from `target`: reject if we ever reach `source`. */
export function wouldCycle(edges: GraphEdge[], source: string, target: string): boolean {
  if (source === target) return true;
  const parents = new Map<string, string[]>(); // child -> parents
  for (const e of edges) {
    if (e.kind !== "subtopic_of") continue;
    const list = parents.get(e.source) ?? [];
    list.push(e.target);
    parents.set(e.source, list);
  }
  // If, starting at `target` and walking up to ancestors, we reach `source`,
  // then source is an ancestor of target — adding source→target would loop.
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === source) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const p of parents.get(node) ?? []) stack.push(p);
  }
  return false;
}

export interface Subgraph {
  topicIds: string[];
  edges: GraphEdge[];
}

/** Collect the connected component relevant to a goal topic: the topic itself,
 *  all its descendants (subtopics, transitively), and `related` neighbors one hop
 *  out from any member. */
export function collectSubgraph(edges: GraphEdge[], rootId: string): Subgraph {
  const children = new Map<string, string[]>(); // parent -> children
  for (const e of edges) {
    if (e.kind !== "subtopic_of") continue;
    const list = children.get(e.target) ?? [];
    list.push(e.source);
    children.set(e.target, list);
  }
  const member = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const node = stack.pop()!;
    for (const c of children.get(node) ?? []) {
      if (!member.has(c)) {
        member.add(c);
        stack.push(c);
      }
    }
  }
  // one hop of `related` from any member
  for (const e of edges) {
    if (e.kind !== "related") continue;
    if (member.has(e.source)) member.add(e.target);
    else if (member.has(e.target)) member.add(e.source);
  }
  const memberEdges = edges.filter((e) => member.has(e.source) && member.has(e.target));
  return { topicIds: [...member], edges: memberEdges };
}

/** Kahn's algorithm. Learning order = general before specific: a parent
 *  (edge target) precedes its subtopics (edge sources). `related` edges carry
 *  no ordering. Input is guaranteed acyclic by wouldCycle at insert time. */
export function topoSort(topicIds: string[], edges: GraphEdge[]): string[] {
  const ids = new Set(topicIds);
  const indegree = new Map<string, number>(topicIds.map((t) => [t, 0]));
  const children = new Map<string, string[]>(topicIds.map((t) => [t, []]));
  for (const e of edges) {
    if (e.kind !== "subtopic_of" || !ids.has(e.source) || !ids.has(e.target)) continue;
    children.get(e.target)!.push(e.source);
    indegree.set(e.source, (indegree.get(e.source) ?? 0) + 1);
  }
  const queue = topicIds.filter((t) => indegree.get(t) === 0).sort();
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const c of children.get(n) ?? []) {
      const d = indegree.get(c)! - 1;
      indegree.set(c, d);
      if (d === 0) {
        queue.push(c);
        queue.sort(); // deterministic order among peers
      }
    }
  }
  return order;
}

/** Topics directly linked to `topicId` by any edge kind (mix-quiz dropdown). */
export function linkedTopicIds(edges: GraphEdge[], topicId: string): string[] {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.source === topicId) out.add(e.target);
    if (e.target === topicId) out.add(e.source);
  }
  return [...out];
}
