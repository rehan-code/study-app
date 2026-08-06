-- Only the chosen pages of a book are uploaded now. A curriculum PDF runs well
-- past the storage upload limit, and the importer never reads the pages outside
-- the selection, so the app slices them out on the device first. The upload's
-- page 1 is book page page_offset + 1, which is how progress and range text can
-- still speak in the book's own page numbers. Whole-book uploads keep offset 0.

alter table public.pdf_imports
  add column page_offset int not null default 0;

alter table public.pdf_imports
  add constraint pdf_imports_page_offset_valid check (page_offset >= 0);
