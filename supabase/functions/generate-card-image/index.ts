import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { imageMediaType, toBase64 } from '../_shared/base64.ts';
import {
  errorResponse,
  fetchWithTimeout,
  handleOptions,
  HttpError,
  jsonResponse,
} from '../_shared/http.ts';
import { clientFromRequest } from '../_shared/supabase.ts';

const DEFAULT_FAL_MODEL = 'fal-ai/flux/schnell';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// A yes/no look at one small picture, so the cheapest vision model is plenty
// and keeps the retry loop fast.
const DEFAULT_CHECK_MODEL = 'claude-haiku-4-5-20251001';
const CARD_IMAGES_BUCKET = 'card-images';
// Never await fal.ai indefinitely; a hung call should fail this request
// instead of holding the function until the runtime kills it.
const FAL_TIMEOUT_MS = 120_000;
const CHECK_TIMEOUT_MS = 60_000;
// Each attempt is roughly a second of fal.ai plus a second of checking, so
// three rounds stay well inside the function's wall clock.
const MAX_ATTEMPTS = 3;
const CHECK_TOOL_NAME = 'report_writing_in_image';

const requestSchema = z.object({ cardId: z.uuid() });

const cardRecordSchema = z.object({
  id: z.string(),
  meaning: z.string(),
});

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string() })).min(1),
});

const checkResultSchema = z.object({
  hasWriting: z.boolean(),
  note: z.string(),
});

const anthropicMessageSchema = z.object({ content: z.array(z.unknown()) });

const toolUseBlockSchema = z.object({ type: z.literal('tool_use'), input: z.unknown() });

interface GeneratedImage {
  bytes: ArrayBuffer;
  mediaType: string;
}

const STYLE =
  'Modern flat vector style with one clear central subject, simple rounded geometric shapes, ' +
  'a warm friendly palette of terracotta, amber, sage green and cream, soft ambient shadows, ' +
  'and a clean plain light background with generous negative space.';

/**
 * FLUX has no negative prompt, and its text encoder reads a clause like "no
 * text, no letters, no captions" as a request for those very things: naming
 * them is the most reliable way to get them drawn. So none of these variants
 * mentions writing at all; each describes the wanted result positively instead
 * (smooth empty surfaces, an idea carried by shape alone). Later attempts trade
 * scene detail for abstraction, because the surfaces that invite lettering
 * (pages, screens, packaging, signs) disappear as the subject reduces to a
 * pictogram. The meaning stays unquoted and unlabelled so it reads as part of
 * the scene rather than as a caption to render.
 */
function buildPrompt(meaning: string, attempt: number): string {
  if (attempt === 0) {
    return [
      `A charming minimalist flat illustration of ${meaning},`,
      'communicating the idea purely through imagery.',
      STYLE,
      'Every surface is smooth and empty, and the whole picture speaks through shape, colour',
      'and gesture alone.',
    ].join(' ');
  }
  if (attempt === 1) {
    return [
      `A simple flat vector picture of ${meaning}, drawn as a pure visual symbol.`,
      'A single central object built from solid rounded shapes in terracotta, amber, sage green',
      'and cream, on an empty cream background. Every surface is completely smooth and empty,',
      'and the idea is carried entirely by silhouette and colour.',
    ].join(' ');
  }
  return [
    `A minimal flat pictogram of ${meaning}, in the style of a public information symbol.`,
    'One bold geometric silhouette in solid terracotta, centred on an empty cream background,',
    'reduced to its simplest essential shape, with smooth empty surfaces throughout.',
  ].join(' ');
}

const CHECK_INSTRUCTION = [
  'Look at this illustration and decide whether any part of it shows writing.',
  '',
  'Writing means: real words, single letters or numerals, characters from any alphabet or script,',
  'a signature or monogram, a logotype, a watermark, and also fake or garbled letter-like',
  'squiggles that merely imitate writing without spelling anything. Marks that clearly are not',
  'writing (a plain line, a row of dots, a stripe, a geometric pattern) do not count.',
  'When you are unsure whether a mark is writing, answer that it is.',
  '',
  `Call ${CHECK_TOOL_NAME} exactly once. Keep "note" to a few words naming what you saw and where,`,
  'or "none" when the picture is clean.',
].join('\n');

const CHECK_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hasWriting', 'note'],
  properties: {
    hasWriting: { type: 'boolean' },
    note: { type: 'string' },
  },
} as const;

function mapFalError(status: number): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError('The image service rejected the API key. Update the FAL_KEY secret.', 500);
  }
  if (status === 429) {
    return new HttpError('The image service is busy right now. Wait a minute and try again.', 503);
  }
  return new HttpError("Couldn't generate an image. Try again.", 502);
}

async function generateImage(meaning: string, attempt: number): Promise<GeneratedImage> {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) {
    throw new HttpError("Image generation isn't set up yet. Add the FAL_KEY secret.", 500);
  }
  const model = Deno.env.get('FAL_MODEL') ?? DEFAULT_FAL_MODEL;
  const response = await fetchWithTimeout(
    `https://fal.run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: buildPrompt(meaning, attempt),
        image_size: 'landscape_4_3',
        num_images: 1,
      }),
    },
    FAL_TIMEOUT_MS,
    new HttpError('The image service took too long. Try again.', 504),
  );
  if (!response.ok) {
    console.error('generate-card-image: fal.ai error', {
      status: response.status,
      body: await response.text(),
    });
    throw mapFalError(response.status);
  }
  const parsed = falResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error('generate-card-image: unexpected fal.ai response shape', parsed.error);
    throw new HttpError("Couldn't generate an image. Try again.", 502);
  }
  const first = parsed.data.images[0];
  if (!first) {
    throw new HttpError("Couldn't generate an image. Try again.", 502);
  }
  const imageResponse = await fetchWithTimeout(
    first.url,
    {},
    FAL_TIMEOUT_MS,
    new HttpError("Couldn't download the generated image. Try again.", 504),
  );
  if (!imageResponse.ok) {
    console.error('generate-card-image: image download failed', { status: imageResponse.status });
    throw new HttpError("Couldn't download the generated image. Try again.", 502);
  }
  return {
    bytes: await imageResponse.arrayBuffer(),
    mediaType: imageMediaType(imageResponse.headers.get('content-type')),
  };
}

/**
 * Asks Claude whether the picture has any writing on it. Returns null when the
 * check could not run at all (no key, upstream error, unexpected shape): the
 * caller then keeps the image rather than leaving the card blank, because an
 * unverified picture from the current prompt is still the normal case, not a
 * failure. A null is always logged so a silently broken checker is visible.
 */
async function checkForWriting(
  image: GeneratedImage,
): Promise<z.infer<typeof checkResultSchema> | null> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('generate-card-image: ANTHROPIC_API_KEY missing, keeping image unchecked');
    return null;
  }
  const model = Deno.env.get('IMAGE_CHECK_MODEL') ?? DEFAULT_CHECK_MODEL;
  try {
    const response = await fetchWithTimeout(
      ANTHROPIC_URL,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 256,
          tools: [
            {
              name: CHECK_TOOL_NAME,
              description: 'Report whether the illustration contains any writing.',
              input_schema: CHECK_TOOL_SCHEMA,
            },
          ],
          tool_choice: { type: 'tool', name: CHECK_TOOL_NAME },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: toBase64(new Uint8Array(image.bytes)),
                  },
                },
                { type: 'text', text: CHECK_INSTRUCTION },
              ],
            },
          ],
        }),
      },
      CHECK_TIMEOUT_MS,
      new HttpError('The writing check took too long.', 504),
    );
    if (!response.ok) {
      console.error('generate-card-image: writing check rejected', {
        status: response.status,
        body: await response.text(),
      });
      return null;
    }
    const message = anthropicMessageSchema.safeParse(await response.json());
    if (!message.success) {
      console.error('generate-card-image: unexpected writing check response', message.error);
      return null;
    }
    for (const block of message.data.content) {
      const toolUse = toolUseBlockSchema.safeParse(block);
      if (toolUse.success) {
        const result = checkResultSchema.safeParse(toolUse.data.input);
        if (result.success) {
          return result.data;
        }
        console.error('generate-card-image: writing check tool input invalid', result.error);
        return null;
      }
    }
    console.error('generate-card-image: no tool_use block in writing check response');
    return null;
  } catch (error) {
    console.error('generate-card-image: writing check failed', error);
    return null;
  }
}

/**
 * Generates until the picture comes back free of writing. FLUX puts lettering
 * on an image often enough that the prompt alone cannot guarantee a clean one,
 * especially for meanings that are themselves about writing ("the book", "he
 * writes"), so every attempt is checked and a dirty one is thrown away. fal.ai
 * failures propagate immediately: only writing drives a retry.
 */
async function generateCleanImage(meaning: string): Promise<GeneratedImage> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const image = await generateImage(meaning, attempt);
    const check = await checkForWriting(image);
    if (!check || !check.hasWriting) {
      return image;
    }
    console.warn('generate-card-image: discarded an image with writing', {
      attempt,
      note: check.note,
    });
  }
  throw new HttpError("Couldn't make a clean image for this card. Try again.", 502);
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) {
    return preflight;
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed.', 405);
  }

  let supabase: SupabaseClient;
  try {
    supabase = clientFromRequest(req);
  } catch (error) {
    console.error('generate-card-image: client setup failed', error);
    return errorResponse('The server is not configured correctly.', 500);
  }

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return errorResponse('Sign in to generate images.', 401);
  }
  const userId = auth.user.id;

  const body = await req.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) {
    return errorResponse('A valid card id is required.', 400);
  }
  const { cardId } = parsedBody.data;

  const { data: cardRow, error: cardError } = await supabase
    .from('cards')
    .select('id, meaning')
    .eq('id', cardId)
    .maybeSingle();
  if (cardError) {
    console.error('generate-card-image: card lookup failed', cardError);
    return errorResponse("Couldn't load that card. Try again.", 500);
  }
  if (!cardRow) {
    return errorResponse('Card not found.', 404);
  }
  const card = cardRecordSchema.safeParse(cardRow);
  if (!card.success) {
    console.error('generate-card-image: card row failed validation', card.error);
    return errorResponse("Couldn't load that card. Try again.", 500);
  }
  if (card.data.meaning.trim().length === 0) {
    return errorResponse('Add a meaning to this card before generating an image.', 400);
  }

  try {
    const image = await generateCleanImage(card.data.meaning);
    const path = `${userId}/${cardId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .upload(path, image.bytes, { contentType: image.mediaType, upsert: true });
    if (uploadError) {
      console.error('generate-card-image: upload failed', uploadError);
      throw new HttpError("Couldn't save the image. Try again.", 500);
    }
    const { error: updateError } = await supabase
      .from('cards')
      .update({ ai_image_path: path })
      .eq('id', cardId);
    if (updateError) {
      console.error('generate-card-image: card update failed', updateError);
      throw new HttpError("Couldn't attach the image to the card. Try again.", 500);
    }
    return jsonResponse({ path });
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error('generate-card-image: unexpected failure', error);
    return errorResponse("Couldn't generate an image. Try again.", 500);
  }
});
