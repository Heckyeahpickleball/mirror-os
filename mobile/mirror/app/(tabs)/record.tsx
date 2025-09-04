import React, { useRef, useState, useEffect } from 'react';
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
import { addSession } from '../../modules/sessions/local';

// timestamp id: YYYYMMDD_HHMMSS
function tsId(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}${m}${day}_${h}${min}${s}`;
}

export default function RecordScreen() {
  // Permissions
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } =
    useMicrophonePermission();

  // Ask once on mount if missing
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

  // Prefer back on emulators
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');
  const device = position === 'front' ? frontDevice : backDevice;

  useEffect(() => {
    if (!frontDevice && backDevice) setPosition('back');
    if (!backDevice && frontDevice) setPosition('front');
  }, [frontDevice, backDevice]);

  const togglePosition = () =>
    setPosition((p) => (p === 'front' ? 'back' : 'front'));

  // Camera control
  const cameraRef = useRef<Camera>(null);
  const isFocused = useIsFocused();

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [lastVideoPath, setLastVideoPath] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // persistent target dir
  const recordingsDir = FileSystem.documentDirectory + 'recordings';

  const ensureDirAsync = async () => {
    const info = await FileSystem.getInfoAsync(recordingsDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
    }
  };

  const persistVideoAsync = async (video: VideoFile) => {
    await ensureDirAsync();
    const id = tsId();
    const fileName = `${id}_session.mp4`;
    const src = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
    const dst = `${recordingsDir}/${fileName}`;
    await FileSystem.copyAsync({ from: src, to: dst });
    return { savedPath: dst, id };
  };

  const startRecording = async () => {
    try {
      if (!cameraRef.current || !device) return;
      setIsRecording(true);
      setLastVideoPath(null);
      startedAtRef.current = Date.now();

      await cameraRef.current.startRecording({
        fileType: 'mp4',
        flash: 'off',
        onRecordingFinished: async (video) => {
          try {
            const createdAt = new Date();
            const { savedPath, id } = await persistVideoAsync(video);
            const durationMs =
              startedAtRef.current ? Date.now() - startedAtRef.current : 0;

            // save to local registry
            await addSession({
              id,
              videoPath: savedPath,
              createdAt: createdAt.toISOString(),
              durationMs,
              devicePosition: position,
            });

            setLastVideoPath(savedPath);
          } catch (e: any) {
            Alert.alert('Save failed', String(e?.message ?? e));
          } finally {
            setIsRecording(false);
            startedAtRef.current = null;
          }
        },
        onRecordingError: (error) => {
          setIsRecording(false);
          startedAtRef.current = null;
          console.error(error);
          Alert.alert('Recording error', String(error?.message ?? error));
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
    } catch (e) {
      console.warn('stopRecording error (ignored):', e);
    }
  };

  // Permission-gated UI
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

  if (!frontDevice && !backDevice) {
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
          {!device && (
            <Pressable style={styles.secondaryBtn} onPress={togglePosition}>
              <Text style={styles.secondaryText}>
                Try {position === 'front' ? 'Back' : 'Front'} camera
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.controls}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={togglePosition}
          disabled={!frontDevice || !backDevice}
        >
          <Text
            style={[
              styles.secondaryText,
              (!frontDevice || !backDevice) && { opacity: 0.5 },
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
          <Pressable style={styles.primaryBtn} onPress={startRecording} disabled={!device}>
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
              (Also visible in the “Videos” tab)
            </Text>
          </View>
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
  lastRow: { marginTop: 6, width: '100%' },
  mono: { color: 'white', opacity: 0.85, textAlign: 'center' },
});
