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
// A few yes/no questions about one small picture, so the cheapest vision
// model is plenty and keeps the retry loop fast.
const DEFAULT_CHECK_MODEL = 'claude-haiku-4-5-20251001';
// One short sentence of scene per card; a fast model keeps bulk generation
// after a scan quick, and IMAGE_SCENE_MODEL can raise it if scenes read flat.
const DEFAULT_SCENE_MODEL = 'claude-haiku-4-5-20251001';
const CARD_IMAGES_BUCKET = 'card-images';
// Never await fal.ai indefinitely; a hung call should fail this request
// instead of holding the function until the runtime kills it.
const FAL_TIMEOUT_MS = 120_000;
const CHECK_TIMEOUT_MS = 60_000;
const SCENE_TIMEOUT_MS = 30_000;
// Each attempt is a couple of seconds of scene writing, a second of fal.ai and
// a couple of seconds of checking, so four rounds stay well inside the wall
// clock. Four rather than three because FLUX slips on faces as well as
// lettering, and a card left without a picture is the cost of running out.
const MAX_ATTEMPTS = 4;
const CHECK_TOOL_NAME = 'report_image_problems';
const SCENE_TOOL_NAME = 'describe_scene';

const requestSchema = z.object({ cardId: z.uuid() });

const cardRecordSchema = z.object({
  id: z.string(),
  type: z.enum(['vocab', 'verb', 'phrase']),
  meaning: z.string(),
  // Vocab and phrase cards keep the word in `arabic`, verbs in `past`.
  fields: z.object({ arabic: z.string().nullish(), past: z.string().nullish() }),
});

type CardRecord = z.infer<typeof cardRecordSchema>;

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string() })).min(1),
});

const checkResultSchema = z.object({
  hasWriting: z.boolean(),
  hasFacialFeatures: z.boolean(),
  hasUncoveredFemale: z.boolean(),
  note: z.string(),
});

type CheckResult = z.infer<typeof checkResultSchema>;

const sceneResultSchema = z.object({ scene: z.string().trim().min(1).max(600) });

const anthropicMessageSchema = z.object({ content: z.array(z.unknown()) });

const toolUseBlockSchema = z.object({ type: z.literal('tool_use'), input: z.unknown() });

interface GeneratedImage {
  bytes: ArrayBuffer;
  mediaType: string;
}

const KIND_LABELS: Record<CardRecord['type'], string> = {
  vocab: 'noun or adjective',
  verb: 'verb',
  phrase: 'phrase or expression',
};

interface Palette {
  colours: string;
  background: string;
}

/**
 * One is picked at random per image. A single fixed palette made every card
 * look alike, and left to choose freely the scene writer settles on the same
 * few colours each time, so the variety has to come from outside the model.
 */
const DEFAULT_PALETTE: Palette = {
  colours: 'cobalt blue, teal and coral',
  background: 'pale sky blue',
};
const PALETTES: readonly Palette[] = [
  DEFAULT_PALETTE,
  { colours: 'leaf green, sunny yellow and white', background: 'soft mint' },
  { colours: 'lavender, rose pink and navy', background: 'pale lilac' },
  { colours: 'bright red, yellow and royal blue', background: 'warm off-white' },
  { colours: 'tangerine, deep red and cream', background: 'pale peach' },
  { colours: 'turquoise, orange and sand', background: 'light sand' },
  { colours: 'forest green, mustard and chestnut brown', background: 'pale sage' },
  { colours: 'indigo, gold and sky blue', background: 'pale periwinkle' },
  { colours: 'emerald green, magenta and cream', background: 'soft blush pink' },
  { colours: 'charcoal grey, lemon yellow and white', background: 'light grey' },
];

function pickPalette(): Palette {
  return PALETTES[Math.floor(Math.random() * PALETTES.length)] ?? DEFAULT_PALETTE;
}

/**
 * The scene goes straight into the FLUX prompt, and FLUX draws whatever it
 * reads: "a sign", "a book", even "no letters" all come back as lettering. So
 * Claude is told to steer clear of writing-bearing objects and to never name
 * writing at all, rather than the image prompt trying to forbid it. The same
 * logic keeps women out of the style text: the scene names every character
 * explicitly, so a woman only reaches the prompt when the meaning needs one,
 * already described in a hijab.
 */
const SCENE_INSTRUCTION = [
  'You describe the picture on an Arabic vocabulary flashcard. An illustrator will draw',
  'exactly what you write, and a learner should be able to guess the meaning from the picture',
  'alone.',
  '',
  'Describe one concrete moment that shows the meaning unmistakably:',
  '- Verbs: a man or boy caught in the middle of doing the action, with a clear pose and',
  '  whatever he acts on. For an abstract verb, pick the everyday situation where the action',
  '  is most visible, and show its effect on another person or thing.',
  '- Nouns: the thing itself, in a setting that makes it recognisable. For an abstract noun,',
  '  people in the situation that embodies it.',
  '- Adjectives: a person or thing that plainly has the quality, ideally beside a contrast.',
  '- Phrases and expressions: the social moment where someone would say it, carried by',
  '  posture and gesture.',
  'When the meaning lists several senses, draw the most picturable one, using the Arabic word',
  'to tell which sense is meant. Show an animal only when the word itself is an animal.',
  '',
  'Characters:',
  '- Every character is a man or a boy, and you say so ("a man", "a boy", "two men"), never',
  '  "a person", "someone" or "people".',
  '- Include a woman or girl only when the meaning cannot be shown without one (sister,',
  '  mother, bride, speaking to a woman). Describe her wearing a hijab that covers all of her',
  '  hair, and a long loose dress or abaya.',
  '- Every character is drawn with a blank face, so feelings must come through posture and',
  '  gesture: shoulders, arms, hands, head tilt, how they stand or sit. Never describe eyes,',
  '  mouths, smiles, frowns, tears or any other facial expression.',
  '',
  'Colours:',
  '- Name the colour of each main thing: clothes, key objects, furniture, walls.',
  '- Anything with a well-known natural colour keeps it (a yellow banana, a green tree, a blue',
  '  sky, brown bread).',
  '- Take every other colour from the palette given below, so the picture feels bright and',
  '  varied rather than brown and beige.',
  '',
  'Keep it simple: one or two characters, a few props, a hint of setting, in under 45 words of',
  'plain visual description in the present tense, written to follow "an illustration of" (so',
  'it starts like "a boy kneeling..."). Describe only what is seen, never the word or its',
  'meaning.',
  '',
  'Leave out every object that carries lettering or numbers: books, pages, paper, signs,',
  'screens, labels, packaging, posters, clocks, calendars, flags, speech bubbles. When the',
  'action truly needs one, show it from the back or edge-on. Do not mention text, letters,',
  'words or writing in any form, not even to say there are none, because the illustrator',
  'draws every noun you use.',
  '',
  `Call ${SCENE_TOOL_NAME} exactly once.`,
].join('\n');

const SCENE_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scene'],
  properties: {
    scene: { type: 'string' },
  },
} as const;

function sceneRequest(
  card: CardRecord,
  palette: Palette,
  rejectedNotes: readonly string[],
): string {
  const lines = [SCENE_INSTRUCTION, ''];
  const arabic = (card.fields.arabic ?? card.fields.past)?.trim();
  if (arabic) {
    lines.push(`Arabic: ${arabic}`);
  }
  lines.push(
    `Kind: ${KIND_LABELS[card.type]}`,
    `Meaning: ${card.meaning.trim()}`,
    `Palette: ${palette.colours}`,
  );
  if (rejectedNotes.length > 0) {
    lines.push(
      '',
      'Earlier pictures for this card had to be thrown away',
      `(${rejectedNotes.join('; ')}). Choose a scene that avoids whatever caused that: leave out`,
      'the objects that carried lettering, and use men or boys wherever a woman is not essential.',
    );
  }
  return lines.join('\n');
}

/**
 * The style never names writing or women, for the same FLUX reason as the
 * scene: whatever it reads, it draws. It states the wanted result positively
 * instead (plain surfaces, featureless faces). Characters and poses are called
 * for explicitly because the old "one central subject, rounded shapes" wording
 * turned most verbs into coloured blobs.
 */
function buildPrompt(scene: string, palette: Palette): string {
  return [
    `A friendly, colourful flat vector illustration of ${scene}.`,
    'Faceless characters in a minimalist faceless illustration style: every face is a smooth,',
    'blank, featureless shape of plain skin tone, and feelings come across through posture,',
    'gesture and body language alone. Modest, loose clothing, a few supporting props and a',
    'light hint of setting.',
    `Bright, fresh colours led by ${palette.colours}, with soft shading, on a clean`,
    `${palette.background} background. Every surface is plain and smooth.`,
  ].join(' ');
}

/** Used when no scene could be written, so the card still gets a picture. */
function fallbackScene(card: CardRecord): string {
  if (card.type === 'verb') {
    return `a man in the middle of the action ${card.meaning.trim()}`;
  }
  return `a clear everyday moment showing ${card.meaning.trim()}`;
}

const CHECK_INSTRUCTION = [
  'Check this flashcard illustration against three rules.',
  '',
  '1. hasWriting: any part of the picture shows writing. Writing means real words, single',
  'letters or numerals, characters from any alphabet or script, a signature or monogram, a',
  'logotype, a watermark, and also fake or garbled letter-like squiggles that merely imitate',
  'writing without spelling anything. Marks that clearly are not writing (a plain line, a row',
  'of dots, a stripe, a geometric pattern) do not count.',
  '',
  '2. hasFacialFeatures: any person has anything drawn on the face. Every face must be',
  'completely blank. Eyes of any kind (dots, circles, closed-eye curves), eyebrows, a nose, a',
  'mouth, teeth or cheek blush all count. Hair, beards, head coverings and the outline of the',
  'head do not.',
  '',
  '3. hasUncoveredFemale: any woman or girl shows her hair. Every female character must wear',
  'a hijab or headscarf that covers all of her hair. Judge by the whole figure (dress, long',
  'hair, earrings, hair ties), not only the face.',
  '',
  'When you are unsure whether something breaks a rule, answer that it does.',
  '',
  `Call ${CHECK_TOOL_NAME} exactly once. Keep "note" to a few words naming each problem and`,
  'where it is (e.g. "eyes on the boy; woman at left without headscarf"), or "none" when the',
  'picture is clean.',
].join('\n');

const CHECK_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hasWriting', 'hasFacialFeatures', 'hasUncoveredFemale', 'note'],
  properties: {
    hasWriting: { type: 'boolean' },
    hasFacialFeatures: { type: 'boolean' },
    hasUncoveredFemale: { type: 'boolean' },
    note: { type: 'string' },
  },
} as const;

function breaksARule(check: CheckResult): boolean {
  return check.hasWriting || check.hasFacialFeatures || check.hasUncoveredFemale;
}

function mapFalError(status: number): HttpError {
  if (status === 401 || status === 403) {
    return new HttpError('The image service rejected the API key. Update the FAL_KEY secret.', 500);
  }
  if (status === 429) {
    return new HttpError('The image service is busy right now. Wait a minute and try again.', 503);
  }
  return new HttpError("Couldn't generate an image. Try again.", 502);
}

async function generateImage(prompt: string): Promise<GeneratedImage> {
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
        prompt,
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

interface ClaudeToolCall {
  /** Names the call in logs, e.g. "image check". */
  label: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  tool: { name: string; description: string; input_schema: unknown };
  content: unknown[];
}

/**
 * Runs one forced tool call and returns the tool input, or null when the call
 * could not run at all (no key, upstream error, unexpected shape). Every null
 * is logged so a silently broken step is visible; callers decide what a null
 * means for them.
 */
async function callClaudeTool(call: ClaudeToolCall): Promise<unknown> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error(`generate-card-image: ANTHROPIC_API_KEY missing, skipping ${call.label}`);
    return null;
  }
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
          model: call.model,
          max_tokens: call.maxTokens,
          tools: [call.tool],
          tool_choice: { type: 'tool', name: call.tool.name },
          messages: [{ role: 'user', content: call.content }],
        }),
      },
      call.timeoutMs,
      new HttpError(`The ${call.label} took too long.`, 504),
    );
    if (!response.ok) {
      console.error(`generate-card-image: ${call.label} rejected`, {
        status: response.status,
        body: await response.text(),
      });
      return null;
    }
    const message = anthropicMessageSchema.safeParse(await response.json());
    if (!message.success) {
      console.error(`generate-card-image: unexpected ${call.label} response`, message.error);
      return null;
    }
    for (const block of message.data.content) {
      const toolUse = toolUseBlockSchema.safeParse(block);
      if (toolUse.success) {
        return toolUse.data.input;
      }
    }
    console.error(`generate-card-image: no tool_use block in ${call.label} response`);
    return null;
  } catch (error) {
    console.error(`generate-card-image: ${call.label} failed`, error);
    return null;
  }
}

/**
 * Asks Claude for the concrete moment to draw. Returns null when no scene
 * could be written; the caller then falls back to a plain scene built from the
 * meaning, because a card with a weaker picture beats a card with none.
 */
async function writeScene(
  card: CardRecord,
  palette: Palette,
  rejectedNotes: readonly string[],
): Promise<string | null> {
  const input = await callClaudeTool({
    label: 'scene writer',
    model: Deno.env.get('IMAGE_SCENE_MODEL') ?? DEFAULT_SCENE_MODEL,
    maxTokens: 400,
    timeoutMs: SCENE_TIMEOUT_MS,
    tool: {
      name: SCENE_TOOL_NAME,
      description: 'Give the one scene the illustrator should draw for this flashcard.',
      input_schema: SCENE_TOOL_SCHEMA,
    },
    content: [{ type: 'text', text: sceneRequest(card, palette, rejectedNotes) }],
  });
  if (input === null) {
    return null;
  }
  const result = sceneResultSchema.safeParse(input);
  if (!result.success) {
    console.error('generate-card-image: scene writer tool input invalid', result.error);
    return null;
  }
  return result.data.scene.replace(/\.+$/, '');
}

/**
 * Asks Claude whether the picture breaks any card-image rule (writing, faces,
 * an uncovered woman). Returns null when the check could not run: the caller
 * then keeps the image rather than leaving the card blank, because an
 * unverified picture from the current prompt is still the normal case, not a
 * failure.
 */
async function checkImage(image: GeneratedImage): Promise<CheckResult | null> {
  const input = await callClaudeTool({
    label: 'image check',
    model: Deno.env.get('IMAGE_CHECK_MODEL') ?? DEFAULT_CHECK_MODEL,
    maxTokens: 256,
    timeoutMs: CHECK_TIMEOUT_MS,
    tool: {
      name: CHECK_TOOL_NAME,
      description: 'Report which card-image rules the illustration breaks.',
      input_schema: CHECK_TOOL_SCHEMA,
    },
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
  });
  if (input === null) {
    return null;
  }
  const result = checkResultSchema.safeParse(input);
  if (!result.success) {
    console.error('generate-card-image: image check tool input invalid', result.error);
    return null;
  }
  return result.data;
}

/**
 * Generates until the picture passes the check. FLUX adds lettering and facial
 * features often enough that the prompt alone cannot guarantee a clean image,
 * so every attempt is checked and a failing one is thrown away. Each retry asks
 * for a fresh scene and tells the scene writer what went wrong last time, so
 * the next picture drops the object that carried lettering or swaps a woman
 * for a man instead of re-rolling the same composition. fal.ai failures
 * propagate immediately: only a broken rule drives a retry.
 */
async function generateCleanImage(card: CardRecord): Promise<GeneratedImage> {
  const palette = pickPalette();
  const rejectedNotes: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const scene = (await writeScene(card, palette, rejectedNotes)) ?? fallbackScene(card);
    const image = await generateImage(buildPrompt(scene, palette));
    const check = await checkImage(image);
    if (!check || !breaksARule(check)) {
      return image;
    }
    console.warn('generate-card-image: discarded an image that broke a rule', {
      attempt,
      scene,
      check,
    });
    rejectedNotes.push(check.note);
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
    .select('id, type, meaning, fields')
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
    const image = await generateCleanImage(card.data);
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
