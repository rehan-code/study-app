import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cardHeadline, type Card } from '@/domain/cards';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ArabicText } from '@/components/arabic-text';
import { Badge } from '@/components/badge';

export interface CardListRowProps {
  card: Card;
  due: boolean;
  onPress: () => void;
}

/** A tappable card row: Arabic headline, meaning subtitle, and a due badge. */
export function CardListRow({ card, due, onPress }: CardListRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' },
      ]}
    >
      <View style={styles.textColumn}>
        <ArabicText variant="compact" align="left" numberOfLines={1}>
          {cardHeadline(card)}
        </ArabicText>
        <Text style={[styles.meaning, { color: theme.textSecondary }]} numberOfLines={1}>
          {card.meaning}
        </Text>
      </View>
      {due && <Badge label="Due" tone="accent" />}
      <SymbolView
        name="chevron.right"
        size={14}
        weight="semibold"
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  textColumn: {
    flex: 1,
  },
  meaning: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 500,
  },
});
