import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { SubmitStage } from '@/features/scan/use-submit-scan';
import { useTheme } from '@/hooks/use-theme';

const STAGES: readonly { key: SubmitStage; label: string }[] = [
  { key: 'uploading', label: 'Uploading pages' },
  { key: 'reading', label: 'Reading your handwriting' },
  { key: 'building', label: 'Building your cards' },
];

export interface StagedProgressProps {
  stage: SubmitStage;
}

/** The three-step pipeline indicator shown while a scan uploads and parses. */
export function StagedProgress({ stage }: StagedProgressProps) {
  const theme = useTheme();
  const activeIndex = STAGES.findIndex((entry) => entry.key === stage);

  return (
    <View style={styles.container}>
      <View style={styles.stages}>
        {STAGES.map((entry, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <View key={entry.key} style={styles.stageRow}>
              <View style={styles.iconSlot}>
                {done ? (
                  <SymbolView name="checkmark.circle.fill" size={22} tintColor={theme.primary} />
                ) : active ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <SymbolView name="circle" size={22} tintColor={theme.border} />
                )}
              </View>
              <Text
                style={[
                  styles.stageLabel,
                  { color: active || done ? theme.text : theme.textSecondary },
                ]}
              >
                {entry.label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={[styles.note, { color: theme.textSecondary }]}>
        This can take up to a minute. Keep the app open.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.four,
  },
  stages: {
    gap: Spacing.three,
    alignSelf: 'center',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconSlot: {
    width: 26,
    alignItems: 'center',
  },
  stageLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
  },
});
