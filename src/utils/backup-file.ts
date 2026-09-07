/**
 * The file half of backup/restore: writing the JSON somewhere the OS share sheet
 * can reach it, and reading one back in.
 *
 * Uses `expo-file-system/legacy` to match `utils/receipt.ts` — mixing the legacy
 * and current FileSystem APIs in one app is a good way to get confusing errors.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { exportBackup, parseBackup, type BackupFile } from '@/db/backup';

/** `easy-hesap-yedek-2026-08-06.json` — dated so successive backups don't collide. */
function fileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `easy-hesap-yedek-${day}-${time}.json`;
}

export class BackupFileError extends Error {}

export interface ExportResult {
  /** Rows written, for the confirmation message. */
  total: number;
  bytes: number;
}

/**
 * Write the backup to a temp file and open the OS share sheet.
 *
 * Returns null if the user dismissed the sheet without choosing a target — that
 * is a cancel, not a failure, and shouldn't surface as an error.
 */
export async function shareBackup(): Promise<ExportResult | null> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new BackupFileError('Bu cihazda paylaşım kullanılamıyor.');
  }

  const backup = exportBackup();
  const json = JSON.stringify(backup, null, 2);
  const total = Object.values(backup.counts).reduce((sum, n) => sum + n, 0);

  const uri = `${FileSystem.cacheDirectory}${fileName()}`;
  await FileSystem.writeAsStringAsync(uri, json);

  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: 'Yedeği kaydet veya gönder',
      UTI: 'public.json',
    });
  } catch {
    // Dismissing the sheet rejects on some platforms; treat it as a cancel.
    return null;
  }

  return { total, bytes: json.length };
}

/**
 * Write a CSV to a temp file and open the share sheet — the file the accountant
 * receives. Same shape as `shareBackup`; returns null on a cancel.
 */
export async function shareCsv(csv: string, name: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new BackupFileError('Bu cihazda paylaşım kullanılamıyor.');
  }

  const uri = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.writeAsStringAsync(uri, csv);

  try {
    await Sharing.shareAsync(uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Dökümü gönder',
      UTI: 'public.comma-separated-values-text',
    });
  } catch {
    return false;
  }
  return true;
}

/**
 * Let the user pick a backup file and return its parsed contents.
 * Returns null when the picker was cancelled.
 */
export async function pickBackup(): Promise<BackupFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    // Some providers hand back JSON as octet-stream, so don't filter too tightly.
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  let text: string;
  try {
    text = await FileSystem.readAsStringAsync(res.assets[0].uri);
  } catch {
    throw new BackupFileError('Dosya okunamadı.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFileError('Dosya geçerli bir JSON değil.');
  }

  return parseBackup(raw);
}
