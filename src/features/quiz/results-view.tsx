import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Button } from '@/components/button';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QuizQuestion } from '@/domain/quiz';

import { scoreQuiz, scoreTier } from '@/features/quiz/quiz-results';

export interface ResultsViewProps {
  questions: readonly QuizQuestion[];
  answers: readonly number[];
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
}: {
  question: QuizQuestion;
  answer: number | undefined;
  first: boolean;
}) {
  const theme = useTheme();
  const correct = answer === question.correctIndex;
  const arabicAnswers = question.kind !== 'meaning';
  const yourAnswer = answer === undefined ? null : question.choices[answer];
  const correctAnswer = question.choices[question.correctIndex];

  return (
    <View
      style={[
        styles.row,
        { borderTopColor: theme.border, borderTopWidth: first ? 0 : StyleSheet.hairlineWidth },
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
    </View>
  );
}

export function ResultsView({ questions, answers, onTryAgain, onDone }: ResultsViewProps) {
  const score = scoreQuiz(questions, answers);
  const tier = scoreTier(score);

  return (
    <View style={styles.container}>
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
      </View>
      <Surface padded={false}>
        {questions.map((question, index) => (
          <ResultRow
            key={`${question.cardId}-${index}`}
            question={question}
            answer={answers[index]}
            first={index === 0}
          />
        ))}
      </Surface>
      <View style={styles.actions}>
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
    gap: Spacing.four,
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
  },
});
