-- An import can cover a slice of the book instead of all of it, so the pages of
-- the lesson being studied can be parsed on their own. from_page seeds the
-- resume cursor; to_page is null when the import runs to the last page.

alter table public.pdf_imports
  add column from_page int not null default 1,
  add column to_page int;

alter table public.pdf_imports
  add constraint pdf_imports_from_page_valid check (from_page >= 1),
  add constraint pdf_imports_page_range_valid check (to_page is null or to_page >= from_page),
  -- The app seeds next_page from from_page; a client that forgets fails loudly
  -- instead of silently importing from page 1.
  add constraint pdf_imports_cursor_in_range check (next_page >= from_page);
