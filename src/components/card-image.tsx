import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getSignedUrl, queryKeys } from '@/lib/queries';

const SIGNED_URL_STALE_MS = 45 * 60 * 1000;
const DEFAULT_HEIGHT = 180;

export interface CardImageProps {
  bucket: 'scans' | 'card-images';
  path: string;
  height?: number;
  /** Width becomes height * aspectRatio, centered, instead of filling the container. */
  aspectRatio?: number;
}

export function CardImage({ bucket, path, height = DEFAULT_HEIGHT, aspectRatio }: CardImageProps) {
  const theme = useTheme();
  const frameSize =
    aspectRatio === undefined
      ? ({ height, width: '100%' } as const)
      : ({ height, aspectRatio, alignSelf: 'center' } as const);
  // Remembering which URL failed (instead of a boolean) self-resets the
  // fallback when the signed URL refreshes or the path changes.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const {
    data: url,
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.signedUrl(bucket, path),
    queryFn: () => getSignedUrl(bucket, path),
    staleTime: SIGNED_URL_STALE_MS,
  });

  if (isPending) {
    return (
      <View style={[styles.frame, frameSize, { backgroundColor: theme.backgroundSelected }]} />
    );
  }

  if (isError || url === undefined || url === failedUrl) {
    return (
      <View
        style={[
          styles.frame,
          styles.center,
          frameSize,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <SymbolView name="photo" size={28} tintColor={theme.textSecondary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[styles.frame, frameSize]}
      contentFit="cover"
      transition={200}
      onError={() => {
        setFailedUrl(url);
      }}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
