import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Radius, Spacing } from '@/constants/theme';
import type { DraftCorrection } from '@/domain/scan-review';
import { correctionChoice, type CorrectionChoice } from '@/features/scan/review-drafts';
import { useTheme } from '@/hooks/use-theme';

export interface CorrectionOptionsProps {
  correction: DraftCorrection;
  value: string;
  onSelect: (value: string) => void;
}

interface OptionProps {
  label: string;
  arabic: string;
  selected: boolean;
  onPress: () => void;
}

function Option({ label, arabic, selected, onPress }: OptionProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}: ${arabic}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: selected ? theme.primarySoft : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <SymbolView
        name={selected ? 'checkmark.circle.fill' : 'circle'}
        size={18}
        tintColor={selected ? theme.primary : theme.textSecondary}
      />
      <View style={styles.optionText}>
        <Text
          style={[styles.optionLabel, { color: selected ? theme.primary : theme.textSecondary }]}
        >
          {label}
        </Text>
        <ArabicText variant="compact" align="right">
          {arabic}
        </ArabicText>
      </View>
    </Pressable>
  );
}

/**
 * Shown under a flagged field: the answer on the page looks wrong, so the user
 * picks between the checked correction (the default) and what was written.
 * Typing a custom value into the field above deselects both.
 */
export function CorrectionOptions({ correction, value, onSelect }: CorrectionOptionsProps) {
  const theme = useTheme();
  const choice: CorrectionChoice = correctionChoice(value, correction);

  return (
    <View style={[styles.container, { backgroundColor: theme.accentSoft }]}>
      <View style={styles.reasonRow}>
        <SymbolView name="exclamationmark.triangle" size={16} tintColor={theme.accent} />
        <Text style={[styles.reason, { color: theme.text }]}>{correction.reason}</Text>
      </View>
      <Option
        label="Suggested fix"
        arabic={correction.suggested}
        selected={choice === 'suggested'}
        onPress={() => {
          onSelect(correction.suggested);
        }}
      />
      <Option
        label="On the page"
        arabic={correction.scanned}
        selected={choice === 'scanned'}
        onPress={() => {
          onSelect(correction.scanned);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.md,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  reason: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  optionText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  optionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 600,
  },
});
