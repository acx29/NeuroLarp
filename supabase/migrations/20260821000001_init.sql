-- NeuroLarp initial schema — 22 tables per PLAN.md
-- Exposure posture: Data API on, auto-expose OFF (explicit grants below), auto-RLS on.
-- Server-only tables (user_api_keys, ai_usage, rate_events): RLS enabled, no policies, no grants.

create extension if not exists vector;

-- ============ helper: updated_at ============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ============ 1. profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 32),
  email text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1), 'user');
  candidate text := base; i int := 1;
begin
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || i::text; i := i + 1;
  end loop;
  insert into public.profiles (id, username, email) values (new.id, candidate, coalesce(new.email,''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ 2. user_api_keys (SERVER-ONLY) ============
create table public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic')),
  encrypted_key text not null,
  key_hint text not null default '',
  model text not null default '',
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ 3. topics ============
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  color_hue int not null default 250,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index topics_user_title_uniq on public.topics (user_id, lower(title));
create trigger topics_updated before update on public.topics for each row execute function public.set_updated_at();

-- ============ 4. topic_edges ============
create table public.topic_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.topics(id) on delete cascade,
  target_id uuid not null references public.topics(id) on delete cascade,
  kind text not null check (kind in ('subtopic_of','related')),
  rationale text not null default '',
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_id <> target_id)
);
-- one edge per unordered pair, regardless of kind or direction
create unique index topic_edges_pair_uniq on public.topic_edges
  (user_id, least(source_id, target_id), greatest(source_id, target_id));

-- ============ 5. notes ============
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled',
  content jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_text text not null default '',
  topic_id uuid references public.topics(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content_text,''))) stored
);
create index notes_user_idx on public.notes (user_id, updated_at desc);
create index notes_fts_idx on public.notes using gin (fts);
create trigger notes_updated before update on public.notes for each row execute function public.set_updated_at();

-- ============ 6. sources ============
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  kind text not null check (kind in ('book','pdf','yt','web')),
  url text not null default '',
  file_path text not null default '',
  meta jsonb not null default '{}'::jsonb,
  ingest_status text not null default 'none' check (ingest_status in ('none','pending','processing','ready','error')),
  ingest_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sources_updated before update on public.sources for each row execute function public.set_updated_at();

-- ============ 7. source_topics ============
create table public.source_topics (
  source_id uuid not null references public.sources(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (source_id, topic_id)
);

-- ============ 8. note_sources ============
create table public.note_sources (
  note_id uuid not null references public.notes(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (note_id, source_id)
);

-- ============ 9. source_sections ============
create table public.source_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  label text not null,
  title text not null default '',
  ordinal int not null default 0,
  chunk_start int,
  chunk_end int,
  created_at timestamptz not null default now()
);
create index source_sections_src_idx on public.source_sections (source_id, ordinal);

-- ============ 10. source_chunks ============
create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  section_id uuid references public.source_sections(id) on delete set null,
  ordinal int not null default 0,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index source_chunks_src_idx on public.source_chunks (source_id, ordinal);

-- ============ 11. section_topics ============
create table public.section_topics (
  section_id uuid not null references public.source_sections(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (section_id, topic_id)
);

-- ============ 12. suggestions ============
create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('new_edge','new_topic','assign_note','assign_source','identify_source','section_map')),
  payload jsonb not null default '{}'::jsonb,
  rationale text not null default '',
  confidence real not null default 0,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index suggestions_user_idx on public.suggestions (user_id, status, created_at desc);

-- ============ 13. ai_usage (SERVER-ONLY) ============
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12,8) not null default 0,
  byok boolean not null default false,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_day_idx on public.ai_usage (created_at desc);

-- ============ 14. rate_events (SERVER-ONLY) ============
create table public.rate_events (
  id bigint generated always as identity primary key,
  ip_hash text not null default '',
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now()
);
create index rate_events_ip_idx on public.rate_events (ip_hash, action, created_at desc);
create index rate_events_user_idx on public.rate_events (user_id, action, created_at desc);

-- ============ 15. quizzes ============
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  mode text not null check (mode in ('dynamic','standard')),
  is_mix boolean not null default false,
  title text not null default '',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index quizzes_user_idx on public.quizzes (user_id, created_at desc);

-- ============ 16. quiz_topics ============
create table public.quiz_topics (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (quiz_id, topic_id)
);

-- ============ 17. quiz_questions ============
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  ordinal int not null default 0,
  format text not null check (format in ('mcq','short','cloze')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  answer text not null,
  explanation text not null default '',
  difficulty int not null default 3 check (difficulty between 1 and 5),
  topic_id uuid references public.topics(id) on delete set null,
  edge_id uuid references public.topic_edges(id) on delete set null,
  source_section_id uuid references public.source_sections(id) on delete set null,
  created_at timestamptz not null default now()
);
create index quiz_questions_quiz_idx on public.quiz_questions (quiz_id, ordinal);

-- ============ 18. quiz_attempts ============
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score real,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, created_at desc);

-- ============ 19. attempt_answers ============
create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  response text not null default '',
  correct boolean,
  partial real check (partial between 0 and 1),
  time_ms int not null default 0,
  feedback text not null default '',
  created_at timestamptz not null default now()
);
create index attempt_answers_attempt_idx on public.attempt_answers (attempt_id);
create index attempt_answers_user_idx on public.attempt_answers (user_id, created_at desc);

-- ============ 20. review_state ============
create table public.review_state (
  topic_id uuid primary key references public.topics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null default now(),
  interval_days real not null default 1,
  ease real not null default 2.5,
  lapses int not null default 0,
  priority real not null default 0.3,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index review_state_due_idx on public.review_state (user_id, due_at);
create trigger review_state_updated before update on public.review_state for each row execute function public.set_updated_at();

-- ============ 21. plans ============
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  goal_topic_id uuid references public.topics(id) on delete set null,
  due_date date,
  status text not null default 'active' check (status in ('active','done','archived')),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============ 22. plan_items ============
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  due_date date not null,
  kind text not null check (kind in ('study','quiz','read')),
  topic_id uuid references public.topics(id) on delete set null,
  source_section_id uuid references public.source_sections(id) on delete set null,
  title text not null,
  rationale text not null default '',
  status text not null default 'pending' check (status in ('pending','done','dismissed')),
  created_at timestamptz not null default now()
);
create index plan_items_plan_idx on public.plan_items (plan_id, due_date);

-- ============ RLS ============
-- auto-RLS trigger already enables RLS on new tables; enable explicitly for certainty
alter table public.profiles enable row level security;
alter table public.user_api_keys enable row level security;
alter table public.topics enable row level security;
alter table public.topic_edges enable row level security;
alter table public.notes enable row level security;
alter table public.sources enable row level security;
alter table public.source_topics enable row level security;
alter table public.note_sources enable row level security;
alter table public.source_sections enable row level security;
alter table public.source_chunks enable row level security;
alter table public.section_topics enable row level security;
alter table public.suggestions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.rate_events enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_topics enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.review_state enable row level security;
alter table public.plans enable row level security;
alter table public.plan_items enable row level security;

-- profiles: own row only
create policy profiles_own on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- generic own-rows policies
do $$
declare t text;
begin
  foreach t in array array[
    'topics','topic_edges','notes','sources','source_topics','note_sources',
    'source_sections','source_chunks','section_topics','suggestions',
    'quizzes','quiz_topics','quiz_questions','quiz_attempts','attempt_answers',
    'review_state','plans','plan_items'
  ] loop
    execute format(
      'create policy %I_own on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t, t);
  end loop;
end $$;
-- user_api_keys / ai_usage / rate_events: RLS on, NO policies → service role only.

-- ============ GRANTS (auto-expose is OFF) ============
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.topics, public.topic_edges, public.notes,
  public.sources, public.source_topics, public.note_sources,
  public.source_sections, public.source_chunks, public.section_topics,
  public.suggestions, public.quizzes, public.quiz_topics, public.quiz_questions,
  public.quiz_attempts, public.attempt_answers, public.review_state,
  public.plans, public.plan_items
to authenticated;
-- no grants to anon (login page touches only the auth service)
-- no grants on user_api_keys / ai_usage / rate_events to any Data API role

-- ============ Storage: sources bucket ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;

create policy sources_bucket_rw on storage.objects
  for all to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
