import { Stack, useLocalSearchParams } from 'expo-router';

import { parseStudyMode } from '@/features/study/session-logic';
import { StudySessionScreen } from '@/features/study/session-screen';

export default function StudySessionRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  return (
    <>
      <Stack.Screen
        options={{ presentation: 'fullScreenModal', headerShown: false, gestureEnabled: false }}
      />
      <StudySessionScreen mode={parseStudyMode(mode)} />
    </>
  );
}
