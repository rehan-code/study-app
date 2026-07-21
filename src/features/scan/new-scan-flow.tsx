import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { IconButton } from '@/components/icon-button';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { Radius, Spacing } from '@/constants/theme';
import type { ScanKind } from '@/domain/cards';
import { PhotoCropEditor } from '@/features/scan/photo-crop-editor';
import {
  addPhotos,
  MAX_SCAN_PAGES,
  pageLabelForIndex,
  remainingPhotoSlots,
  removePhotoAt,
  replacePhotoAt,
  swapPhotos,
  type ScanPhoto,
} from '@/features/scan/photo-selection';
import { SCAN_KIND_INFO, SCAN_KIND_INFOS, type ScanKindInfo } from '@/features/scan/scan-kind-info';
import { ScanScreenHeader } from '@/features/scan/scan-screen-header';
import { StagedProgress } from '@/features/scan/staged-progress';
import { useSubmitScan } from '@/features/scan/use-submit-scan';
import { useTheme } from '@/hooks/use-theme';

const PICKER_QUALITY = 1;

function KindStep({ onPick }: { onPick: (kind: ScanKind) => void }) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.stepContent}>
      <Text style={[styles.prompt, { color: theme.textSecondary }]}>
        What kind of page is this?
      </Text>
      {SCAN_KIND_INFOS.map((info: ScanKindInfo) => (
        <Pressable
          key={info.kind}
          accessibilityRole="button"
          accessibilityLabel={info.label}
          onPress={() => {
            onPick(info.kind);
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Surface style={styles.kindCard}>
            <View style={[styles.kindIcon, { backgroundColor: theme.primarySoft }]}>
              <SymbolView name={info.icon} size={22} tintColor={theme.primary} />
            </View>
            <View style={styles.kindText}>
              <Text style={[styles.kindTitle, { color: theme.text }]}>{info.label}</Text>
              <Text style={[styles.kindDescription, { color: theme.textSecondary }]}>
                {info.description}
              </Text>
            </View>
            <SymbolView
              name="chevron.right"
              size={13}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Surface>
        </Pressable>
      ))}
    </ScrollView>
  );
}

interface PhotosStepProps {
  info: ScanKindInfo;
  photos: readonly ScanPhoto[];
  onPhotosChange: (photos: ScanPhoto[]) => void;
  onSubmit: () => void;
}

function PhotosStep({ info, photos, onPhotosChange, onSubmit }: PhotosStepProps) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const remaining = remainingPhotoSlots(photos);
  const croppingPhoto = cropIndex === null ? undefined : photos[cropIndex];
  const pageLabels = info.pages.map((page) => page.label);

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access is off',
        'Allow camera access in Settings to photograph your workbook pages.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open Settings',
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: PICKER_QUALITY,
    });
    if (result.canceled) {
      return;
    }
    onPhotosChange(
      addPhotos(
        photos,
        result.assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        })),
      ),
    );
  };

  const pickFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: PICKER_QUALITY,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
      orderedSelection: true,
    });
    if (result.canceled) {
      return;
    }
    onPhotosChange(
      addPhotos(
        photos,
        result.assets.map((asset) => ({
          uri: asset.uri,
          width: asset.width,
          height: asset.height,
        })),
      ),
    );
  };

  const runPicker = (picker: () => Promise<void>) => {
    if (picking) {
      return;
    }
    setPicking(true);
    setPickerError(null);
    void picker()
      .catch(() => {
        setPickerError("Couldn't open the photo picker. Please try again.");
      })
      .finally(() => {
        setPicking(false);
      });
  };

  return (
    <View style={styles.stepRoot}>
      <ScrollView contentContainerStyle={styles.stepContent}>
        <Text style={[styles.prompt, { color: theme.textSecondary }]}>{info.photoHint}</Text>
        {photos.map((photo, index) => (
          <Surface key={`${photo.uri}-${index}`} padded={false} style={styles.photoCard}>
            <Image source={{ uri: photo.uri }} style={styles.photoImage} contentFit="cover" />
            <View style={styles.photoFooter}>
              <View style={styles.photoLabels}>
                <Text style={[styles.photoLabel, { color: theme.text }]}>
                  {pageLabelForIndex(index, pageLabels)}
                </Text>
                {info.pages[index] !== undefined && (
                  <Text style={[styles.photoHintText, { color: theme.textSecondary }]}>
                    {info.pages[index].hint}
                  </Text>
                )}
              </View>
              <View style={styles.photoActions}>
                <IconButton
                  icon="crop"
                  accessibilityLabel={`Crop ${pageLabelForIndex(index, pageLabels)}`}
                  size={16}
                  themeColor="textSecondary"
                  onPress={() => {
                    setCropIndex(index);
                  }}
                />
                <IconButton
                  icon="xmark"
                  accessibilityLabel={`Remove ${pageLabelForIndex(index, pageLabels)}`}
                  size={16}
                  themeColor="textSecondary"
                  onPress={() => {
                    onPhotosChange(removePhotoAt(photos, index));
                  }}
                />
              </View>
            </View>
          </Surface>
        ))}
        {photos.length === MAX_SCAN_PAGES && (
          <Button
            label="Swap pages"
            icon="arrow.up.arrow.down"
            variant="ghost"
            onPress={() => {
              onPhotosChange(swapPhotos(photos));
            }}
          />
        )}
        {remaining > 0 && (
          <View style={styles.pickButtons}>
            <Button
              label="Take photo"
              icon="camera"
              variant="secondary"
              disabled={picking}
              onPress={() => {
                runPicker(takePhoto);
              }}
            />
            <Button
              label="Choose photos"
              icon="photo.on.rectangle"
              variant="secondary"
              disabled={picking}
              onPress={() => {
                runPicker(pickFromLibrary);
              }}
            />
          </View>
        )}
        {pickerError !== null && (
          <Text style={[styles.pickerError, { color: theme.danger }]}>{pickerError}</Text>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Button
          label="Upload and read"
          fullWidth
          size="lg"
          disabled={photos.length === 0}
          onPress={onSubmit}
        />
      </View>
      {cropIndex !== null && croppingPhoto !== undefined && (
        <PhotoCropEditor
          photo={croppingPhoto}
          onCancel={() => {
            setCropIndex(null);
          }}
          onDone={(next) => {
            onPhotosChange(replacePhotoAt(photos, cropIndex, next));
            setCropIndex(null);
          }}
        />
      )}
    </View>
  );
}

interface SubmitFailedProps {
  message: string;
  canRetryParse: boolean;
  onRetry: () => void;
  onBackToPhotos: () => void;
}

function SubmitFailed({ message, canRetryParse, onRetry, onBackToPhotos }: SubmitFailedProps) {
  const theme = useTheme();

  return (
    <View style={styles.failedContainer}>
      <View style={[styles.failedIcon, { backgroundColor: theme.dangerSoft }]}>
        <SymbolView name="exclamationmark.triangle" size={26} tintColor={theme.danger} />
      </View>
      <Text style={[styles.failedTitle, { color: theme.text }]}>{"Couldn't read that page"}</Text>
      <Text style={[styles.failedMessage, { color: theme.textSecondary }]}>{message}</Text>
      {canRetryParse && (
        <Text style={[styles.failedMessage, { color: theme.textSecondary }]}>
          The scan is saved in your list, so you can also retry later.
        </Text>
      )}
      <View style={styles.failedActions}>
        <Button
          label={canRetryParse ? 'Try parsing again' : 'Try again'}
          onPress={onRetry}
          variant="secondary"
        />
        <Button label="Back to photos" onPress={onBackToPhotos} variant="ghost" />
      </View>
    </View>
  );
}

export function NewScanFlow() {
  const router = useRouter();
  const [kind, setKind] = useState<ScanKind | null>(null);
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const { state: submitState, submit, retryParse, reset } = useSubmitScan();

  const submitting = submitState.phase === 'running';
  const info = kind === null ? null : SCAN_KIND_INFO[kind];

  let title = 'New scan';
  if (info !== null) {
    title = info.label;
  }

  let onBack: (() => void) | undefined;
  if (submitState.phase === 'failed') {
    onBack = reset;
  } else if (submitState.phase === 'idle' && kind !== null) {
    onBack = () => {
      setKind(null);
    };
  } else if (submitState.phase === 'idle') {
    onBack = () => {
      router.back();
    };
  }

  const handleSubmit = () => {
    if (kind === null) {
      return;
    }
    submit(kind, photos);
  };

  const handleRetry = () => {
    if (submitState.phase !== 'failed') {
      return;
    }
    if (submitState.scanId !== null) {
      retryParse();
      return;
    }
    handleSubmit();
  };

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ gestureEnabled: !submitting }} />
      <ScanScreenHeader title={title} onBack={onBack} />
      {submitState.phase === 'running' ? (
        <StagedProgress stage={submitState.stage} />
      ) : submitState.phase === 'failed' ? (
        <SubmitFailed
          message={submitState.message}
          canRetryParse={submitState.scanId !== null}
          onRetry={handleRetry}
          onBackToPhotos={reset}
        />
      ) : kind === null || info === null ? (
        <KindStep onPick={setKind} />
      ) : (
        <PhotosStep
          info={info}
          photos={photos}
          onPhotosChange={setPhotos}
          onSubmit={handleSubmit}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepRoot: {
    flex: 1,
  },
  stepContent: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  prompt: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
  },
  kindCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  kindIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindText: {
    flex: 1,
    gap: Spacing.half,
  },
  kindTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: 600,
  },
  kindDescription: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: 500,
  },
  photoCard: {
    gap: 0,
  },
  photoImage: {
    width: '100%',
    height: 180,
  },
  photoFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
  },
  photoLabels: {
    flex: 1,
    gap: 2,
  },
  photoLabel: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 600,
  },
  photoHintText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  pickerError: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
    textAlign: 'center',
  },
  footer: {
    padding: Spacing.three,
  },
  failedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.two,
  },
  failedIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  failedTitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: 600,
    textAlign: 'center',
  },
  failedMessage: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
    textAlign: 'center',
  },
  failedActions: {
    marginTop: Spacing.two,
    alignItems: 'center',
    gap: Spacing.two,
  },
});
