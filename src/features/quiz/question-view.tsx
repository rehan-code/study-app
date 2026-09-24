import { StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { choicesAreArabic, promptIsArabic, type QuizQuestion } from '@/domain/quiz';

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
  const arabicPrompt = promptIsArabic(question.kind);
  const arabicChoices = choicesAreArabic(question.kind);
  // The meaning is a hint only when it is neither the prompt nor the answer.
  const showMeaningHint = arabicPrompt && arabicChoices && question.promptMeaning.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.prompt}>
        <ThemedText themeColor="textSecondary" style={styles.centered}>
          {question.instruction}
        </ThemedText>
        {arabicPrompt ? (
          <ArabicText variant="headline" align="center">
            {question.promptArabic}
          </ArabicText>
        ) : (
          <ThemedText type="subtitle" style={styles.centered}>
            {question.promptMeaning}
          </ThemedText>
        )}
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
            arabic={arabicChoices}
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
