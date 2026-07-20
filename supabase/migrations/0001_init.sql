-- Mufradat initial schema. Single-user app; RLS scopes every row to the
-- authenticated user so a second account stays isolated if ever added.

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('nouns', 'verbs', 'phrases')),
  -- storage paths in the scans bucket; spreads have 2 pages, single pages 1
  page_paths text[] not null,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'parsing', 'parsed', 'reviewed', 'failed')),
  -- raw parser output kept so the review screen can be reopened
  parsed_rows jsonb,
  parse_error text,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete set null,
  scan_id uuid references public.scans (id) on delete set null,
  type text not null check (type in ('vocab', 'verb', 'phrase')),
  -- typed per card type in src/domain/cards.ts:
  -- vocab:  arabic, plural1, plural2, synonym, synonymPlural, antonym, antonymPlural, note
  -- verb:   past, preposition, present, imperative, masdar, activeParticiple, passiveParticiple, note
  -- phrase: arabic, note
  fields jsonb not null,
  meaning text not null,
  ai_image_path text,
  image_enabled boolean not null default true,
  -- Leitner SRS state
  box int not null default 0,
  due_at timestamptz not null default now(),
  correct_count int not null default 0,
  incorrect_count int not null default 0,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index cards_due_idx on public.cards (user_id, due_at);
create index cards_lesson_idx on public.cards (lesson_id);
create index scans_user_idx on public.scans (user_id, created_at desc);

alter table public.lessons enable row level security;
alter table public.scans enable row level security;
alter table public.cards enable row level security;

create policy "own lessons" on public.lessons
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own scans" on public.scans
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own cards" on public.cards
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Storage: page photos and generated study images, private buckets.
insert into storage.buckets (id, name, public)
values ('scans', 'scans', false), ('card-images', 'card-images', false)
on conflict (id) do nothing;

create policy "authed rw app buckets" on storage.objects
  for all to authenticated
  using (bucket_id in ('scans', 'card-images'))
  with check (bucket_id in ('scans', 'card-images'));
