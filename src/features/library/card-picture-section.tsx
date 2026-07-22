import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Switch, Text, View } from 'react-native';

import type { Card } from '@/domain/cards';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { generateCardImage } from '@/lib/api';
import { setCardImageEnabled } from '@/lib/queries';
import { useSettings } from '@/lib/stores';

import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import {
  CARD_IMAGES_BUCKET,
  invalidateAllCardQueries,
  invalidateCardImageUrl,
} from '@/features/library/query-invalidation';
import { Section } from '@/features/library/section';

const PREVIEW_HEIGHT = 200;

export function CardPictureSection({ card }: { card: Card }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const aiImagesEnabled = useSettings((state) => state.aiImagesEnabled);

  const generateMutation = useMutation({
    mutationFn: () => generateCardImage(card.id),
    onSuccess: async ({ path }) => {
      // Regeneration reuses the same storage path, so the signed URL must refresh too.
      await Promise.all([
        invalidateAllCardQueries(queryClient),
        invalidateCardImageUrl(queryClient, path),
      ]);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => setCardImageEnabled(card.id, enabled),
    onSuccess: () => invalidateAllCardQueries(queryClient),
  });

  if (!aiImagesEnabled) {
    return null;
  }

  const hasImage = card.aiImagePath !== null;
  const shownEnabled = toggleMutation.isPending ? toggleMutation.variables : card.imageEnabled;

  return (
    <Section title="Picture">
      <View style={styles.column}>
        {card.aiImagePath !== null && (
          <CardImage
            bucket={CARD_IMAGES_BUCKET}
            path={card.aiImagePath}
            height={PREVIEW_HEIGHT}
            aspectRatio={4 / 3}
          />
        )}
        {generateMutation.isError && (
          <Text style={[styles.error, { color: theme.danger }]}>
            {generateMutation.error.message}
          </Text>
        )}
        <Button
          label={hasImage ? 'Make a new picture' : 'Generate picture'}
          icon="sparkles"
          variant="secondary"
          onPress={() => {
            generateMutation.mutate();
          }}
          loading={generateMutation.isPending}
          fullWidth
        />
        {hasImage && (
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: theme.text }]}>
              Show picture while studying
            </Text>
            <Switch
              value={shownEnabled}
              onValueChange={(next) => {
                toggleMutation.mutate(next);
              }}
              disabled={toggleMutation.isPending}
              trackColor={{ true: theme.primary }}
            />
          </View>
        )}
        {toggleMutation.isError && (
          <Text style={[styles.error, { color: theme.danger }]}>
            {toggleMutation.error.message}
          </Text>
        )}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  switchLabel: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 500,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
});
