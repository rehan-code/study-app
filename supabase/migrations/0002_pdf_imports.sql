-- Whole-book PDF imports. The book is parsed in page batches by the
-- import-pdf-batch edge function; next_page is the resume cursor so an
-- interrupted import continues where it stopped.

create table public.pdf_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- path of the uploaded PDF in the scans bucket
  storage_path text not null,
  status text not null default 'created'
    check (status in ('created', 'processing', 'done', 'failed')),
  -- filled by the edge function on the first batch (the app cannot read PDFs)
  total_pages int,
  next_page int not null default 1,
  -- resolved name of the lesson still open at the batch boundary
  current_lesson text,
  lessons_created int not null default 0,
  cards_created int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pdf_imports_user_idx on public.pdf_imports (user_id, created_at desc);

alter table public.pdf_imports enable row level security;

create policy "own pdf imports" on public.pdf_imports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Imported cards remember which batch produced them so a re-run of the same
-- page range replaces its cards instead of duplicating them.
alter table public.cards
  add column pdf_import_id uuid references public.pdf_imports (id) on delete set null,
  add column import_page int;

create index cards_pdf_import_idx on public.cards (pdf_import_id, import_page);
