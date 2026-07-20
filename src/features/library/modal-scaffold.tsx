import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ModalScaffoldProps {
  visible: boolean;
  onClose: () => void;
  /** Set false to block backdrop and hardware dismissal while work is in flight. */
  dismissable?: boolean;
  position?: 'center' | 'bottom';
  children: ReactNode;
}

/** Backdrop + positioned container shared by the library dialogs. */
export function ModalScaffold({
  visible,
  onClose,
  dismissable = true,
  position = 'center',
  children,
}: ModalScaffoldProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const requestClose = () => {
    if (dismissable) {
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={requestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, position === 'center' ? styles.center : styles.bottom]}
      >
        <Pressable
          accessibilityLabel="Close"
          onPress={requestClose}
          style={[styles.backdrop, { backgroundColor: theme.text }]}
        />
        <View
          style={[
            styles.panel,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            position === 'center'
              ? styles.centerPanel
              : [styles.bottomPanel, { paddingBottom: insets.bottom + Spacing.three }],
          ]}
        >
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    padding: Spacing.four,
  },
  bottom: {
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.35,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  centerPanel: {
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  bottomPanel: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.three,
    maxHeight: '75%',
  },
});
