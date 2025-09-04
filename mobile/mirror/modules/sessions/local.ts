// Simple local session registry backed by a JSON file.
// Stored under: FileSystem.documentDirectory/recordings/sessions.json

import * as FileSystem from 'expo-file-system';

export type SessionMeta = {
  id: string;                           // e.g. 20250903_205516_session
  videoPath: string;                    // file:// URI
  createdAt: string;                    // ISO string
  durationMs: number;                   // ms
  devicePosition: 'front' | 'back';     // which lens
};

const RECORDINGS_DIR = FileSystem.documentDirectory + 'recordings';
const SESSIONS_JSON = `${RECORDINGS_DIR}/sessions.json`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

async function readAll(): Promise<SessionMeta[]> {
  await ensureDir();
  const info = await FileSystem.getInfoAsync(SESSIONS_JSON);
  if (!info.exists) return [];
  const txt = await FileSystem.readAsStringAsync(SESSIONS_JSON);
  try {
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? (parsed as SessionMeta[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(list: SessionMeta[]) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(SESSIONS_JSON, JSON.stringify(list, null, 2));
}

export async function listSessions(): Promise<SessionMeta[]> {
  const list = await readAll();
  // newest first
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function addSession(meta: SessionMeta) {
  const list = await readAll();
  // replace if same id exists
  const idx = list.findIndex((s) => s.id === meta.id);
  if (idx >= 0) list[idx] = meta;
  else list.unshift(meta);
  await writeAll(list);
}

export async function removeSession(id: string) {
  const list = await readAll();
  const next = list.filter((s) => s.id !== id);
  await writeAll(next);
}
