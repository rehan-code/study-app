import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FIELD_LABELS, type Card } from '@/domain/cards';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { updateCardContent } from '@/lib/queries';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import {
  describeCardDraftProblem,
  draftFromCard,
  draftToCardFields,
  isDraftDirty,
  validateCardDraft,
  type CardDraft,
} from '@/features/library/card-draft';
import { invalidateAllCardQueries } from '@/features/library/query-invalidation';
import { Section } from '@/features/library/section';

const NOTE_FIELD_KEY = 'note';

export function CardContentSection({ card }: { card: Card }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CardDraft | null>(null);

  const baseline = useMemo(() => draftFromCard(card), [card]);
  const working = draft ?? baseline;
  const dirty = draft !== null && isDraftDirty(card, draft);
  const problem = validateCardDraft(card.type, working);

  const saveMutation = useMutation({
    mutationFn: async (input: CardDraft) => {
      const currentProblem = validateCardDraft(card.type, input);
      if (currentProblem !== null) {
        throw new Error(describeCardDraftProblem(currentProblem));
      }
      await updateCardContent(card.id, draftToCardFields(card.type, input), input.meaning.trim());
    },
    onSuccess: async () => {
      // Refetch before dropping the draft so the fields never flash stale values.
      await invalidateAllCardQueries(queryClient);
      setDraft(null);
    },
  });

  const edit = (next: CardDraft) => {
    if (saveMutation.isError) {
      saveMutation.reset();
    }
    setDraft(next);
  };

  return (
    <Section title="Content">
      <View style={styles.column}>
        {FIELD_LABELS[card.type].map((def) => (
          <TextField
            key={def.key}
            label={`${def.label} (${def.labelArabic})`}
            value={working.fields[def.key] ?? ''}
            onChangeText={(text) => {
              edit({ ...working, fields: { ...working.fields, [def.key]: text } });
            }}
            rtl={def.key !== NOTE_FIELD_KEY}
            multiline={def.key === NOTE_FIELD_KEY}
          />
        ))}
        <TextField
          label="Meaning"
          value={working.meaning}
          onChangeText={(text) => {
            edit({ ...working, meaning: text });
          }}
        />
        {dirty && problem !== null && (
          <Text style={[styles.hint, { color: theme.danger }]}>
            {describeCardDraftProblem(problem)}
          </Text>
        )}
        {saveMutation.isError && (
          <Text style={[styles.hint, { color: theme.danger }]}>{saveMutation.error.message}</Text>
        )}
        {dirty && (
          <Button
            label="Save changes"
            onPress={() => {
              saveMutation.mutate(working);
            }}
            loading={saveMutation.isPending}
            disabled={problem !== null}
            fullWidth
          />
        )}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  column: {
    gap: Spacing.three,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
});
