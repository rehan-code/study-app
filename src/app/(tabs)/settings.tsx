import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut, useSession } from '@/lib/auth';
import { useSettings } from '@/lib/stores';

import { ListRow } from '@/components/list-row';
import { Screen } from '@/components/screen';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ListDivider } from '@/features/library/list-divider';
import { Section } from '@/features/library/section';

const NEW_CARDS_MIN = 5;
const NEW_CARDS_MAX = 50;
const NEW_CARDS_STEP = 5;

export default function SettingsRoute() {
  const theme = useTheme();
  const { session } = useSession();
  const { aiImagesEnabled, newCardsPerSession, setAiImagesEnabled, setNewCardsPerSession } =
    useSettings();
  const [signingOut, setSigningOut] = useState(false);

  const email = session?.user.email ?? 'Signed in';
  const version = Constants.expoConfig?.version ?? 'Unknown';

  const performSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      Alert.alert("Couldn't sign out", message);
    } finally {
      setSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void performSignOut();
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        <ThemedText type="subtitle">Settings</ThemedText>
        <Section title="Account" padded={false}>
          <ListRow title={email} />
          <ListDivider />
          <ListRow
            title="Sign out"
            onPress={signingOut ? undefined : confirmSignOut}
            right={signingOut ? <ActivityIndicator color={theme.danger} /> : null}
          />
        </Section>
        <Section title="Studying" padded={false}>
          <ListRow
            title="AI pictures"
            subtitle="Generated pictures on your cards"
            right={
              <Switch
                value={aiImagesEnabled}
                onValueChange={setAiImagesEnabled}
                trackColor={{ true: theme.primary }}
              />
            }
          />
          <ListDivider />
          <ListRow
            title="New cards per session"
            right={
              <Stepper
                value={newCardsPerSession}
                onChange={setNewCardsPerSession}
                min={NEW_CARDS_MIN}
                max={NEW_CARDS_MAX}
                step={NEW_CARDS_STEP}
              />
            }
          />
        </Section>
        <Section title="About" padded={false}>
          <ListRow
            title="Mufradat"
            right={<Text style={[styles.version, { color: theme.textSecondary }]}>{version}</Text>}
          />
        </Section>
        <Text style={[styles.footnote, { color: theme.textSecondary }]}>
          Your scans and cards are stored in your own Supabase project.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
    paddingBottom: BottomTabInset,
  },
  version: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: 500,
    fontVariant: ['tabular-nums'],
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: 500,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
});
