# NeuroLarp — Build Plan

Canonical design record. Edit freely — this file is the source of truth for the build.
Repo: github.com/acx29/NeuroLarp · Domain: neurolarp.com · Last updated: 2026-08-19

## What it is

A note-taking app that optimizes learning. Notes (typed or photo-scanned) and user-declared
topics feed a DAG — the "mental map" — where topics are nodes and edges are relationships the
user draws or the AI suggests. Quizzes, active-recall progress stats, long-term plans, and
sources (PDF / YouTube / declared books) all hang off that graph.

Learning-science grounding: spaced repetition, active recall over passive review, priority,
minimum-information questions.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend + backend | Next.js (App Router, TypeScript) | One deployable; route handlers replace a NestJS API |
| DB / Auth / Storage | Supabase | Postgres + `pgvector` (vector search, same DB) + Storage buckets + Auth |
| Hosting | Vercel | Serverless route handlers; design AI calls small (per-note, per-quiz) |
| AI layer | Vercel AI SDK (`ai` package) | Provider-agnostic; model IDs in env vars, swappable |
| Generation model | OpenAI `gpt-5-mini` (default) | Vision + enforced JSON schema; $0.13 / $1.00 per MTok |
| Embeddings | OpenAI `text-embedding-3-small` | $0.02 per MTok; stored in pgvector |
| Graph UI | Bespoke canvas (per the graph mock's own implementation) | Absolutely-positioned node cards + SVG beziers, pan/zoom state, 14px invisible hit-strokes, animated dashed suggested edges. Chosen over React Flow at build time: the mock specifies the exact rendering, and recreating it directly is smaller and pixel-faithful; layered layout computed from subtopic depth |
| Editor | Tiptap | Block-style rich editor; content as JSON; debounced autosave |
| UI primitives | Radix UI / shadcn + Lucide icons | Modals, checkboxes, sliders, segmented controls (per handoff); charts + heatmap are plain flex/grid divs — no chart library |
| Sidebar | Components ported from the `acx29/react` library | `sidebar-navigation/sidebar-simple.tsx` + `base-components/` (nav-item, nav-account-card, featured-cards) ported into `components/` with their minimal deps and restyled Mona Sans + wordmark — paths verified on GitHub |
| Fonts | Mona Sans (everything) · Fraunces (wordmark only) | Fraunces axes: wght 900, opsz 144, SOFT 0, WONK 1 — URL must request SOFT/WONK explicitly |
| Testing | Vitest (unit) + Playwright (e2e) | Graph/SRS/schema logic unit-tested; user flows e2e |

## Confirmed decisions

1. **One repo**
2. **Notes have one nullable `topic_id`.** Sources are many-to-many with topics.
3. **Quiz formats: all three** — multiple choice (auto-graded), short answer (AI-graded with
   rubric + partial credit), cloze (blanked keyword from the user's own notes).
4. **AI scan triggers:** debounced on-save (~60s after edits stop) + manual Analyze button.
   No cron, no page-load sweeps. `last_analyzed_at` prevents re-scanning unchanged notes.
5. **Two edge kinds:** `subtopic_of` (directed; acyclicity enforced — inserting A→B is rejected
   if A is reachable from B via a recursive query) and `related` (undirected, quizzable).
6. **Code owns graph reasoning; the LLM writes prose over it.** `lib/graph/` is ~50 lines:
   cycle check, recursive subgraph collection, topological sort. Plans ordering is the sort,
   not the model. LLM output is always validated against real topic IDs (zod schema).
7. **RAG / traversal / keyword search are three different jobs:** pgvector for semantic
   matching (note→topic, topic→source chunk), traversal for structure (order, cycles, linked
   topics), Postgres full-text search for the search bar only.
8. **Suggestions are one reversible inbox.** Every AI proposal (new edge, new topic, assign
   note, identify source, section→topic mapping) is a row in `suggestions` with a rationale,
   rendered as a card with Accept/Reject. Nothing the AI does mutates the graph directly.
9. **Source recommendations have three provenance tiers**, badged in the UI, never a raw
   confidence number (scores gate internally only):
   - *from your copy* — vector search into ingested chunks (section/passage precision)
   - *model knowledge, identity confirmed* — recalled from training data for a recognized
     work; recommendations must carry chapter **titles**, not just numbers (edition drift)
   - *unverified / topic-level only* — unrecognized fileless sources
10. **`identify_source` suggestion:** creating a fileless source ("CLRS") triggers one LLM call
    proposing canonical title/authors/edition via the standard card; accepting anchors all
    future recommendations and yields the work's table of contents for sections.
11. **Section-level progress:** "how well do I know CLRS ch. 7" = direct accuracy on
    section-tagged questions when available, weighted aggregate over the section's mapped
    topics as fallback, **"untested"** when no data — never a fabricated number.
12. **BYOK (bring your own key):** Settings lets a user connect their own OpenAI or Anthropic
    key + pick a model from that provider; when connected, it powers all generation calls
    (suggestions, quiz generation, AI grading, vision scanning, plans). Key is verified on
    save (list-models call), encrypted at rest (Supabase Vault or AES-256-GCM with a server
    `ENCRYPTION_KEY`), shown only as a masked hint afterward, used server-side only.
    Per-request resolution: user key → app default key. **The embedding MODEL is pinned
    app-wide** (`text-embedding-3-small`) — vectors from different embedding models are not
    comparable — but the PAYER can vary: OpenAI-key users get embeddings billed to their key
    (same pinned model, app-key fallback if their key fails — identical vectors either way);
    Anthropic-key users get embeddings on the app key, because Anthropic has no embeddings
    endpoint (stated in Settings UI copy). Text is authoritative, vectors are regenerable:
    if the pinned model ever must change (deprecation), the exit is a batch re-embed of all
    stored text into a second vector column, then switch queries and drop the old column.
    **Gating:** BYOK ships behind an `ENABLE_BYOK` env flag — off in production, on for
    localhost/beta. Admin = email listed in `ADMIN_EMAILS` (server-side check, no roles
    system). The re-embed migration tool is admin-only regardless of the flag.
    Re-embed timing: rate-limit-bound — ~3 min per heavy user (~3M tokens, ~$0.06);
    app-wide via OpenAI Batch API overnight at half price. Two-column flip = zero downtime.
13. **Monetization path:** the app fronts generation costs for non-BYOK users; a paid tier
    via Stripe is deferred (terms TBD). To make that possible later — and to watch app-key
    spend now — every AI call logs one row to `ai_usage` (user, call kind, provider, model,
    input/output token counts). The AI SDK returns usage per response, so metering is one
    insert per call. Tier quotas and cost dashboards read this table later.
    Each row also stores `cost_usd`, computed at insert from a per-model price map in code
    (rates in force at call time — never re-priced retroactively). Quota enforcement is a
    **pre-call gate**: BYOK users skip it (own key); others are rejected before the LLM call
    when `SUM(cost_usd)` this period ≥ their cap, with a structured "quota reached" error.
    A cap bounds new work, not the final cent — the last allowed call may overshoot by at
    most one call's cost (bounded by max_tokens); concurrent requests share the same
    one-call-overshoot bound by design.
    Tier caps are per-tier config constants in code, decoupled from subscription price
    (e.g. `{free: 0.50, premium: 3.00}` — values TBD at Stripe time, informed by real
    ai_usage data). The sub-price/cap gap is margin (Stripe fees, infra, embeddings,
    profit), not overshoot protection — overshoot needs only cents. For scale: a quiz
    generation ≈ $0.004 on gpt-5-mini, so even small caps cover heavy real usage; caps
    exist to stop abuse/runaway scripts, not normal studying.
14. **Abuse controls (layered), because per-account caps alone are bypassed by
    multi-accounting:** (1) Cloudflare Turnstile on signup via Supabase Auth's native
    CAPTCHA support — activates when `TURNSTILE_*` env keys are present; (2) email
    confirmation required before an account can do anything; (3) IP sliding-window limits
    (signups/hour, AI calls/min) logged to `rate_events` (hashed IP, user, action,
    timestamp) — thresholds deliberately generous because students share campus/dorm NAT
    IPs, so IP limits are burst control, never identity; (4) per-user velocity
    (calls/minute) on top of the monthly $ quota gate; (5) **global daily app-key spend
    ceiling** — SUM(ai_usage.cost_usd) across all users per day; past the ceiling (config
    constant, env-overridable), non-BYOK AI calls pause with a UI banner and the admin is
    flagged. Layer 5 bounds worst-case daily burn regardless of account/IP count. No
    browser fingerprinting — privacy-hostile, evadable, and Turnstile covers the goal.
15. **Photo uploads are ephemeral — parsed, never stored.** Uploaded note photos are held
    in memory only: downscaled in memory (vision-token cost), sent to the vision model for
    handwriting transcription, the text inserted into the note, the bytes discarded.
    Nothing reaches storage, so photo EXIF/GPS is a non-issue by construction, and the app
    stores text, not media (no Google-Drive drift). The note keeps lightweight provenance
    jsonb ({origin: "photo", image_count}) so lists can render "4 images · handwriting
    parsed". Accepted tradeoff: transcription is one-shot (no stored original to re-parse)
    — mitigated by a **"Review transcription" state in the upload modal**: parsed text
    shown editable per image, user corrects (photo still on their phone) and confirms
    "Add to note" — only then is text inserted, embedded, and analyzed, so misreads never
    pollute suggestions. Photos are also downscaled client-side (canvas re-encode to
    ≤2048px) before upload, which cuts vision cost AND drops EXIF in the browser — GPS
    never reaches the server at all.
    Exceptions: source PDFs ARE stored (few, deliberate, needed for chunking/re-chunking
    and section anchors — `sources` bucket); the login background ships only as the
    EXIF-stripped, compressed `public/login-bg.jpg` (its gitignored original carries
    iPhone GPS).
16. **Upload limits (layered):** photos — client-side canvas downscale to ≤2048px JPEG
    before upload, ≤10 images/batch, server validates magic bytes + size (Vercel's ~4.5MB
    request-body cap is a hard platform backstop against raw-request bypass). PDFs — too
    big to route through serverless functions, so the client uploads **directly to the
    `sources` bucket via a short-lived signed URL**; the bucket enforces a per-file limit
    (100MB) and chunking runs server-side reading from storage. Per-user storage quota
    checked before issuing each signed URL (e.g. 500MB free tier — config constant).
    Upload velocity already covered by `rate_events` (decision 14).

## Data model (22 tables)

**Identity (2):** `profiles` (username unique, 1:1 with auth.users via trigger) ·
`user_api_keys` (provider openai|anthropic, encrypted key, masked hint, chosen model,
last_verified_at — BYOK, decision 12)

**Graph:** `topics` (+ `color_hue`) · `topic_edges` (kind, rationale, ai_generated, unique pair)

**Content:** `notes` (Tiptap JSON + plain-text mirror, nullable topic_id, embedding,
last_analyzed_at, provenance jsonb — e.g. {origin: "photo", image_count}) ·
`sources` (kind book|pdf|yt|web, url, file path, canonical metadata) · `source_topics` ·
`note_sources` · `source_chunks` (chunked text + embedding) · `source_sections` (label,
title, ordinal, optional chunk range) · `section_topics`

**AI (3):** `suggestions` (kind, payload jsonb, rationale, confidence, status) ·
`ai_usage` (user_id, call kind, provider, model, input_tokens, output_tokens, cost_usd,
created_at — metering for cost visibility now, tier quotas later) ·
`rate_events` (hashed IP, nullable user_id, action, created_at — sliding-window abuse
limits, decision 14)

**Quiz:** `quizzes` (mode standard|dynamic, is_mix) · `quiz_topics` (mix membership) ·
`quiz_questions` (format, options, answer, explanation, difficulty, nullable edge_id,
nullable source_section_id) · `quiz_attempts` (history; deletable) · `attempt_answers`
(per-question correctness + time_taken_ms)

**Learning engine:** `review_state` (per topic: due_at, interval_days, ease, lapses,
priority — SM-2-style scheduler updated by quiz results)

**Plans:** `plans` (goal, deadline, status) · `plan_items` (due_date, kind study|quiz|read,
topic_id, source_section_id, status, rationale)

Plus: one Storage bucket `sources` (PDFs only — note photos are never stored, decision 15);
RLS on every table (`user_id = auth.uid()`).
Exposure posture (Supabase project settings: Data API ON, auto-expose OFF, auto-RLS ON):
every migration carries explicit GRANTs next to CREATE TABLE; server-only tables
(`user_api_keys`, `ai_usage`, `rate_events`) get **no** anon/authenticated grants — they are
unreachable via the Data API and touched only by route handlers with the service role.

## Design handoff (UI look reference ONLY — gitignored)

`design_handoff_neurolarp/` holds the high-fidelity mock + spec, used **exclusively to copy
the UI look**: design tokens (colors incl. accent `#0E7C66`, type scale, spacing, radii,
shadows), per-screen layout, and interaction feel. For everything else — architecture,
schema, data flow, AI behavior, naming — **this PLAN and the recorded conversation
decisions are the source of truth**; the handoff's State Management sketch is a designer's
rough model, reconciled below, and carries no authority. The `.dc.html` files are
references to recreate in the target stack, never code to port (`image-slot.js` /
`support.js` are mock-runtime — ignore entirely). `MentalMapGraph.dc.html` is the visual
reference for the Node Graph screen; `NeuroLarp.dc.html` for everything else.

The folder is **gitignored** (`design_handoff_neurolarp/` in `.gitignore` at scaffold time)
— it stays local and never reaches GitHub or Vercel. The one artifact derived from it that
does ship is the processed login image: EXIF-stripped, compressed copy at
`public/login-bg.jpg` (which is committed).

Handoff v2 (2026-08-20) additions: token-driven **light/dark theming** (CSS custom
properties per the README's Theming table), with theme + accent user-settable via the
sidebar Settings popover — accent swatches Green `#0E7C66` (default) / Pink `#D6336C` /
Navy `#33506B` (supersedes the README's older "accent alternates" line, which contradicts
it). Sidebar respecified per `sidebar-simple.tsx` in the component library, 280px, collapsible to a 68px
icon rail, ⌘K search, Quiz count badge, Settings popover, feature card, account card —
sourced from the public `acx29/react` fork (component paths verified). All confirmed graph
edges are now hover/click-interactive with per-edge link modals — consistent with what
this PLAN already specified.

Schema reconciliations from the handoff:
- `topics` gains a `color_hue` column (graph category colors, `oklch(0.62 0.13 H)` with
  rotating hue for new topics).
- The handoff's `note_images` (stored photos + parsed text) is **not adopted** — photo
  uploads are ephemeral per decision 15 (parsed in memory, bytes discarded); the
  "4 images · handwriting parsed" row renders from `notes.provenance` jsonb instead.
- `sources.kind` enum aligned to the design badges: `book | pdf | yt | web`.
- The handoff models AI edge suggestions as pending rows in `topic_edges`
  (status suggested|confirmed). We keep the unified `suggestions` table instead: the graph
  renders pending `new_edge` suggestions as the dashed violet animated edges; Accept writes
  the real `topic_edges` row, Reject dismisses. Identical visuals, one suggestion inbox.
- The handoff's `topics.parent_id` is not adopted — hierarchy stays in `subtopic_of` edges;
  the indented Learning Topics tree renders from those.

## Feature notes

**Login page** — build to handoff §1. Background: `assets/IMG_5740.jpeg` (ocean photo —
supersedes the earlier unsplash jpg) fixed full-viewport (`position: fixed; inset: 0;
cover`, body overflow hidden, 100dvh — no white gaps on scroll/zoom) under a
`rgba(9,9,13,0.40)` overlay. **Before shipping: strip EXIF (the original carries iPhone GPS
data) and resize/compress (~1.7MB → web size) into `public/login-bg.jpg`.** Wordmark
`neurolarp.` (lowercase + period) top-left, Fraunces 29px white, weight 800,
`font-variation-settings: 'opsz' 144, 'SOFT' 0, 'WONK' 1` (Google Fonts URL must request
the SOFT/WONK axes — the handoff mocks already use the correct URL). Dead-center, 15px/500
white: "Become Aphex Twin." / "Login | Sign up"; hover = instant `#33506B`, no transition,
no underline, `a:visited` stays white. Auth modal per handoff (Sign up: username/email/
password; Login: email/password) → `supabase.auth.signUp` with username in metadata →
trigger copies to profiles. Login always redirects to Home.

**App shell** — sidebar per handoff §2 (components ported from the fork, restyled).
Theme (light/dark) + accent persist in `profiles.settings` (jsonb) and apply via a
`data-theme` attribute + CSS custom properties, with an inline script reading a
localStorage mirror before first paint so there's no theme flash. Sidebar search (⌘K)
queries Postgres full-text search across notes, topics, and sources. Quiz nav badge =
topics due for review (`review_state.due_at <= now()`). Feature card = active plan's
session progress; its Dismiss state persists in settings.

**Dashboard** — blank white page, click-to-type; text autosaves as an "Untitled" note.
Upload modal: arrow pointing top-left, nudges sideways once on hover/drag-over.

**Graph** — scroll/zoom/pan, home button reframes to 100%. Edge click → modal with the edge's
rationale + "quiz me" (intersection questions for that edge). Toggle between graph view and
topic/subtopic list hierarchy. Edges deletable; nodes connectable by drag.

**Quiz** — pick topic → modal: standard vs dynamic (dynamic reads recent attempt_answers +
review_state, surfaces weak-point pills, suggests question count). Mix checkbox → dropdown of
linked topics; mix questions target (parent × linked) pairs only, tagged with edge_id,
generated from both topics' retrieved notes + the edge rationale. Quiz saved under its topic;
take-now option; retakes update stats; history viewable and deletable.
Question content scope: the ID whitelist (decision 6) validates structural fields only
(topic_id, edge_id, section_id, format) — question TEXT is free generation drawing on the
model's training knowledge plus the retrieved notes, where notes set scope/level/
terminology, and model knowledge supplies distractors, edge cases, and explanations.
Exceptions by design: cloze is notes-only (blanked sentence from the user's own notes);
section quizzes are anchored to the section's ingested chunks.

**Progress (active recall stats)** — per topic and subtopic: retention (rolling
correct/total), accuracy-per-quiz-set over time (dedicated graph), due/overdue from
review_state, memory stability (current interval length), weak points (worst subtopics AND
worst edges), practice log, calendar heatmap, coverage (% of material ever tested), median
time-to-answer. Plus the declared/planned-sections block (section knowledge scores).

**Plans** — goal + deadline (user-set or AI-suggested) → code collects subgraph, topo-sorts,
merges review_state due dates + weak points, compresses into deadline window → vector search
attaches section readings → LLM formats plan_items (structured output) → user edits/accepts.
Plan page: contribution-grid calendar of past activity + upcoming items (e.g. "{Dijkstra × Greedy}
mix quiz, 8 questions").

**Sources** — New button → modal (manual define + drag-drop upload); direct PDF-upload path
creates the source and triggers assignment suggestions. YouTube: fetch existing captions
(Whisper fallback deferred). Fileless sources get the identify_source flow.

**Settings (BYOK)** — provider picker + key field + model dropdown per provider; verify-on-save
via list-models call; masked hint + Replace/Disconnect after save; key never returned to the
client again. Embeddings: billed to the user's key when the connected provider is OpenAI
(model stays pinned app-wide), app key otherwise — UI copy states this per provider
(see decision 12).

## Build order (one-shot, each stage browser-verified + tested before the next)

auth/shell → notes → topics/graph → suggestions → quiz → progress → plans → sources →
settings/BYOK (flag-gated; `ai_usage` metering ships earlier, woven into every AI call site
from the suggestions stage onward)

## Pre-build checklist (user)

1. Git: `git init -b main`, `git remote add origin https://github.com/acx29/NeuroLarp.git`, `git fetch origin`
2. Supabase project: enable `vector` extension (Database → Extensions); note URL + the
   **new-system keys** (API Keys → "Publishable and secret" tab, not Legacy): publishable
   `sb_publishable_…` (browser-safe, RLS-bounded) and secret `sb_secret_…` (server-only,
   service-role privileges, individually revocable); also note the DB password (migrations)
3. OpenAI API key — and set a **monthly budget limit** on the project in the OpenAI
   dashboard (vendor-side hard cap; holds even against our own bugs — the in-app daily
   ceiling is the graceful layer, this is the unbreakable one)
4. `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_... (new key system)
   SUPABASE_SECRET_KEY=                     # sb_secret_... — server-only, service-role privileges
   SUPABASE_DB_PASSWORD=                    # from project creation; used only by migration tooling
   OPENAI_API_KEY=
   AI_MODEL=gpt-5-mini
   ENCRYPTION_KEY=          # 32-byte random secret for encrypting user BYOK keys; generate with: openssl rand -base64 32
   ENABLE_BYOK=true         # feature flag — leave unset/false in production until BYOK exits beta
   ADMIN_EMAILS=snocqboy@gmail.com   # comma-separated; admin-only surfaces (re-embed tool) check this server-side
   # Optional (abuse controls, decision 14) — Turnstile activates only when both are set:
   # NEXT_PUBLIC_TURNSTILE_SITE_KEY=
   # TURNSTILE_SECRET_KEY=
   # DAILY_SPEND_CEILING_USD=20   # global app-key ceiling; defaults to a code constant if unset
   ```
5. Vercel project + neurolarp.com DNS — after first push, not blocking

## Deferred / post-v1

- Google OAuth + magic link (callback route ships in scaffold; enable provider in Supabase
  dashboard + Google Cloud OAuth client when ready)
- Whisper transcription fallback for caption-less YouTube videos
- Prompt tuning for suggestion/plan quality against real notes (machinery ships working;
  quality iterates)
- Stripe premium tier: products/prices, checkout, customer portal, webhook handler,
  `stripe_customer_id` + tier column on profiles; quota enforcement reads `ai_usage`

## Process agreements

- Git commands are provided annotated for the user to run — never executed by the agent.
- Design changes get discussed and recorded here before implementation.
- UI copy: no em-dashes anywhere in frontend text, including AI-generated strings shown in
  the UI (generation prompts instruct against them and the system prompt appends the rule).
- No third-party company or product names anywhere in the repo (comments, UI, docs) except
  required technical dependencies (the database/auth vendor, model providers, the payment
  integration when it lands) and user-facing feature domains (video links).
