import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { invalidateCardImageUrl } from '@/features/library/query-invalidation';
import { useTheme } from '@/hooks/use-theme';
import { generateCardImage } from '@/lib/api';

const ICON_SIZE = 18;
/** Transparent room around the icon so the target is finger sized without drawing a button. */
const TOUCH_PADDING = Spacing.two;

export interface RefreshImageButtonProps {
  cardId: string;
  /** The deck's tap gesture. This one blocks it, so pressing the icon never flips the card. */
  deckTapGesture: GestureType;
}

/** Corner of the card back: replaces the card's picture with a freshly generated one. */
export function RefreshImageButton({ cardId, deckTapGesture }: RefreshImageButtonProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [pressed, setPressed] = useState(false);

  const regenerate = useMutation({
    mutationFn: () => generateCardImage(cardId),
    // A new picture overwrites the same storage path, so only a fresh signed URL shows it.
    onSuccess: (result) => invalidateCardImageUrl(queryClient, result.path),
  });

  const replaceImage = () => {
    if (regenerate.isPending) {
      return;
    }
    regenerate.mutate();
  };

  const tap = Gesture.Tap()
    // The callbacks read React state and the mutation, so they belong on the JS thread.
    .runOnJS(true)
    .maxDuration(300)
    .blocksExternalGesture(deckTapGesture)
    .onBegin(() => {
      setPressed(true);
    })
    .onFinalize(() => {
      setPressed(false);
    })
    .onEnd((_event, success) => {
      if (success) {
        replaceImage();
      }
    });

  return (
    <>
      <GestureDetector gesture={tap}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Make a new picture"
          accessibilityState={{ busy: regenerate.isPending }}
          // VoiceOver activation never reaches the gesture handler.
          onAccessibilityTap={replaceImage}
          style={[styles.corner, { opacity: pressed ? 0.4 : 1 }]}
        >
          {regenerate.isPending ? (
            <ActivityIndicator size="small" color={theme.textSecondary} />
          ) : (
            <SymbolView name="arrow.clockwise" size={ICON_SIZE} tintColor={theme.textSecondary} />
          )}
        </View>
      </GestureDetector>
      {regenerate.isError && (
        <ThemedText type="small" themeColor="danger" style={styles.error}>
          {regenerate.error.message}
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    top: -TOUCH_PADDING,
    right: -TOUCH_PADDING,
    padding: TOUCH_PADDING,
  },
  error: {
    textAlign: 'center',
  },
});
