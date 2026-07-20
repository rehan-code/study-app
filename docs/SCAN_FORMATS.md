# Scan formats

Photographed pages from the Andalus Institute workbook. Handwritten answers with
full harakat over a printed table grid; a light "AndalusInstitute.com" watermark
crosses the page and must be ignored by the parser.

A logical table usually spans TWO photos (right page + left page of a spread).
Rows align 1:1 across the pair and must be merged by row index. Upload flow
therefore accepts page pairs; phrases pages may be single.

Handwritten "LESSON N" markers appear BETWEEN rows, often mid-page: rows from a
marker down to the next marker belong to lesson N, so one spread can span
lessons 9 -> 10 -> 11. Rows above the first marker on a page continue whatever
lesson the previous page ended on; when unknown, the review screen asks.

Blank cells and "-" mean "not applicable" (e.g. توفي has no أمر or مصدر,
احتاج إلى has no أمر). Never treat them as parse errors. Occasional margin
notes exist (e.g. a note about a mistake in the book next to أرشد إلى); keep
them in the row's note field.

## 1. Nouns/adjectives spread (scan kind: "nouns")

Right page columns, right to left: المفرد | الجمع الأول | الجمع الثاني | المعنى (English)
Left page columns, right to left: المرادف | الجمع | المضاد | الجمع

- Most rows fill only singular / first plural / meaning. Synonym and antonym
  cells are sparse (e.g. مثل as synonym of كَ, يسار/شمال as antonym of يمين,
  خلف as antonym of أمام, أيضا as synonym of كذلك).
- المعنى sometimes carries an example in parentheses, e.g. كَ -> "Like
  (أريد قلمًا كهذا)". Meaning keeps the gloss; the example goes to note.
- Card fields: { arabic, plural1, plural2, synonym, synonymPlural, antonym,
  antonymPlural, note }

## 2. Verbs spread (scan kind: "verbs")

Right page columns, right to left: الماضي | الحرف | المضارع | الأمر | المصدر
Left page columns, right to left: اسم الفاعل | اسم المفعول | الجملة/المعنى (English "To ...")

- الحرف is the preposition the verb governs (بـ، إلى، في، عن، على، لـ...) and
  displays attached to the verb: اتصل بـ، نظر إلى، بحث عن، رغب في / رغب عن
  (same verb, different preposition, different meaning: desire vs reject).
- اسم الفاعل / اسم المفعول are empty on some spreads and filled on others;
  both states are valid. (Example of the filled layout still pending from the
  user; confirm before finalizing the parser prompt for it.)
- Two masdars can share a cell, e.g. احتياج/حاجة. Keep the full string.
- Card fields: { past, preposition, present, imperative, masdar,
  activeParticiple, passiveParticiple, note }

## 3. Phrases page (scan kind: "phrases")

Layout TBD: example image not yet received from the user. Expected shape is an
Arabic phrase plus English meaning per row.

- Card fields: { arabic, note }

## Parsing pipeline

`parse-scan` edge function sends the page photo(s) to Claude vision in one
request and asks for strict JSON: ordered rows with per-column strings
(preserving harakat exactly), plus detected lesson markers with the row index
they precede. Output lands in `scans.parsed_rows`; the review screen lets the
user fix any cell and confirm lesson assignment before cards are created.

## Book PDF import

The workbook pages photographed above are printed from the "Kashf Al-Mufradaat"
curriculum PDF (856 pages, one lesson block repeating: lesson text, nouns
table, synonyms/antonyms table, verbs table, expressions table). The printed
tables carry the same columns as the scan kinds, plus an expressions layout:

التعبير | المعنى | الجملة (expression, English meaning, example sentence)

which maps to phrase cards with the example sentence in note. The PDF is
digitally generated with a full text layer, so `import-pdf-batch` extracts
positioned text (no page rendering) and Claude reconstructs the tables from
coordinates. Blank student-fill tables (headers only) are skipped; lesson
headings like الدرس الأول become "Lesson 1" with position set for ordering.
