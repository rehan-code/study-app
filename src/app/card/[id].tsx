import { Redirect, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';

import { CardDetailScreen } from '@/features/library/card-detail-screen';

const paramsSchema = z.object({ id: z.string().min(1) });

export default function CardRoute() {
  const params = useLocalSearchParams();
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return <Redirect href="/" />;
  }
  return <CardDetailScreen cardId={parsed.data.id} />;
}
