import { KeyboardAvoidingView, Platform, StyleSheet, type ViewStyle } from 'react-native';

/**
 * Lifts a screen's content clear of the keyboard.
 *
 * Without this, a form's primary button sits behind the keyboard the moment a
 * field is focused — on `account/new` that was the Kaydet button on the very
 * first screen a new user reaches, with `autoFocus` opening the keyboard before
 * they could see it.
 *
 * Android is left to its own `adjustResize` window behaviour, which already
 * does the right thing; adding padding on top of it double-counts the keyboard.
 */
export function KeyboardAwareView({
  children,
  style,
  /** Height of anything above this view that the keyboard must clear, e.g. a header. */
  offset = 0,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  offset?: number;
}) {
  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
