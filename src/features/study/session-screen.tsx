import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { IconButton } from '@/components/icon-button';
import { LoadingState } from '@/components/loading-state';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { AnswerControls } from '@/features/study/answer-controls';
import { SessionComplete } from '@/features/study/session-complete';
import type { StudyMode } from '@/features/study/session-logic';
import { StudyDeck, type StudyDeckHandle } from '@/features/study/study-deck';
import { useStudySession } from '@/features/study/use-study-session';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/lib/stores';

export interface StudySessionScreenProps {
  mode: StudyMode;
}

export function StudySessionScreen({ mode }: StudySessionScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const aiImagesEnabled = useSettings((state) => state.aiImagesEnabled);
  const controller = useStudySession(mode);
  const deckRef = useRef<StudyDeckHandle>(null);

  const leave = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const close = useCallback(() => {
    if (controller.phase.kind === 'active' && controller.hasAnswered) {
      Alert.alert('End this session?', 'Your answers so far are already saved.', [
        { text: 'Keep studying', style: 'cancel' },
        { text: 'End session', style: 'destructive', onPress: leave },
      ]);
      return;
    }
    leave();
  }, [controller.hasAnswered, controller.phase.kind, leave]);

  const { done, total } = controller.progress;
  const fraction = total > 0 ? done / total : 0;

  let body;
  if (controller.phase.kind === 'loading') {
    body = <LoadingState label="Getting your cards ready" />;
  } else if (controller.phase.kind === 'error') {
    body = <ErrorState message={controller.phase.message} onRetry={controller.retryLoad} />;
  } else if (controller.phase.kind === 'empty') {
    body = (
      <EmptyState
        icon="checkmark.circle"
        title={mode === 'all' ? 'Nothing to study here' : "You're all caught up"}
        message={
          mode === 'all'
            ? 'This selection has no cards yet. Scan a workbook page to add some.'
            : 'No cards are due right now. Come back later, or study anyway from Home.'
        }
        action={{ label: 'Done', onPress: leave }}
      />
    );
  } else if (controller.phase.kind === 'complete') {
    body = (
      <SessionComplete
        summary={controller.summary}
        canStudyAgain={controller.canStudyAgain}
        rebuilding={controller.rebuilding}
        onStudyAgain={controller.studyAgain}
        onDone={leave}
      />
    );
  } else {
    body = (
      <>
        {controller.current !== null && (
          <StudyDeck
            ref={deckRef}
            card={controller.current}
            behindCard={controller.upcoming}
            showImages={aiImagesEnabled}
            resetKey={controller.deckResetKey}
            onAnswer={controller.answer}
          />
        )}
        <AnswerControls
          onNotYet={() => deckRef.current?.answer('not_yet')}
          onGotIt={() => deckRef.current?.answer('got_it')}
          onUndo={controller.undo}
          undoDisabled={!controller.canUndo}
        />
      </>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <Screen>
        <View style={styles.topBar}>
          <IconButton icon="xmark" accessibilityLabel="Close session" onPress={close} />
          <View style={styles.progressTrack}>
            <ProgressBar progress={fraction} />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {`${done}/${total}`}
          </ThemedText>
        </View>
        {controller.inlineError !== null && (
          <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
            <ThemedText type="small" themeColor="danger" style={styles.errorText}>
              {controller.inlineError}
            </ThemedText>
            <IconButton
              icon="xmark"
              accessibilityLabel="Dismiss error"
              onPress={controller.dismissInlineError}
              themeColor="danger"
              size={14}
            />
          </View>
        )}
        {body}
      </Screen>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  progressTrack: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    paddingLeft: Spacing.three,
    marginTop: Spacing.two,
  },
  errorText: {
    flex: 1,
    paddingVertical: Spacing.two,
  },
});
