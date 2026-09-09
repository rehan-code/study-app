import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Button } from '@/components/button';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QuizQuestion } from '@/domain/quiz';

import { scoreQuiz, scoreTier } from '@/features/quiz/quiz-results';

const LEVELS_UPDATED_NOTE = "Every answer counted toward that word's level.";

export interface ResultsViewProps {
  questions: readonly QuizQuestion[];
  answers: readonly number[];
  onSelectCard: (cardId: string) => void;
  onTryAgain: () => void;
  onDone: () => void;
}

function AnswerText({ value, arabic, tone }: { value: string; arabic: boolean; tone: ThemeColor }) {
  if (arabic) {
    return (
      <ArabicText variant="compact" themeColor={tone}>
        {value}
      </ArabicText>
    );
  }
  return (
    <ThemedText type="small" themeColor={tone}>
      {value}
    </ThemedText>
  );
}

function ResultRow({
  question,
  answer,
  first,
  onPress,
}: {
  question: QuizQuestion;
  answer: number | undefined;
  first: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const correct = answer === question.correctIndex;
  const arabicAnswers = question.kind !== 'meaning';
  const yourAnswer = answer === undefined ? null : question.choices[answer];
  const correctAnswer = question.choices[question.correctIndex];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${question.promptArabic}, open card`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderTopColor: theme.border,
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
        },
      ]}
    >
      <SymbolView
        name={correct ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
        size={22}
        tintColor={correct ? theme.success : theme.danger}
        style={styles.rowIcon}
      />
      <View style={styles.rowContent}>
        <ArabicText variant="compact" numberOfLines={1}>
          {question.promptArabic}
        </ArabicText>
        {correct ? (
          <AnswerText value={correctAnswer} arabic={arabicAnswers} tone="success" />
        ) : (
          <View style={styles.answers}>
            {yourAnswer !== null && (
              <View style={styles.answerLine}>
                <ThemedText type="small" themeColor="textSecondary">
                  You picked
                </ThemedText>
                <AnswerText value={yourAnswer} arabic={arabicAnswers} tone="danger" />
              </View>
            )}
            <View style={styles.answerLine}>
              <ThemedText type="small" themeColor="textSecondary">
                Correct
              </ThemedText>
              <AnswerText value={correctAnswer} arabic={arabicAnswers} tone="success" />
            </View>
          </View>
        )}
      </View>
      <SymbolView
        name="chevron.right"
        size={14}
        weight="semibold"
        tintColor={theme.textSecondary}
        style={styles.rowChevron}
      />
    </Pressable>
  );
}

export function ResultsView({
  questions,
  answers,
  onSelectCard,
  onTryAgain,
  onDone,
}: ResultsViewProps) {
  const theme = useTheme();
  const score = scoreQuiz(questions, answers);
  const tier = scoreTier(score);

  return (
    <View style={styles.container}>
      {/* The answer list is unbounded in endless mode, so it scrolls on its own
          and the actions stay pinned within reach. */}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.scoreBlock}>
          <ThemedText type="title" style={styles.centered}>
            {`${score.correct} of ${score.total}`}
          </ThemedText>
          <ThemedText type="smallBold" style={styles.centered}>
            {tier.headline}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {tier.message}
          </ThemedText>
          {score.total > 0 && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {LEVELS_UPDATED_NOTE}
            </ThemedText>
          )}
        </View>
        {questions.length > 0 && (
          <Surface padded={false}>
            {questions.map((question, index) => (
              <ResultRow
                key={`${question.cardId}-${index}`}
                question={question}
                answer={answers[index]}
                first={index === 0}
                onPress={() => {
                  onSelectCard(question.cardId);
                }}
              />
            ))}
          </Surface>
        )}
      </ScrollView>
      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <Button
          label="Try again"
          onPress={onTryAgain}
          size="lg"
          fullWidth
          icon="arrow.counterclockwise"
        />
        <Button label="Done" onPress={onDone} variant="ghost" size="lg" fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  scoreBlock: {
    gap: Spacing.one,
    marginTop: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    alignItems: 'flex-start',
  },
  rowIcon: {
    // Centers the icon on the first Arabic line, whose tall line height starts lower.
    marginTop: 6,
  },
  rowChevron: {
    marginTop: 10,
  },
  rowContent: {
    flex: 1,
    gap: Spacing.one,
  },
  answers: {
    gap: Spacing.half,
  },
  answerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  actions: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
