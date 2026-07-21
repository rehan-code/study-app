import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image as RNImage,
  Modal,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Spacing } from '@/constants/theme';
import {
  fitContain,
  fullRect,
  isNearlyFullRect,
  moveRect,
  resizeRect,
  scaleRect,
  usableSize,
  type CropCorner,
  type CropRect,
  type Size,
} from '@/features/scan/crop-geometry';
import { applyCropToPhoto, cropSourceOf, uncroppedPhotoFrom } from '@/features/scan/crop-photo';
import type { ScanPhoto } from '@/features/scan/photo-selection';
import { useTheme } from '@/hooks/use-theme';

const MIN_CROP_SIDE = 56;
const FULL_RECT_TOLERANCE = 2;
const HANDLE_HIT = 44;
const HANDLE_DOT = 18;
const CORNERS: readonly CropCorner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

type LoadState =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; sourceSize: Size };

interface DragState {
  rect: CropRect;
  pageX: number;
  pageY: number;
}

interface CropDragViewProps {
  mode: 'move' | CropCorner;
  rect: CropRect;
  bounds: Size;
  onChange: (next: CropRect) => void;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/** A view that moves or corner-resizes the crop rect as the finger drags. */
function CropDragView({
  mode,
  rect,
  bounds,
  onChange,
  style,
  children,
  accessibilityLabel,
  accessibilityHint,
}: CropDragViewProps) {
  const dragRef = useRef<DragState | null>(null);

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        dragRef.current = {
          rect,
          pageX: event.nativeEvent.pageX,
          pageY: event.nativeEvent.pageY,
        };
      }}
      onResponderMove={(event) => {
        const drag = dragRef.current;
        if (drag === null) {
          return;
        }
        const dx = event.nativeEvent.pageX - drag.pageX;
        const dy = event.nativeEvent.pageY - drag.pageY;
        if (mode === 'move') {
          onChange(moveRect(drag.rect, dx, dy, bounds));
        } else {
          onChange(resizeRect(drag.rect, mode, dx, dy, bounds, MIN_CROP_SIDE));
        }
      }}
      onResponderRelease={() => {
        dragRef.current = null;
      }}
      style={style}
    >
      {children}
    </View>
  );
}

export interface PhotoCropEditorProps {
  photo: ScanPhoto;
  /** Called with the updated photo; the parent closes the editor. */
  onDone: (photo: ScanPhoto) => void;
  onCancel: () => void;
}

/**
 * Full-screen crop editor. The crop rect lives in source pixel coordinates
 * (null means the full image); the on-screen rect is derived per render, so
 * layout changes never invalidate an in-progress crop.
 */
export function PhotoCropEditor({ photo, onDone, onCancel }: PhotoCropEditorProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const source = cropSourceOf(photo);
  const hasPickerSize = usableSize({ width: source.width ?? 0, height: source.height ?? 0 });

  const [load, setLoad] = useState<LoadState>(() =>
    hasPickerSize
      ? { status: 'ready', sourceSize: { width: source.width ?? 0, height: source.height ?? 0 } }
      : { status: 'loading' },
  );
  const [containerSize, setContainerSize] = useState<Size>({ width: 0, height: 0 });
  const [cropRect, setCropRect] = useState<CropRect | null>(photo.cropRect ?? null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (hasPickerSize || load.status !== 'loading') {
      return;
    }
    let cancelled = false;
    RNImage.getSize(
      source.uri,
      (width, height) => {
        if (cancelled) {
          return;
        }
        if (usableSize({ width, height })) {
          setLoad({ status: 'ready', sourceSize: { width, height } });
        } else {
          setLoad({ status: 'error' });
        }
      },
      () => {
        if (!cancelled) {
          setLoad({ status: 'error' });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasPickerSize, load.status, source.uri]);

  const sourceSize = load.status === 'ready' ? load.sourceSize : null;
  const displaySize = sourceSize === null ? null : fitContain(sourceSize, containerSize);
  const cropReady = sourceSize !== null && displaySize !== null && usableSize(displaySize);
  const displayRect = !cropReady
    ? null
    : cropRect === null
      ? fullRect(displaySize)
      : scaleRect(cropRect, sourceSize, displaySize);

  const handleRectChange = (next: CropRect) => {
    if (!cropReady) {
      return;
    }
    setCropRect(scaleRect(next, displaySize, sourceSize));
  };

  const handleCanvasLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const handleApply = () => {
    if (sourceSize === null || displayRect === null || displaySize === null || applying) {
      return;
    }
    if (cropRect === null || isNearlyFullRect(displayRect, displaySize, FULL_RECT_TOLERANCE)) {
      onDone(uncroppedPhotoFrom(photo, sourceSize));
      return;
    }
    setApplying(true);
    setApplyError(null);
    void (async () => {
      try {
        onDone(await applyCropToPhoto(photo, cropRect, sourceSize));
      } catch {
        setApplyError("Couldn't crop the photo. Please try again.");
        setApplying(false);
      }
    })();
  };

  const cornerStyles: Record<CropCorner, object> = {
    topLeft: { left: -HANDLE_HIT / 2, top: -HANDLE_HIT / 2 },
    topRight: { right: -HANDLE_HIT / 2, top: -HANDLE_HIT / 2 },
    bottomLeft: { left: -HANDLE_HIT / 2, bottom: -HANDLE_HIT / 2 },
    bottomRight: { right: -HANDLE_HIT / 2, bottom: -HANDLE_HIT / 2 },
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top,
            paddingBottom: insets.bottom + Spacing.three,
          },
        ]}
      >
        <View style={styles.header}>
          <IconButton icon="xmark" accessibilityLabel="Cancel crop" onPress={onCancel} />
          <Text style={[styles.title, { color: theme.text }]}>Crop photo</Text>
          <Button
            label="Reset"
            variant="ghost"
            disabled={!cropReady || applying}
            onPress={() => {
              setCropRect(null);
            }}
          />
        </View>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Drag the corners so only the page fills the frame.
        </Text>
        <View style={styles.canvas} onLayout={handleCanvasLayout}>
          {load.status === 'loading' && <ActivityIndicator color={theme.textSecondary} />}
          {load.status === 'error' && (
            <View style={styles.errorBox}>
              <Text style={[styles.errorText, { color: theme.textSecondary }]}>
                {"Couldn't load this photo."}
              </Text>
              <Button
                label="Try again"
                variant="secondary"
                onPress={() => {
                  setLoad({ status: 'loading' });
                }}
              />
            </View>
          )}
          {displayRect !== null && displaySize !== null && (
            <View style={{ width: displaySize.width, height: displaySize.height }}>
              <Image
                source={{ uri: source.uri }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              <View
                pointerEvents="none"
                style={[styles.dim, { left: 0, right: 0, top: 0, height: displayRect.y }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.dim,
                  { left: 0, right: 0, top: displayRect.y + displayRect.height, bottom: 0 },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.dim,
                  { left: 0, top: displayRect.y, width: displayRect.x, height: displayRect.height },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.dim,
                  {
                    left: displayRect.x + displayRect.width,
                    right: 0,
                    top: displayRect.y,
                    height: displayRect.height,
                  },
                ]}
              />
              <CropDragView
                mode="move"
                rect={displayRect}
                bounds={displaySize}
                onChange={handleRectChange}
                accessibilityLabel="Crop area"
                accessibilityHint="Drag to move the crop area"
                style={[
                  styles.cropBox,
                  {
                    left: displayRect.x,
                    top: displayRect.y,
                    width: displayRect.width,
                    height: displayRect.height,
                  },
                ]}
              >
                {CORNERS.map((corner) => (
                  <CropDragView
                    key={corner}
                    mode={corner}
                    rect={displayRect}
                    bounds={displaySize}
                    onChange={handleRectChange}
                    style={[styles.cornerHit, cornerStyles[corner]]}
                  >
                    <View style={styles.cornerDot} />
                  </CropDragView>
                ))}
              </CropDragView>
            </View>
          )}
        </View>
        <View style={styles.footer}>
          {applyError !== null && (
            <Text style={[styles.errorText, { color: theme.danger }]}>{applyError}</Text>
          )}
          <Button
            label="Use crop"
            fullWidth
            size="lg"
            loading={applying}
            disabled={!cropReady}
            onPress={handleApply}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.two,
  },
  title: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
  },
  hint: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 500,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  canvas: {
    flex: 1,
    margin: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  cornerHit: {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerDot: {
    width: HANDLE_DOT,
    height: HANDLE_DOT,
    borderRadius: HANDLE_DOT / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.25)',
  },
  errorBox: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
});
