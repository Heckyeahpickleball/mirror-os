import * as FileSystem from 'expo-file-system';

export type DevicePos = 'front' | 'back';

export type Session = {
  id: string;                // e.g. 20250904_172516
  videoPath: string;         // file://…/recordings/<id>_session.mp4
  createdAt: number;         // epoch ms
  durationMs?: number;
  devicePosition?: DevicePos;
  transcriptPath?: string;   // file://…/recordings/<id>.transcript.json
};

export const RECORDINGS_DIR = `${FileSystem.documentDirectory}recordings`;
const INDEX_PATH = `${RECORDINGS_DIR}/index.json`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  }
}

async function fileExists(path: string) {
  const info = await FileSystem.getInfoAsync(path);
  return info.exists;
}

async function readIndex(): Promise<Session[]> {
  await ensureDir();
  if (!(await fileExists(INDEX_PATH))) {
    await FileSystem.writeAsStringAsync(INDEX_PATH, '[]');
    return [];
  }
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
    const arr = JSON.parse(raw) as Session[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeIndex(list: Session[]) {
  await ensureDir();
  await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(list, null, 2));
}

/**
 * Upsert a session by id. On first insert, `videoPath` and `createdAt`
 * are required; later calls can add/override (e.g., transcriptPath).
 */
export async function addSession(
  update: Partial<Session> & { id: string }
): Promise<Session> {
  const list = await readIndex();
  const i = list.findIndex((s) => s.id === update.id);

  if (i === -1) {
    if (!update.videoPath) throw new Error('addSession: videoPath required on first insert');
    if (!update.createdAt) throw new Error('addSession: createdAt required on first insert');

    const created: Session = {
      id: update.id,
      videoPath: update.videoPath,
      createdAt: update.createdAt,
      durationMs: update.durationMs,
      devicePosition: update.devicePosition,
      transcriptPath: update.transcriptPath,
    };
    list.push(created);
    await writeIndex(list);
    return created;
  } else {
    const merged: Session = { ...list[i], ...update };
    list[i] = merged;
    await writeIndex(list);
    return merged;
  }
}

export async function listSessions(): Promise<Session[]> {
  const list = await readIndex();

  // prune entries whose video file no longer exists
  const pruned: Session[] = [];
  for (const s of list) {
    if (await fileExists(s.videoPath)) pruned.push(s);
  }
  if (pruned.length !== list.length) {
    await writeIndex(pruned);
  }

  // newest first
  pruned.sort((a, b) => b.createdAt - a.createdAt);
  return pruned;
}
