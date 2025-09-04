// mobile/mirror/modules/sessions/local.ts
import * as FileSystem from 'expo-file-system';

export type DevicePosition = 'front' | 'back';

export type Session = {
  id: string;                 // e.g., 20250903_205516_session
  videoPath: string;          // file:// URI
  createdAt: number;          // ms since epoch
  durationMs?: number;
  devicePosition?: DevicePosition;
};

const ROOT_DIR = FileSystem.documentDirectory + 'recordings';
const INDEX = `${ROOT_DIR}/sessions.json`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(ROOT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ROOT_DIR, { intermediates: true });
  }
  const idxInfo = await FileSystem.getInfoAsync(INDEX);
  if (!idxInfo.exists) {
    await FileSystem.writeAsStringAsync(INDEX, JSON.stringify([]));
  }
}

function normalizeUri(p: string) {
  return p.startsWith('file://') ? p : `file://${p}`;
}

export async function addSession(s: Session): Promise<Session> {
  await ensureDir();
  const raw = await FileSystem.readAsStringAsync(INDEX);
  const list = (JSON.parse(raw) as Session[]).filter(Boolean);
  const without = list.filter((x) => x.id !== s.id);
  without.push({ ...s, videoPath: normalizeUri(s.videoPath) });
  await FileSystem.writeAsStringAsync(INDEX, JSON.stringify(without));
  return s;
}

export async function listSessions(): Promise<Session[]> {
  await ensureDir();

  let rows: Session[] = [];
  try {
    const raw = await FileSystem.readAsStringAsync(INDEX);
    rows = (JSON.parse(raw) as Session[]).map((r) => ({
      ...r,
      videoPath: normalizeUri(r.videoPath),
    }));
  } catch {
    rows = [];
  }

  // Backfill stray .mp4 files that aren’t indexed yet
  try {
    // @ts-ignore available on native
    const names: string[] = await FileSystem.readDirectoryAsync(ROOT_DIR);
    const known = new Set(rows.map((r) => r.id));
    for (const name of names) {
      if (!name.endsWith('.mp4')) continue;
      const id = name.replace(/\.mp4$/, '');
      if (known.has(id)) continue;
      const uri = `${ROOT_DIR}/${name}`;
      const info = await FileSystem.getInfoAsync(uri);
      const created =
        (info as any)?.modificationTime
          ? ((info as any).modificationTime as number) * 1000
          : Date.now();
      rows.push({
        id,
        videoPath: normalizeUri(uri),
        createdAt: created,
      });
    }
  } catch {
    // ignore
  }

  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows;
}

export const paths = { ROOT_DIR, INDEX };
