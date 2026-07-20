import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import type { Card } from '@/domain/cards';
import { MAX_BOX } from '@/domain/srs';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resetCardProgress } from '@/lib/queries';

import { Button } from '@/components/button';
import { invalidateAllCardQueries } from '@/features/library/query-invalidation';
import { describeNextReview } from '@/features/library/relative-time';
import { Section } from '@/features/library/section';

function StatRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

export function CardProgressSection({ card }: { card: Card }) {
  const queryClient = useQueryClient();

  const nextReview = useMemo(() => describeNextReview(card.srs.dueAt, new Date()), [card]);

  const resetMutation = useMutation({
    mutationFn: () => resetCardProgress(card.id),
    onSuccess: () => invalidateAllCardQueries(queryClient),
    onError: (error) => {
      Alert.alert("Couldn't reset this card", error.message);
    },
  });

  const confirmReset = () => {
    Alert.alert('Reset progress?', 'This card starts over like a new word.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetMutation.mutate();
        },
      },
    ]);
  };

  return (
    <Section title="Progress">
      <View style={styles.column}>
        <StatRow label="Level" value={`${card.srs.box} of ${MAX_BOX}`} />
        <StatRow label="Next review" value={nextReview} />
        <StatRow label="Got it" value={`${card.srs.correctCount}`} />
        <StatRow label="Not yet" value={`${card.srs.incorrectCount}`} />
        <Button
          label="Reset progress"
          variant="danger"
          onPress={confirmReset}
          loading={resetMutation.isPending}
          fullWidth
        />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.three,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  statLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
  },
  statValue: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 600,
    fontVariant: ['tabular-nums'],
  },
});
