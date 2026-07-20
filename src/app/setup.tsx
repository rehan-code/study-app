import { StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Screen } from '@/components/screen';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const ENV_EXAMPLE = [
  'EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key',
].join('\n');

export default function SetupScreen() {
  return (
    <Screen scroll>
      <View style={styles.content}>
        <View style={styles.brand}>
          <ArabicText variant="hero" align="center">
            مفردات
          </ArabicText>
          <ThemedText type="small" themeColor="textSecondary">
            Your workbook, remembered.
          </ThemedText>
        </View>

        <ThemedText type="subtitle">Connect your backend</ThemedText>
        <ThemedText themeColor="textSecondary">
          Mufradat keeps your cards, scans, and images in your own free Supabase project. The app
          just needs to know where that project lives.
        </ThemedText>

        <ThemedText>
          {'Copy .env.example to .env in the project root and fill in both keys:'}
        </ThemedText>
        <Surface>
          <ThemedText type="code" selectable>
            {ENV_EXAMPLE}
          </ThemedText>
        </Surface>

        <ThemedText themeColor="textSecondary">
          {
            'New to this? docs/BACKEND.md in the repo walks through the whole backend setup, database, storage, and edge functions included, in about ten minutes.'
          }
        </ThemedText>

        <Surface>
          <ThemedText type="smallBold">Reload after configuring</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            After saving .env, restart the dev server and reopen the app. This screen disappears
            once both keys are in place.
          </ThemedText>
        </Surface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  brand: {
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
});
