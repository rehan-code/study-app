import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SessionCompleteProps {
  summary: { gotIt: number; notYet: number };
  canStudyAgain: boolean;
  rebuilding: boolean;
  onStudyAgain: () => void;
  onDone: () => void;
}

function SummaryStat({ value, label, color }: { value: number; label: string; color: ThemeColor }) {
  return (
    <Surface style={styles.stat}>
      <ThemedText type="subtitle" themeColor={color} style={styles.statValue}>
        {String(value)}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>
        {label}
      </ThemedText>
    </Surface>
  );
}

export function SessionComplete({
  summary,
  canStudyAgain,
  rebuilding,
  onStudyAgain,
  onDone,
}: SessionCompleteProps) {
  const theme = useTheme();
  const studied = summary.gotIt + summary.notYet;
  const message =
    summary.notYet === 0
      ? `All ${studied === 1 ? 'card' : `${studied} cards`} down. See you next time.`
      : `You went through ${studied === 1 ? '1 card' : `${studied} cards`}.`;

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: theme.primarySoft }]}>
          <SymbolView name="party.popper" size={30} tintColor={theme.primary} />
        </View>
        <ThemedText type="subtitle" style={styles.centered}>
          Nice work!
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.centered}>
          {message}
        </ThemedText>
        <View style={styles.statsRow}>
          <SummaryStat value={summary.gotIt} label="Got it" color="success" />
          <SummaryStat value={summary.notYet} label="To review" color="accent" />
        </View>
      </View>
      <View style={styles.actions}>
        {canStudyAgain && (
          <Button
            label="Study again"
            onPress={onStudyAgain}
            variant="primary"
            size="lg"
            fullWidth
            loading={rebuilding}
            icon="arrow.uturn.backward"
          />
        )}
        <Button
          label="Done"
          onPress={onDone}
          variant={canStudyAgain ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          disabled={rebuilding}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    textAlign: 'center',
  },
  statLabel: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
});
