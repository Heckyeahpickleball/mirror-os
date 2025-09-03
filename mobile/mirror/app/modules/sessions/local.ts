import * as FileSystem from "expo-file-system";

export type SessionRow = {
  id: string;                 // e.g. 20250305_231530
  created_at: string;         // ISO timestamp
  video_path: string;         // file://...mp4
  json_path: string;          // file://...json
  notes?: string;             // reserved
};

export const recordingsDir = FileSystem.documentDirectory + "recordings";

export async function ensureRecordingsDir() {
  const info = await FileSystem.getInfoAsync(recordingsDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
  }
}

export function timestampId(d = new Date()) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`;
}

export async function saveSessionRow(row: SessionRow) {
  await FileSystem.writeAsStringAsync(row.json_path, JSON.stringify(row), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
