//**
// lib/chunk.ts
// Paragraph-preserving text chunker for source ingestion (PDF text, transcripts)
//**
// Greedy chunker: accumulate paragraphs until ~target size, hard-split anything
// that alone exceeds the max. Used for source_chunks before embedding.

const TARGET = 1200;
const MAX = 1600;

export function chunkText(text: string): string[] {
  const paras = text
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const p of paras) {
    if (p.length > MAX) {
      flush();
      for (let i = 0; i < p.length; i += TARGET) chunks.push(p.slice(i, i + TARGET));
      continue;
    }
    if (cur.length + p.length + 1 > TARGET) flush();
    cur += (cur ? "\n" : "") + p;
  }
  flush();
  return chunks;
}
