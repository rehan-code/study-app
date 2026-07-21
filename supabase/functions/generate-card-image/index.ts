import { z } from 'npm:zod@4';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { errorResponse, handleOptions, HttpError, jsonResponse } from '../_shared/http.ts';
import { clientFromRequest } from '../_shared/supabase.ts';

const DEFAULT_FAL_MODEL = 'fal-ai/flux/schnell';
const CARD_IMAGES_BUCKET = 'card-images';

const requestSchema = z.object({ cardId: z.uuid() });

const cardRecordSchema = z.object({
  id: z.string(),
  meaning: z.string(),
});

const falResponseSchema = z.object({
  images: z.array(z.object({ url: z.string() })).min(1),
});

function buildPrompt(meaning: string): string {
  return [
    `A charming minimalist flat illustration that visually depicts: "${meaning}".`,
    'Modern flat vector style with one clear central subject, simple rounded geometric shapes,',
    'a warm friendly palette of terracotta, amber, sage green and cream, soft ambient shadows,',
    'and a clean plain light background with generous negative space.',
    'Purely pictorial wordless imagery: absolutely no text, no letters, no numbers,',
    'no labels, no captions, no typography, no watermarks, no writing of any kind.',
  ].join(' ');
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

async function generateImageBytes(meaning: string): Promise<ArrayBuffer> {
  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) {
    throw new HttpError("Image generation isn't set up yet. Add the FAL_KEY secret.", 500);
  }
  const model = Deno.env.get('FAL_MODEL') ?? DEFAULT_FAL_MODEL;
  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: buildPrompt(meaning),
      image_size: 'square_hd',
      num_images: 1,
    }),
  });
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
  const imageResponse = await fetch(first.url);
  if (!imageResponse.ok) {
    console.error('generate-card-image: image download failed', { status: imageResponse.status });
    throw new HttpError("Couldn't download the generated image. Try again.", 502);
  }
  return await imageResponse.arrayBuffer();
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
    const imageBytes = await generateImageBytes(card.data.meaning);
    const path = `${userId}/${cardId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .upload(path, imageBytes, { contentType: 'image/jpeg', upsert: true });
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
