import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { newId } from '@/db/ids';

const RECEIPT_DIR = `${FileSystem.documentDirectory}receipts/`;

async function persist(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(RECEIPT_DIR, { intermediates: true }).catch(() => {});
  const dest = `${RECEIPT_DIR}${newId()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

/**
 * Capture a receipt with the camera and store it in the app's documents dir.
 * Returns the persistent file URI, or null if cancelled / permission denied.
 */
export async function captureReceipt(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
  if (res.canceled || !res.assets?.[0]) return null;
  return persist(res.assets[0].uri);
}

/** Pick a receipt photo from the library and store it in the documents dir. */
export async function pickReceipt(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.5 });
  if (res.canceled || !res.assets?.[0]) return null;
  return persist(res.assets[0].uri);
}

/**
 * The longest edge we send for scanning.
 *
 * A phone camera writes 3000-4000 px; a receipt's print is legible well below
 * that, and every extra pixel is upload time on a shop's connection. 1400 keeps
 * faint thermal print readable while cutting a 4 MB photo to a few hundred KB.
 */
const SCAN_MAX_EDGE = 1400;

/**
 * Read a stored receipt as base64, shrunk for sending.
 *
 * Deliberately separate from `persist`: the file kept on the phone stays at full
 * quality — it is the user's record and may be zoomed into — while the copy that
 * travels is small. Sending the original would mean a minute of waiting on mobile
 * data for no gain in what the model can read.
 *
 * Returns null when the image cannot be read, so the caller can leave the photo
 * attached and let the user type the amount instead of failing the whole entry.
 */
export async function readReceiptBase64(uri: string): Promise<string | null> {
  try {
    const context = ImageManipulator.manipulate(uri);
    // Height omitted: the aspect ratio is kept, and a receipt is far taller than
    // it is wide — constraining both edges would squash it.
    context.resize({ width: SCAN_MAX_EDGE });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.6,
      base64: true,
    });
    return saved.base64 ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete a stored receipt file.
 *
 * Called when the transaction that owned it is deleted. Without this the JPEGs
 * accumulate in the app's documents directory forever — invisible to the user,
 * counted against their phone's storage, and growing by one photo per deleted
 * entry.
 *
 * Only touches files we wrote. A URI from somewhere else is left alone: it may
 * be a photo in the user's library that they picked, and deleting from there is
 * not ours to do.
 */
export async function deleteReceipt(uri: string | null): Promise<void> {
  if (!uri || !uri.startsWith(RECEIPT_DIR)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
