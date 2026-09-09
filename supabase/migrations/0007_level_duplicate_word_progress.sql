-- One-off: a word the book prints in two lessons was imported twice and each
-- copy started from scratch, so a word already learned was drilled again as a
-- new word. Every copy is levelled up to the copy that is furthest along
-- (highest box, ties to the most recently answered). A card's box never goes
-- down, and a word with only one copy is untouched.
--
-- Imports keep the copies level from here on: src/domain/word-key.ts, mirrored
-- for the importer at supabase/functions/_shared/word-key.ts. The keying below
-- is a third copy of that rule, needed because this pass runs in SQL; it exists
-- only for this migration. Re-running is a no-op once the copies agree.

with keyed as (
  select
    id,
    user_id,
    box,
    due_at,
    correct_count,
    incorrect_count,
    last_reviewed_at,
    -- wordKey's Arabic half: NFKC, then harakat, tatweel and spacing dropped,
    -- then the Urdu and Persian letters this book's fonts substitute folded
    -- back to ordinary Arabic. Verbs are known by their past tense, everything
    -- else by its headword.
    translate(
      regexp_replace(
        normalize(
          coalesce(
            case when type = 'verb' then fields ->> 'past' else fields ->> 'arabic' end,
            ''
          ),
          NFKC
        ),
        E'[[:space:]ؐ-ؚـً-ٰٟۖ-ۜ۟-ۤۧ-۪ۨ-ۭ]',
        '',
        'g'
      ),
      E'ھہکیے',
      E'ههكيي'
    ) as arabic_key,
    -- wordKey's English half.
    lower(btrim(regexp_replace(meaning, '[[:space:]]+', ' ', 'g'))) as meaning_key
  from public.cards
),
best as (
  select distinct on (user_id, arabic_key, meaning_key)
    user_id,
    arabic_key,
    meaning_key,
    box,
    due_at,
    correct_count,
    incorrect_count,
    last_reviewed_at
  from keyed
  where arabic_key <> ''
    and meaning_key <> ''
    and last_reviewed_at is not null
  order by user_id, arabic_key, meaning_key, box desc, last_reviewed_at desc
)
update public.cards as c
set box = b.box,
    due_at = b.due_at,
    correct_count = b.correct_count,
    incorrect_count = b.incorrect_count,
    last_reviewed_at = b.last_reviewed_at
from keyed as k
join best as b
  on b.user_id = k.user_id
  and b.arabic_key = k.arabic_key
  and b.meaning_key = k.meaning_key
where c.id = k.id
  and (k.box, coalesce(k.last_reviewed_at, '-infinity'::timestamptz))
      < (b.box, b.last_reviewed_at);
