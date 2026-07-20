import { StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { QuizQuestion } from '@/domain/quiz';

import { ChoiceButton, type ChoiceState } from '@/features/quiz/choice-button';

export interface QuestionViewProps {
  question: QuizQuestion;
  picked: number | null;
  onPick: (index: number) => void;
}

function choiceState(question: QuizQuestion, picked: number | null, index: number): ChoiceState {
  if (picked === null) {
    return 'idle';
  }
  if (index === question.correctIndex) {
    return 'correct';
  }
  if (index === picked) {
    return 'wrong';
  }
  return 'faded';
}

export function QuestionView({ question, picked, onPick }: QuestionViewProps) {
  const showMeaningHint = question.kind !== 'meaning' && question.promptMeaning.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.prompt}>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {question.instruction}
        </ThemedText>
        <ArabicText variant="headline" align="center">
          {question.promptArabic}
        </ArabicText>
        {showMeaningHint && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {question.promptMeaning}
          </ThemedText>
        )}
      </View>
      <View style={styles.choices}>
        {question.choices.map((choice, index) => (
          <ChoiceButton
            key={choice}
            text={choice}
            arabic={question.kind !== 'meaning'}
            state={choiceState(question, picked, index)}
            locked={picked !== null}
            onPress={() => onPick(index)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
  },
  prompt: {
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  choices: {
    gap: Spacing.two,
  },
});
