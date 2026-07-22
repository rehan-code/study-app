import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ArabicText } from '@/components/arabic-text';
import { CardImage } from '@/components/card-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { cardDetailRows, cardHeadline, type Card } from '@/domain/cards';
import type { ReviewResult } from '@/domain/srs';
import { useTheme } from '@/hooks/use-theme';

const SWIPE_DISTANCE = 120;
const SWIPE_VELOCITY = 900;
const OVERLAY_START = 24;
const MAX_ROTATION_DEG = 12;
const VERTICAL_DRAG_FACTOR = 0.4;
const EXIT_DURATION_MS = 220;
const FLIP_DURATION_MS = 280;
const FRONT_IMAGE_HEIGHT = 200;
const BACK_IMAGE_HEIGHT = 120;
const CARD_IMAGE_RATIO = 4 / 3;
const REST_SPRING = { damping: 18, stiffness: 220 } as const;

export interface StudyDeckHandle {
  answer: (result: ReviewResult) => void;
}

export interface StudyDeckProps {
  card: Card;
  behindCard: Card | null;
  showImages: boolean;
  /** Changes on every new card presentation; remounts the interactive card so drag and flip start fresh. */
  resetKey: string;
  onAnswer: (result: ReviewResult) => void;
  ref?: Ref<StudyDeckHandle>;
}

interface GhostFlight {
  card: Card;
  showBack: boolean;
  result: ReviewResult;
  startX: number;
  startY: number;
}

function cardShowsImage(card: Card, showImages: boolean): boolean {
  return showImages && card.imageEnabled && card.aiImagePath !== null;
}

function CardFront({ card, showImages }: { card: Card; showImages: boolean }) {
  return (
    <View style={styles.faceContent}>
      {cardShowsImage(card, showImages) && card.aiImagePath !== null && (
        <CardImage
          bucket="card-images"
          path={card.aiImagePath}
          height={FRONT_IMAGE_HEIGHT}
          aspectRatio={CARD_IMAGE_RATIO}
        />
      )}
      <View style={styles.headlineArea}>
        <ArabicText variant="hero" align="center">
          {cardHeadline(card)}
        </ArabicText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        Tap to flip
      </ThemedText>
    </View>
  );
}

function CardBack({ card, showImages }: { card: Card; showImages: boolean }) {
  const theme = useTheme();
  const rows = cardDetailRows(card);
  return (
    <View style={styles.faceContent}>
      {cardShowsImage(card, showImages) && card.aiImagePath !== null && (
        <CardImage
          bucket="card-images"
          path={card.aiImagePath}
          height={BACK_IMAGE_HEIGHT}
          aspectRatio={CARD_IMAGE_RATIO}
        />
      )}
      <ThemedText type="subtitle" style={styles.centeredText}>
        {card.meaning}
      </ThemedText>
      {rows.length > 0 && (
        <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
          {rows.map((row) => (
            <View key={row.key} style={[styles.detailRow, { borderBottomColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {row.label}
              </ThemedText>
              <View style={styles.detailValue}>
                <ArabicText variant="body" align="right">
                  {row.value}
                </ArabicText>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function AnswerOverlay({
  label,
  softColor,
  strongColor,
}: {
  label: string;
  softColor: ThemeColor;
  strongColor: ThemeColor;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.overlayFill, { backgroundColor: theme[softColor] }]}>
      <ThemedText type="subtitle" themeColor={strongColor}>
        {label}
      </ThemedText>
    </View>
  );
}

/** The answered card keeps flying out on its own so the next card can swap in without a flicker. */
function GhostCard({
  flight,
  showImages,
  onDone,
}: {
  flight: GhostFlight;
  showImages: boolean;
  onDone: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const x = useSharedValue(flight.startX);
  const y = useSharedValue(flight.startY);

  useEffect(() => {
    const direction = flight.result === 'got_it' ? 1 : -1;
    x.value = withTiming(direction * width * 1.4, { duration: EXIT_DURATION_MS }, (finished) => {
      if (finished === true) {
        runOnJS(onDone)();
      }
    });
    y.value = withTiming(flight.startY + 48, { duration: EXIT_DURATION_MS });
  }, [flight, onDone, width, x, y]);

  const flightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      {
        rotate: `${interpolate(x.value, [-width, width], [-MAX_ROTATION_DEG, MAX_ROTATION_DEG])}deg`,
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cardLayer,
        styles.face,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        flightStyle,
      ]}
    >
      {flight.showBack ? (
        <CardBack card={flight.card} showImages={showImages} />
      ) : (
        <CardFront card={flight.card} showImages={showImages} />
      )}
      {flight.result === 'got_it' ? (
        <AnswerOverlay label="Got it" softColor="successSoft" strongColor="success" />
      ) : (
        <AnswerOverlay label="Not yet" softColor="accentSoft" strongColor="accent" />
      )}
    </Animated.View>
  );
}

interface InteractiveCardHandle {
  answer: (result: ReviewResult) => void;
}

type CommitAnswer = (
  result: ReviewResult,
  startX: number,
  startY: number,
  showBack: boolean,
) => void;

interface CardGestureConfig {
  enabled: boolean;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  flip: SharedValue<number>;
  commitFromGesture: CommitAnswer;
  toggleFace: () => void;
}

/**
 * Built outside the component so writing shared values in the gesture worklets
 * stays out of React render scope (the compiler treats render values as frozen).
 */
function makeCardGesture({
  enabled,
  translateX,
  translateY,
  flip,
  commitFromGesture,
  toggleFace,
}: CardGestureConfig) {
  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX([-12, 12])
    .failOffsetY([-32, 32])
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY * VERTICAL_DRAG_FACTOR;
    })
    .onEnd((event) => {
      const commitRight = translateX.value > SWIPE_DISTANCE || event.velocityX > SWIPE_VELOCITY;
      const commitLeft = translateX.value < -SWIPE_DISTANCE || event.velocityX < -SWIPE_VELOCITY;
      if (commitRight || commitLeft) {
        runOnJS(commitFromGesture)(
          commitRight ? 'got_it' : 'not_yet',
          translateX.value,
          translateY.value,
          flip.value > 0.5,
        );
      } else {
        translateX.value = withSpring(0, REST_SPRING);
        translateY.value = withSpring(0, REST_SPRING);
      }
    });
  const tap = Gesture.Tap()
    .enabled(enabled)
    .maxDuration(300)
    .onEnd((_event, success) => {
      if (success) {
        runOnJS(toggleFace)();
      }
    });
  return Gesture.Race(pan, tap);
}

/**
 * The draggable, flippable top card. Mounted fresh (via key) for every card
 * presentation so drag offsets and flip state never leak between cards.
 */
function InteractiveCard({
  card,
  showImages,
  interactive,
  onCommit,
  ref,
}: {
  card: Card;
  showImages: boolean;
  interactive: boolean;
  onCommit: CommitAnswer;
  ref?: Ref<InteractiveCardHandle>;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const flip = useSharedValue(0);
  const [isBack, setIsBack] = useState(false);

  const toggleFace = () => {
    setIsBack((previous) => !previous);
    flip.value = withTiming(flip.value > 0.5 ? 0 : 1, { duration: FLIP_DURATION_MS });
  };

  const commitFromGesture = (
    result: ReviewResult,
    startX: number,
    startY: number,
    showBack: boolean,
  ) => {
    onCommit(result, startX, startY, showBack);
  };

  const answerFromButton = (result: ReviewResult) => {
    onCommit(result, translateX.value, translateY.value, flip.value > 0.5);
  };

  useImperativeHandle(ref, () => ({ answer: answerFromButton }));

  const gesture = makeCardGesture({
    enabled: interactive,
    translateX,
    translateY,
    flip,
    commitFromGesture,
    toggleFace,
  });

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      {
        rotate: `${interpolate(translateX.value, [-width, width], [-MAX_ROTATION_DEG, MAX_ROTATION_DEG])}deg`,
      },
    ],
  }));
  const frontFlipStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const backFlipStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
  }));
  const gotItOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [OVERLAY_START, SWIPE_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const notYetOverlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_DISTANCE, -OVERLAY_START],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const faceColors = { backgroundColor: theme.backgroundElement, borderColor: theme.border };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cardLayer, dragStyle]}>
        <Animated.View
          pointerEvents={isBack ? 'none' : 'auto'}
          style={[styles.face, styles.absoluteFace, faceColors, frontFlipStyle]}
        >
          <CardFront card={card} showImages={showImages} />
        </Animated.View>
        <Animated.View
          pointerEvents={isBack ? 'auto' : 'none'}
          style={[styles.face, styles.absoluteFace, faceColors, backFlipStyle]}
        >
          <CardBack card={card} showImages={showImages} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.overlayLayer, gotItOverlayStyle]}>
          <AnswerOverlay label="Got it" softColor="successSoft" strongColor="success" />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.overlayLayer, notYetOverlayStyle]}>
          <AnswerOverlay label="Not yet" softColor="accentSoft" strongColor="accent" />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

export function StudyDeck({
  card,
  behindCard,
  showImages,
  resetKey,
  onAnswer,
  ref,
}: StudyDeckProps) {
  const theme = useTheme();
  const [ghost, setGhost] = useState<GhostFlight | null>(null);
  const interactiveRef = useRef<InteractiveCardHandle>(null);

  const launchGhost = useCallback<CommitAnswer>(
    (result, startX, startY, showBack) => {
      setGhost({ card, showBack, result, startX, startY });
      onAnswer(result);
    },
    [card, onAnswer],
  );

  const clearGhost = useCallback(() => {
    setGhost(null);
  }, []);

  const answerFromOutside = useCallback(
    (result: ReviewResult) => {
      // One flight at a time keeps the ghost slot unambiguous during the exit animation.
      if (ghost !== null) {
        return;
      }
      interactiveRef.current?.answer(result);
    },
    [ghost],
  );

  useImperativeHandle(ref, () => ({ answer: answerFromOutside }), [answerFromOutside]);

  const faceColors = { backgroundColor: theme.backgroundElement, borderColor: theme.border };

  return (
    <View style={styles.deck}>
      {behindCard !== null && (
        <View pointerEvents="none" style={[styles.cardLayer, styles.behindCard]}>
          <View style={[styles.face, faceColors, StyleSheet.absoluteFill]}>
            <CardFront card={behindCard} showImages={showImages} />
          </View>
        </View>
      )}
      <InteractiveCard
        key={resetKey}
        ref={interactiveRef}
        card={card}
        showImages={showImages}
        interactive={ghost === null}
        onCommit={launchGhost}
      />
      {ghost !== null && <GhostCard flight={ghost} showImages={showImages} onDone={clearGhost} />}
    </View>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    marginVertical: Spacing.three,
  },
  cardLayer: {
    ...StyleSheet.absoluteFill,
  },
  behindCard: {
    transform: [{ scale: 0.96 }, { translateY: 10 }],
    opacity: 0.7,
  },
  face: {
    flex: 1,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  absoluteFace: {
    ...StyleSheet.absoluteFill,
  },
  faceContent: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  headlineArea: {
    justifyContent: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  detailScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailValue: {
    flexShrink: 1,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFill,
  },
  overlayFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
