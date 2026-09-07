import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform } from 'react-native';

/**
 * How much of the screen the keyboard is currently covering, or 0 when it is down.
 *
 * `KeyboardAvoidingView` works this number out for itself by measuring where it
 * sits in the window — which is exactly why it does nothing inside an iOS modal.
 * A modal is its own container, offset from the window, so the overlap it
 * computes comes out as zero and the keyboard lands on top of the content.
 * Reading the frame off the event is the same number without the measurement.
 *
 * Android resizes its own window (`adjustResize`), so reporting a height there
 * would lift the content by a keyboard that has already been accounted for.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    // 'WillChangeFrame' rather than 'DidShow': it fires with the animation, so the
    // composer travels up with the keyboard instead of jumping once it lands.
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      // Derived from where the keyboard's top edge is, not from its height. The two
      // differ whenever the keyboard is partly off-screen — mid-dismiss, or split on
      // an iPad — and the height alone would lift the content by a keyboard that is
      // not there.
      const screenHeight = Dimensions.get('screen').height;
      setHeight(Math.max(0, screenHeight - e.endCoordinates.screenY));
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));

    return () => {
      change.remove();
      hide.remove();
    };
  }, []);

  return height;
}
