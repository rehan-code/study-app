import { cardFromRow, type Card, type CardFields, type ScanKind } from '@/domain/cards';
import { compareLessons, lessonFromRow, type Lesson } from '@/domain/lessons';
import { pdfImportFromRow, type PdfImport } from '@/domain/pdf-import';
import {
  draftToCardSeed,
  validateDrafts,
  type DraftValidation,
  type ReviewDraft,
} from '@/domain/scan-review';
import { scanFromRow, type Scan } from '@/domain/scans';
import type { SrsState } from '@/domain/srs';
import { getSupabase, makeStorageSlug } from '@/lib/supabase';

export const queryKeys = {
  lessons: ['lessons'] as const,
  cards: (lessonIds: readonly string[]) => ['cards', [...lessonIds].sort()] as const,
  card: (id: string) => ['cards', 'byId', id] as const,
  scans: ['scans'] as const,
  scan: (id: string) => ['scans', 'byId', id] as const,
  signedUrl: (bucket: string, path: string) => ['signed-url', bucket, path] as const,
  pdfImports: ['pdf-imports'] as const,
};

/** Virtual filter id for cards without a lesson. */
export const NO_LESSON_ID = 'no-lesson';

const DUPLICATE_KEY_CODE = '23505';

function raise(action: string, error: { message?: string } | null): never {
  if (error?.message) {
    console.warn(`[queries] ${action} failed:`, error.message);
  }
  throw new Error(`Couldn't ${action}. Please try again.`);
}

async function requireUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error !== null || data.session === null) {
    throw new Error('You need to be signed in for that.');
  }
  return data.session.user.id;
}

export async function listLessons(): Promise<Lesson[]> {
  const { data, error } = await getSupabase().from('lessons').select('*');
  if (error !== null) {
    raise('load your lessons', error);
  }
  return (data ?? []).map(lessonFromRow).sort(compareLessons);
}

export async function createLesson(name: string): Promise<Lesson> {
  const { data, error } = await getSupabase()
    .from('lessons')
    .insert({ name: name.trim() })
    .select('*')
    .single();
  if (error !== null) {
    if (error.code === DUPLICATE_KEY_CODE) {
      throw new Error('A lesson with that name already exists.');
    }
    raise('create the lesson', error);
  }
  return lessonFromRow(data);
}

export async function renameLesson(id: string, name: string): Promise<void> {
  const { error } = await getSupabase().from('lessons').update({ name: name.trim() }).eq('id', id);
  if (error !== null) {
    if (error.code === DUPLICATE_KEY_CODE) {
      throw new Error('A lesson with that name already exists.');
    }
    raise('rename the lesson', error);
  }
}

export async function deleteLesson(id: string): Promise<void> {
  const { error } = await getSupabase().from('lessons').delete().eq('id', id);
  if (error !== null) {
    raise('delete the lesson', error);
  }
}

export async function listCards(lessonIds: readonly string[]): Promise<Card[]> {
  let query = getSupabase().from('cards').select('*');
  const includeNoLesson = lessonIds.includes(NO_LESSON_ID);
  const realIds = lessonIds.filter((id) => id !== NO_LESSON_ID);
  if (lessonIds.length > 0) {
    if (includeNoLesson && realIds.length > 0) {
      const quoted = realIds.map((id) => `"${id}"`).join(',');
      query = query.or(`lesson_id.in.(${quoted}),lesson_id.is.null`);
    } else if (includeNoLesson) {
      query = query.is('lesson_id', null);
    } else {
      query = query.in('lesson_id', realIds);
    }
  }
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error !== null) {
    raise('load your cards', error);
  }
  return (data ?? []).map(cardFromRow);
}

export async function getCard(id: string): Promise<Card> {
  const { data, error } = await getSupabase().from('cards').select('*').eq('id', id).single();
  if (error !== null) {
    raise('load that card', error);
  }
  return cardFromRow(data);
}

export async function updateCardContent(
  id: string,
  fields: CardFields,
  meaning: string,
): Promise<void> {
  const { error } = await getSupabase().from('cards').update({ fields, meaning }).eq('id', id);
  if (error !== null) {
    raise('save the card', error);
  }
}

export async function setCardImageEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('cards')
    .update({ image_enabled: enabled })
    .eq('id', id);
  if (error !== null) {
    raise('update the card', error);
  }
}

export async function setCardLesson(id: string, lessonId: string | null): Promise<void> {
  const { error } = await getSupabase().from('cards').update({ lesson_id: lessonId }).eq('id', id);
  if (error !== null) {
    raise('move the card', error);
  }
}

export async function resetCardProgress(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('cards')
    .update({
      box: 0,
      due_at: new Date().toISOString(),
      correct_count: 0,
      incorrect_count: 0,
      last_reviewed_at: null,
    })
    .eq('id', id);
  if (error !== null) {
    raise('reset the card', error);
  }
}

export async function deleteCard(id: string): Promise<void> {
  const { error } = await getSupabase().from('cards').delete().eq('id', id);
  if (error !== null) {
    raise('delete the card', error);
  }
}

export async function applyReview(cardId: string, srs: SrsState): Promise<void> {
  const { error } = await getSupabase()
    .from('cards')
    .update({
      box: srs.box,
      due_at: srs.dueAt.toISOString(),
      correct_count: srs.correctCount,
      incorrect_count: srs.incorrectCount,
      last_reviewed_at: srs.lastReviewedAt === null ? null : srs.lastReviewedAt.toISOString(),
    })
    .eq('id', cardId);
  if (error !== null) {
    raise('save your answer', error);
  }
}

export async function listScans(): Promise<Scan[]> {
  const { data, error } = await getSupabase()
    .from('scans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error !== null) {
    raise('load your scans', error);
  }
  return (data ?? []).map(scanFromRow);
}

export async function getScan(id: string): Promise<Scan> {
  const { data, error } = await getSupabase().from('scans').select('*').eq('id', id).single();
  if (error !== null) {
    raise('load that scan', error);
  }
  return scanFromRow(data);
}

export async function createScan(kind: ScanKind, pagePaths: string[]): Promise<Scan> {
  const { data, error } = await getSupabase()
    .from('scans')
    .insert({ kind, page_paths: pagePaths })
    .select('*')
    .single();
  if (error !== null) {
    raise('save the scan', error);
  }
  return scanFromRow(data);
}

export async function deleteScan(id: string): Promise<void> {
  const { error } = await getSupabase().from('scans').delete().eq('id', id);
  if (error !== null) {
    raise('delete the scan', error);
  }
}

export async function uploadScanPage(localUri: string): Promise<string> {
  const userId = await requireUserId();
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error("Couldn't read that photo. Please try again.");
  }
  const body = await response.arrayBuffer();
  const path = `${userId}/${makeStorageSlug()}.jpg`;
  const { error } = await getSupabase()
    .storage.from('scans')
    .upload(path, body, { contentType: 'image/jpeg' });
  if (error !== null) {
    raise('upload the photo', error);
  }
  return path;
}

export async function getSignedUrl(bucket: 'scans' | 'card-images', path: string): Promise<string> {
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, 3600);
  if (error !== null || data === null) {
    raise('load the image', error);
  }
  return data.signedUrl;
}

export interface SaveReviewInput {
  scan: Scan;
  drafts: ReviewDraft[];
}

function describeDraftProblem(problem: DraftValidation): string {
  if (problem.problem === 'missing_headline') {
    return 'One of the rows is missing its Arabic text. Fill it in or remove the row.';
  }
  return 'One of the rows is missing its meaning. Fill it in or remove the row.';
}

async function resolveLessonIds(drafts: readonly ReviewDraft[]): Promise<Map<string, string>> {
  const idsByLowerName = new Map<string, string>();
  for (const lesson of await listLessons()) {
    idsByLowerName.set(lesson.name.trim().toLowerCase(), lesson.id);
  }
  for (const draft of drafts) {
    const name = draft.lessonName?.trim();
    if (!name || idsByLowerName.has(name.toLowerCase())) {
      continue;
    }
    const created = await createLesson(name);
    idsByLowerName.set(name.toLowerCase(), created.id);
  }
  return idsByLowerName;
}

export async function saveReviewedCards(input: SaveReviewInput): Promise<{ created: number }> {
  const included = input.drafts.filter((draft) => !draft.excluded);
  const problems = validateDrafts(included);
  if (problems.length > 0) {
    throw new Error(describeDraftProblem(problems[0]));
  }
  const lessonIdsByLowerName = await resolveLessonIds(included);
  const rows = included.map((draft) => {
    const seed = draftToCardSeed(draft);
    const lessonName = draft.lessonName?.trim();
    return {
      type: seed.type,
      fields: seed.fields,
      meaning: seed.meaning,
      lesson_id: lessonName ? (lessonIdsByLowerName.get(lessonName.toLowerCase()) ?? null) : null,
      scan_id: input.scan.id,
    };
  });
  if (rows.length > 0) {
    const { error } = await getSupabase().from('cards').insert(rows);
    if (error !== null) {
      raise('save your cards', error);
    }
  }
  const { error: statusError } = await getSupabase()
    .from('scans')
    .update({ status: 'reviewed' })
    .eq('id', input.scan.id);
  if (statusError !== null) {
    raise('finish the review', statusError);
  }
  return { created: rows.length };
}

/** Uploads a picked PDF into the scans bucket under the user's import folder. */
export async function uploadPdf(localUri: string): Promise<string> {
  const userId = await requireUserId();
  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error("Couldn't read that PDF. Please try again.");
  }
  const body = await response.arrayBuffer();
  const path = `${userId}/imports/${makeStorageSlug()}.pdf`;
  const { error } = await getSupabase()
    .storage.from('scans')
    .upload(path, body, { contentType: 'application/pdf' });
  if (error !== null) {
    raise('upload the PDF', error);
  }
  return path;
}

export async function createPdfImport(storagePath: string): Promise<PdfImport> {
  const { data, error } = await getSupabase()
    .from('pdf_imports')
    .insert({ storage_path: storagePath })
    .select('*')
    .single();
  if (error !== null) {
    raise('start the import', error);
  }
  return pdfImportFromRow(data);
}

/** The most recent import, done or not; null when none was ever started. */
export async function getLatestPdfImport(): Promise<PdfImport | null> {
  const { data, error } = await getSupabase()
    .from('pdf_imports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error !== null) {
    raise('load your imports', error);
  }
  return data === null ? null : pdfImportFromRow(data);
}
