//**
// lib/ai/schemas.ts
// Whitelist-validated zod schemas for every AI output (suggestions, quiz, plan, identify, transcription)
//**
import { z } from "zod";

// Whitelist-validated AI output schemas (PLAN decision 6): structural fields must
// reference IDs we sent in the prompt; free text stays free.

// NOTE: must return a boolean — zod's refine treats any truthy value
// (including an error string) as a pass.
const inSet = (set: Set<string>) => (id: string) => set.has(id);

// Flat shape rather than a discriminated union: OpenAI structured outputs
// rejects the `oneOf` that zod unions compile to. Unused fields are null;
// superRefine enforces per-kind requirements including the ID whitelist.
export function analyzeNoteSchema(topicIds: Set<string>) {
  return z.object({
    suggestions: z
      .array(
        z
          .object({
            kind: z.enum(["assign_note", "new_topic", "new_edge"]),
            topic_id: z.string().nullable(), // assign_note: the existing topic
            title: z.string().nullable(), // new_topic: its title
            source_topic_id: z.string().nullable(), // new_edge: narrower topic
            target_topic_id: z.string().nullable(), // new_edge: broader topic
            edge_kind: z.enum(["subtopic_of", "related"]).nullable(),
            rationale: z.string().max(300),
            confidence: z.number().min(0).max(1),
          })
          .superRefine((s, ctx) => {
            if (s.kind === "assign_note" && (!s.topic_id || !topicIds.has(s.topic_id))) {
              ctx.addIssue({ code: "custom", message: "assign_note needs a known topic_id" });
            }
            if (s.kind === "new_topic" && (!s.title || s.title.length > 80)) {
              ctx.addIssue({ code: "custom", message: "new_topic needs a title of 80 chars or fewer" });
            }
            if (s.kind === "new_edge") {
              if (
                !s.source_topic_id ||
                !topicIds.has(s.source_topic_id) ||
                !s.target_topic_id ||
                !topicIds.has(s.target_topic_id)
              ) {
                ctx.addIssue({ code: "custom", message: "new_edge needs two known topic ids" });
              }
              if (!s.edge_kind) ctx.addIssue({ code: "custom", message: "new_edge needs edge_kind" });
            }
          })
      )
      .max(5),
  });
}

// No .default() anywhere below: defaults make properties optional in the
// emitted JSON schema, and OpenAI strict structured outputs requires every
// property to be required. The model must emit every field explicitly.
export const quizQuestionSchema = z.object({
  format: z.enum(["mcq", "short", "cloze"]),
  prompt: z.string().min(8),
  options: z.array(z.string()).max(6), // mcq only; empty array otherwise
  answer: z.string().min(1),
  explanation: z.string().max(600),
  difficulty: z.number().int().min(1).max(5),
  /** for mix quizzes: which linked topic this question pairs with (null = parent-only) */
  pair_index: z.number().int().min(0).nullable(),
});

export const quizGenerationSchema = z.object({
  title: z.string().max(120),
  questions: z.array(quizQuestionSchema).min(1).max(25),
});

export const shortAnswerGradeSchema = z.object({
  correct: z.boolean(),
  partial: z.number().min(0).max(1),
  feedback: z.string().max(400),
});

export function planSchema(topicIds: Set<string>, sectionIds: Set<string>) {
  return z.object({
    items: z
      .array(
        z.object({
          topic_id: z.string().refine(inSet(topicIds), "unknown topic").nullable(),
          kind: z.enum(["study", "quiz", "read"]),
          due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          source_section_id: z.string().refine(inSet(sectionIds), "unknown section").nullable(),
          title: z.string().min(3).max(160),
          rationale: z.string().max(300),
        })
      )
      .min(1)
      .max(60),
  });
}

export const identifySourceSchema = z.object({
  recognized: z.boolean(),
  identified_title: z.string().max(200), // empty string when not recognized
  authors: z.string().max(200),
  work_kind: z.enum(["book", "pdf", "yt", "web"]),
  edition_guess: z.string().max(60),
  confidence: z.number().min(0).max(1),
  sections: z.array(z.object({ label: z.string().max(40), title: z.string().max(160) })).max(60),
});

export const transcriptionSchema = z.object({
  pages: z.array(
    z.object({
      text: z.string(),
      legible: z.boolean(),
    })
  ),
  suggested_title: z.string().max(120), // empty string when nothing fits
});
