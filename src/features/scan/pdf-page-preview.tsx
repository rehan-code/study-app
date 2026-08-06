import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { renderPdfPage } from '@/lib/pdf-preview';

/** Enough for a book page on any iPhone without spending seconds on the draw. */
const MAX_RENDER_WIDTH = 1400;

export interface PdfPagePreviewProps {
  localUri: string;
  /** 1-based, as printed in the PDF's own page numbering. */
  page: number;
}

/**
 * One rendered page of a local PDF. Paging keeps the previous image on screen
 * while the next one draws, so flicking through a book does not strobe.
 */
export function PdfPagePreview({ localUri, page }: PdfPagePreviewProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const renderWidth = Math.min(MAX_RENDER_WIDTH, Math.round(width * PixelRatio.get()));

  const { data, isFetching, isError, error } = useQuery({
    queryKey: ['pdf-page', localUri, page, renderWidth],
    queryFn: () => renderPdfPage(localUri, page, renderWidth),
    enabled: renderWidth > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.frame,
        { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
      ]}
    >
      {data !== undefined && (
        <Image source={{ uri: data }} style={styles.page} contentFit="contain" transition={120} />
      )}
      {isError && (
        <View style={styles.center}>
          <SymbolView name="doc.questionmark" size={28} tintColor={theme.textSecondary} />
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            {error instanceof Error ? error.message : `Couldn't show page ${page}.`}
          </Text>
        </View>
      )}
      {isFetching && (
        <View style={styles.spinner}>
          <ActivityIndicator color={theme.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  page: {
    flex: 1,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  spinner: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
    textAlign: 'center',
  },
});
