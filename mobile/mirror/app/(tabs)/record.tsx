import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
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
import { addSession, type DevicePosition } from '@/modules/sessions/local';

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function tsId(d = new Date()) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

export default function RecordScreen() {
  const { hasPermission: camOK, requestPermission: reqCam } = useCameraPermission();
  const { hasPermission: micOK, requestPermission: reqMic } = useMicrophonePermission();

  useEffect(() => {
    (async () => {
      if (!camOK) await reqCam();
      if (!micOK) await reqMic();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const front = useCameraDevice('front');
  const back = useCameraDevice('back');

  const [position, setPosition] = useState<DevicePosition>(back ? 'back' : 'front');
  const device = position === 'front' ? front : back;

  useEffect(() => {
    if (!front && back) setPosition('back');
    if (!back && front) setPosition('front');
  }, [front, back]);

  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const requestAll = async () => {
    if (!camOK) await reqCam();
    if (!micOK) await reqMic();
  };

  async function ensureDir() {
    const dir = FileSystem.documentDirectory + 'recordings';
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  }

  async function persist(video: VideoFile) {
    const dir = await ensureDir();
    const name = `${tsId()}_session.mp4`;
    const src = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
    const dst = `${dir}/${name}`;
    await FileSystem.copyAsync({ from: src, to: dst });
    return dst; // file://
  }

  const startRecording = async () => {
    try {
      if (!device || !cameraRef.current) return;
      setIsRecording(true);
      setLastSaved(null);
      startedAtRef.current = Date.now();

      await cameraRef.current.startRecording({
        fileType: 'mp4',
        flash: 'off',
        onRecordingFinished: async (video) => {
          try {
            const savedUri = await persist(video);
            const createdAt = Date.now();
            const durationMs =
              startedAtRef.current ? createdAt - startedAtRef.current : undefined;

            await addSession({
              id: savedUri.split('/').pop()!.replace(/\.mp4$/, ''),
              videoPath: savedUri,
              createdAt,
              durationMs,
              devicePosition: position,
            });

            setLastSaved(savedUri);
          } catch (e: any) {
            Alert.alert('Save failed', String(e?.message ?? e));
          } finally {
            setIsRecording(false);
            startedAtRef.current = null;
          }
        },
        onRecordingError: (err) => {
          setIsRecording(false);
          startedAtRef.current = null;
          Alert.alert('Recording error', String((err as any)?.message ?? err));
        },
      });
    } catch (e: any) {
      setIsRecording(false);
      startedAtRef.current = null;
      Alert.alert('Could not start recording', String(e?.message ?? e));
    }
  };

  const stopRecording = async () => {
    try {
      await cameraRef.current?.stopRecording();
    } catch {
      // ignore
    }
  };

  if (!camOK || !micOK) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permissions needed</Text>
        <Text style={styles.mono}>
          Camera: {camOK ? 'granted' : 'missing'} · Mic: {micOK ? 'granted' : 'missing'}
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestAll}>
          <Text style={styles.primaryText}>Grant Camera & Mic</Text>
        </Pressable>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.mono}>Looking for {position} camera…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          video
          audio
          enableZoomGesture
        />
      )}

      <View style={styles.controls}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() =>
            setPosition((p: DevicePosition) => (p === 'front' ? 'back' : 'front'))
          }
          disabled={!front || !back}
        >
          <Text style={[styles.secondaryText, (!front || !back) && { opacity: 0.5 }]}>
            {position === 'front' ? 'Switch to Back Camera' : 'Switch to Front Camera'}
          </Text>
        </Pressable>

        {isRecording ? (
          <Pressable style={[styles.primaryBtn, styles.stopBtn]} onPress={stopRecording}>
            <Text style={styles.primaryText}>Stop Recording</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={startRecording}>
            <Text style={styles.primaryText}>Start Recording</Text>
          </Pressable>
        )}

        {lastSaved && (
          <Text style={[styles.mono, { marginTop: 6 }]} numberOfLines={1}>
            Saved: {lastSaved.replace('file://', '')}
          </Text>
        )}
      </View>
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
  mono: { color: 'white', opacity: 0.85, textAlign: 'center' },
});
