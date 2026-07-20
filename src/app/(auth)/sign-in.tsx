import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ArabicText } from '@/components/arabic-text';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signInWithPassword, signUpWithPassword } from '@/lib/auth';

type AuthMode = 'sign-in' | 'sign-up';

interface ModeCopy {
  title: string;
  submitLabel: string;
  switchPrompt: string;
  switchLabel: string;
}

const MODE_COPY: Record<AuthMode, ModeCopy> = {
  'sign-in': {
    title: 'Welcome back',
    submitLabel: 'Sign in',
    switchPrompt: 'New here?',
    switchLabel: 'Create an account',
  },
  'sign-up': {
    title: 'Create your account',
    submitLabel: 'Sign up',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
  },
};

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = MODE_COPY[mode];

  function switchMode() {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
    setFormError(null);
    setNotice(null);
  }

  async function submitCredentials() {
    const trimmedEmail = email.trim();
    setFormError(null);
    setNotice(null);
    if (trimmedEmail === '') {
      setFormError('Enter your email address.');
      return;
    }
    if (password === '') {
      setFormError('Enter your password.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'sign-in') {
        // On success the root layout swaps to the app as soon as the session lands.
        const errorMessage = await signInWithPassword(trimmedEmail, password);
        if (errorMessage !== null) {
          setFormError(errorMessage);
        }
      } else {
        const result = await signUpWithPassword(trimmedEmail, password);
        if (result.error !== null) {
          setFormError(result.error);
        } else if (result.needsEmailConfirmation) {
          setMode('sign-in');
          setNotice(
            `Almost there. We sent a confirmation link to ${trimmedEmail}. Open it, then sign in here.`,
          );
        }
      }
    } catch (error) {
      console.warn('[sign-in] auth request failed:', error);
      setFormError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <ArabicText variant="hero" align="center">
              مفردات
            </ArabicText>
            <ThemedText type="small" themeColor="textSecondary">
              Your workbook, remembered.
            </ThemedText>
          </View>

          <ThemedText type="subtitle">{copy.title}</ThemedText>

          {notice !== null && (
            <View style={[styles.banner, { backgroundColor: theme.successSoft }]}>
              <ThemedText type="small" themeColor="success">
                {notice}
              </ThemedText>
            </View>
          )}

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'sign-up' ? 'At least 6 characters' : 'Your password'}
            secureTextEntry
            autoCapitalize="none"
          />

          {formError !== null && (
            <View style={[styles.banner, { backgroundColor: theme.dangerSoft }]}>
              <ThemedText type="small" themeColor="danger">
                {formError}
              </ThemedText>
            </View>
          )}

          <Button
            label={copy.submitLabel}
            onPress={submitCredentials}
            size="lg"
            loading={submitting}
            fullWidth
          />

          <View style={styles.switchRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {copy.switchPrompt}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={switchMode}
              disabled={submitting}
              hitSlop={Spacing.two}
            >
              <ThemedText type="smallBold" themeColor="primary">
                {copy.switchLabel}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  brand: {
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  banner: {
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
