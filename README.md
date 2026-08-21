# neurolarp.

AI-assisted note-taking that builds a mental map of what you know. You write notes; the app organizes them into a topic graph, quizzes you on it, schedules reviews before you forget, and plans your studying toward a deadline.

## What it does

- **Notes**: a clean editor with autosave. Drop photos of handwritten notes and they are transcribed to text; you review the transcription before it enters the note, and the image bytes are never stored.
- **Learning Topics**: your subjects, arranged as a hierarchy (a topic can have subtopics, and topics can be related sideways).
- **Node Graph**: the same topics as a pannable, zoomable map. Click an edge to see why the link exists, quiz yourself on the pair, or remove it. The AI proposes new connections as dashed edges you accept or reject.
- **AI suggestions**: on save (debounced) or on demand, a note is analyzed against your topic graph. The AI can propose assigning the note to a topic, creating a new topic, or linking two topics. Nothing happens until you accept; every proposal is reversible from an inbox.
- **Quiz**: generate question sets from any topic. Formats: multiple choice, fill-in-the-blank, and short answer (graded by AI with feedback). Mix mode targets the intersection of two linked topics. Dynamic mode aims at your recent misses.
- **Progress**: per-topic accuracy, questions answered, recall interval, and difficulty rated from your misses, with an accuracy-per-set chart and activity feed.
- **Spaced repetition**: each graded set updates a per-topic review schedule (SM-2 style). Due reviews surface as a badge on Quiz.
- **Plans**: pick a goal topic and a due date; the AI lays out dated study, quiz, and reading sessions over the topic's whole subgraph, ordered general-to-specific. Includes a study-activity heatmap and an up-next list.
- **Sources**: declare a book by name (the AI identifies the work and suggests its chapter list), upload a PDF (text extracted, chunked, embedded), or add a YouTube link (transcript fetched and indexed). Plans can schedule readings from mapped sections.
- **Bring your own key**: connect an OpenAI or Anthropic API key (verified against the provider, encrypted at rest) so AI calls bill to your account and lift the app's monthly cap.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + React + TypeScript |
| Database | Supabase Postgres with row-level security on every table, pgvector for embeddings |
| Auth | Supabase Auth (email + password, email confirmation on) |
| Storage | Supabase Storage, one private bucket for PDFs, folder-scoped per user |
| AI | Vercel AI SDK; OpenAI gpt-5-mini by default, BYOK for OpenAI/Anthropic; embeddings pinned to text-embedding-3-small |
| Editor | Tiptap |
| Styling | CSS custom properties (light/dark themes, three accent colors), Tailwind base |
| Tests | Vitest units, Playwright smoke |

Design decisions, the full table list, and process agreements live in [PLAN.md](PLAN.md).

## How the AI is kept honest and affordable

1. **Whitelist-validated outputs**: structured responses may only reference IDs that were sent in the prompt (topics, sections). Free text stays free; structure cannot hallucinate references.
2. **Suggestions inbox**: no AI output mutates your graph directly. Accepting a suggestion runs the real mutation (with a cycle check for hierarchy edges); rejecting archives it.
3. **Metering**: every call is logged with token counts and cost computed at insert time. A per-user monthly cap and a global daily ceiling are checked before each call. BYOK calls are exempt from the caps.
4. **Rate limits**: sliding-window limits per user and per hashed IP on AI and upload routes.

## Getting started

Requirements: Node 20+, a Supabase project, an OpenAI API key with credit.

```bash
git clone https://github.com/acx29/NeuroLarp.git   # clone the repo
cd NeuroLarp                                        # enter it
npm install                                         # install dependencies
cp .env.example .env.local 2>/dev/null || touch .env.local   # create your env file
```

Fill `.env.local` with:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Supabase settings |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable API key |
| `SUPABASE_SECRET_KEY` | Secret API key (server only) |
| `SUPABASE_DB_PASSWORD` | Database password, used only by the migration script; never needed on the hosting platform |
| `OPENAI_API_KEY` | App-paid OpenAI key |
| `AI_MODEL` | Optional model override, defaults to `gpt-5-mini` |
| `ENCRYPTION_KEY` | 32-byte key for encrypting stored BYOK keys |
| `ENABLE_BYOK` | `true` to show the BYOK section to everyone |
| `ADMIN_EMAILS` | Comma-separated emails that always see admin/BYOK features |
| `DAILY_SPEND_CEILING_USD` | Global daily AI budget, defaults to 20 |

Then:

```bash
npm run db:migrate   # apply supabase/migrations/*.sql over a direct Postgres connection
npm run dev          # start the dev server on http://localhost:3000
```

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm test             # Vitest unit suite (graph, SRS, AI schemas, costs, chunker, editor text)
npm run e2e          # Playwright smoke tests (run npx playwright install chromium once first)
npm run db:migrate   # apply pending SQL migrations
```

## Repository map

```
app/                 # routes; (app)/ is the authenticated shell, app/api/ the JSON endpoints
components/          # client components, one per screen plus the shell and editor
lib/                 # supabase clients, AI layer (provider/metering/schemas), graph engine, SRS, crypto
lib/graph.ts         # cycle check, subgraph collection, topological sort (pure functions)
lib/srs.ts           # spaced-repetition scheduler
supabase/migrations/ # full schema: tables, RLS policies, triggers, storage bucket
scripts/             # db-migrate.mjs, the migration runner
tests/, e2e/         # unit and smoke tests
PLAN.md              # the canonical spec this was built from
```
