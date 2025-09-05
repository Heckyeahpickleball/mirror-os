import * as FileSystem from 'expo-file-system';
import type { DevicePos } from '../sessions/local';

/**
 * Stub “ASR” that writes a tiny transcript JSON next to the MP4.
 * Returns the file:// path to the JSON.
 */
export async function processAndSaveTranscript(args: {
  videoPath: string;
  durationMs?: number;
  devicePosition?: DevicePos;
}): Promise<string> {
  const { videoPath, durationMs, devicePosition } = args;

  // …/<id>_session.mp4  ->  …/<id>.transcript.json
  const transcriptPath = videoPath.replace(/_session\.mp4$/i, '.transcript.json');

  const payload = {
    type: 'transcript',
    model: 'stub-local',
    createdAt: Date.now(),
    durationMs,
    devicePosition,
    words: [] as Array<{ t_ms: number; word: string; conf: number }>,
    segments: [] as Array<{ start_ms: number; end_ms: number; text: string }>,
    meta: { source: 'on-device (stub)' },
  };

  await FileSystem.writeAsStringAsync(transcriptPath, JSON.stringify(payload, null, 2));
  return transcriptPath;
}
