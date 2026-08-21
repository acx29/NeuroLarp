//**
// lib/tiptap.ts
// Extract plain text from Tiptap JSON — the content_text mirror regenerated on save
//**
// Server-safe extraction of plain text from a Tiptap/ProseMirror JSON doc —
// the "plain-text mirror" (notes.content_text) regenerated on every save.
type PMNode = {
  type?: string;
  text?: string;
  content?: PMNode[];
};

export function tiptapToText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: PMNode) => {
    if (typeof node.text === "string") parts.push(node.text);
    if (node.type === "paragraph" || node.type === "heading" || node.type === "listItem") {
      // block boundary becomes a newline after its content
      node.content?.forEach(walk);
      parts.push("\n");
      return;
    }
    node.content?.forEach(walk);
  };
  if (doc && typeof doc === "object") walk(doc as PMNode);
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}
