import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
  VideoFile,
} from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system';

// NOTE: keep RELATIVE imports
import { addSession, RECORDINGS_DIR } from '../../modules/sessions/local';
import { processAndSaveTranscript } from '../../modules/asr/local';

// Small helpers
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// YYYYMMDD_HHMMSS
function tsId(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate()),
  ].join('') + '_' + [pad(d.getHours()), pad(d.getMinutes()), pad(d.getSeconds())].join('');
}

export default function RecordScreen() {
  // Permissions
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();

  useEffect(() => {
    (async () => {
      if (!hasCameraPermission) await requestCameraPermission();
      if (!hasMicPermission) await requestMicPermission();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestAll = async () => {
    if (!hasCameraPermission) await requestCameraPermission();
    if (!hasMicPermission) await requestMicPermission();
  };

  // Devices
  const front = useCameraDevice('front');
  const back = useCameraDevice('back');
  const [position, setPosition] = useState<'front' | 'back'>(back ? 'back' : 'front');
  useEffect(() => {
    if (!back && front) setPosition('front');
    if (!front && back) setPosition('back');
  }, [front, back]);
  const device = position === 'front' ? front : back;

  // Control
  const cameraRef = useRef<Camera>(null);
  const isFocused = useIsFocused();

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastVideoPath, setLastVideoPath] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const togglePosition = () =>
    setPosition((p) => (p === 'front' ? 'back' : 'front'));

  async function ensureDir() {
    const info = await FileSystem.getInfoAsync(RECORDINGS_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
    }
  }

  async function persistVideoAsync(video: VideoFile, createdAt: Date) {
    await ensureDir();
    const base = `${tsId(createdAt)}_session.mp4`;
    const dst = `${RECORDINGS_DIR}/${base}`;
    const src = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
    await FileSystem.copyAsync({ from: src, to: dst });
    return dst; // file://...
  }

  const startRecording = async () => {
    try {
      if (!cameraRef.current || !device) return;
      setIsRecording(true);
      setIsProcessing(false);
      setLastVideoPath(null);
      setLastError(null);
      startedAtRef.current = Date.now();

      await cameraRef.current.startRecording({
        fileType: 'mp4',
        flash: 'off',
        onRecordingFinished: async (video) => {
          try {
            const createdAt = new Date();
            const createdAtMs = createdAt.getTime();
            const durationMs =
              startedAtRef.current != null ? Date.now() - startedAtRef.current : undefined;

            // 1) Persist the video
            const saved = await persistVideoAsync(video, createdAt);
            setLastVideoPath(saved);
            console.log('[Record] Saved MP4 →', saved);

            // 2) Upsert into index immediately (so Videos can see it)
            const id = tsId(createdAt);
            const first = await addSession({
              id,
              videoPath: saved,
              createdAt: createdAtMs,
              durationMs,
              devicePosition: position,
            });
            console.log('[Record] addSession (pre-ASR) →', first);

            // 3) Yield a frame so the overlay can appear
            setIsProcessing(true);
            await sleep(16); // ~1 frame

            // 4) Produce a stub transcript next to the MP4 (ASR day’s placeholder)
            const transcriptPath = await processAndSaveTranscript({
              videoPath: saved,
              durationMs,
              devicePosition: position,
            });
            console.log('[Record] transcript saved →', transcriptPath);

            // 5) Update the index with transcript path
            const second = await addSession({
              id,
              videoPath: saved,
              createdAt: createdAtMs,
              durationMs,
              devicePosition: position,
              transcriptPath,
            });
            console.log('[Record] addSession (with transcript) →', second);

            // (Optional) Log where the index lives for diagnostics
            const indexPath = `${RECORDINGS_DIR}/index.json`;
            console.log('[Record] index.json →', indexPath);
          } catch (e: any) {
            console.error(e);
            setLastError(String(e?.message ?? e));
            Alert.alert('Save/Process failed', String(e?.message ?? e));
          } finally {
            setIsRecording(false);
            setIsProcessing(false);
            startedAtRef.current = null;
          }
        },
        onRecordingError: (error) => {
          setIsRecording(false);
          setIsProcessing(false);
          startedAtRef.current = null;
          console.error(error);
          setLastError(String(error?.message ?? error));
          Alert.alert('Recording error', String(error?.message ?? error));
        },
      });
    } catch (e: any) {
      setIsRecording(false);
      setIsProcessing(false);
      startedAtRef.current = null;
      setLastError(String(e?.message ?? e));
      Alert.alert('Could not start recording', String(e?.message ?? e));
    }
  };

  const stopRecording = async () => {
    try {
      await cameraRef.current?.stopRecording();
    } catch (e) {
      console.warn('stopRecording error (ignored):', e);
    }
  };

  if (!hasCameraPermission || !hasMicPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permissions needed</Text>
        <Text style={styles.mono}>
          Camera: {hasCameraPermission ? 'granted' : 'missing'} · Mic:{' '}
          {hasMicPermission ? 'granted' : 'missing'}
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestAll}>
          <Text style={styles.primaryText}>Grant Camera & Mic</Text>
        </Pressable>
      </View>
    );
  }

  if (!front && !back) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.mono}>
          No camera devices available. Enable a camera in the emulator settings.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && device ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          video
          audio
          enableZoomGesture
        />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.mono}>
            {device ? 'Preparing camera…' : `No ${position} camera available.`}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={togglePosition}
          disabled={!front || !back}
        >
          <Text
            style={[
              styles.secondaryText,
              (!front || !back) && { opacity: 0.5 },
            ]}
          >
            {position === 'front' ? 'Switch to Back Camera' : 'Switch to Front Camera'}
          </Text>
        </Pressable>

        {isRecording ? (
          <Pressable style={[styles.primaryBtn, styles.stopBtn]} onPress={stopRecording}>
            <Text style={styles.primaryText}>Stop Recording</Text>
          </Pressable>
        ) : (
          <Pressable
            style={styles.primaryBtn}
            onPress={startRecording}
            disabled={!device}
          >
            <Text style={[styles.primaryText, !device && { opacity: 0.5 }]}>
              Start Recording
            </Text>
          </Pressable>
        )}

        {lastVideoPath && (
          <View style={styles.lastRow}>
            <Text style={styles.mono} numberOfLines={1}>
              Saved: {lastVideoPath.replace('file://', '')}
            </Text>
            <Text style={[styles.mono, { opacity: 0.7 }]}>
              Transcript JSON will be created next to the MP4.
            </Text>
          </View>
        )}

        {lastError && (
          <Text style={[styles.mono, { color: '#ff8080' }]} numberOfLines={2}>
            {lastError}
          </Text>
        )}
      </View>

      {isProcessing && (
        <View style={styles.processing}>
          <ActivityIndicator size="large" />
          <Text style={styles.processingText}>Processing your entry…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16, color: '#fff' },
  controls: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    gap: 10,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#111',
    opacity: 0.9,
  },
  primaryText: { color: 'white', fontWeight: '700' },
  secondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#00000099',
  },
  secondaryText: { color: 'white' },
  stopBtn: { backgroundColor: '#b00020' },
  lastRow: { marginTop: 6, width: '100%' },
  mono: { color: 'white', opacity: 0.85, textAlign: 'center' },
  processing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  processingText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
