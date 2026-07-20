import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { cardHeadline, type Card } from '@/domain/cards';

import { Spacing } from '@/constants/theme';
import { deleteCard, getCard, queryKeys } from '@/lib/queries';

import { Button } from '@/components/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Screen } from '@/components/screen';
import { CardContentSection } from '@/features/library/card-content-section';
import { CardLessonSection } from '@/features/library/card-lesson-section';
import { CardPictureSection } from '@/features/library/card-picture-section';
import { CardProgressSection } from '@/features/library/card-progress-section';
import { DetailHeader } from '@/features/library/detail-header';
import { invalidateAfterCardDelete } from '@/features/library/query-invalidation';

export interface CardDetailScreenProps {
  cardId: string;
}

export function CardDetailScreen({ cardId }: CardDetailScreenProps) {
  const router = useRouter();
  const cardQuery = useQuery({ queryKey: queryKeys.card(cardId), queryFn: () => getCard(cardId) });

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  if (cardQuery.isPending) {
    return (
      <Screen>
        <DetailHeader title="Card" onBack={goBack} />
        <LoadingState label="Loading card" />
      </Screen>
    );
  }

  if (cardQuery.isError) {
    return (
      <Screen>
        <DetailHeader title="Card" onBack={goBack} />
        <ErrorState
          message={cardQuery.error.message}
          onRetry={() => {
            void cardQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  return <CardDetailLoaded card={cardQuery.data} onBack={goBack} />;
}

function CardDetailLoaded({ card, onBack }: { card: Card; onBack: () => void }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteCard(card.id),
    onSuccess: () => {
      onBack();
      void invalidateAfterCardDelete(queryClient, card.id);
    },
    onError: (error) => {
      Alert.alert("Couldn't delete the card", error.message);
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      'Delete this card?',
      "This removes the card and its progress. It can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMutation.mutate();
          },
        },
      ],
    );
  };

  return (
    <Screen padded={false}>
      <View style={styles.headerBox}>
        <DetailHeader title={cardHeadline(card)} arabicTitle onBack={onBack} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <CardContentSection card={card} />
          <CardPictureSection card={card} />
          <CardLessonSection card={card} />
          <CardProgressSection card={card} />
          <Button
            label="Delete card"
            variant="danger"
            onPress={confirmDelete}
            loading={deleteMutation.isPending}
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerBox: {
    paddingHorizontal: Spacing.three,
  },
  content: {
    padding: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.four,
  },
});
