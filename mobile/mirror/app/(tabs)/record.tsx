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

export default function RecordScreen() {
  // Permissions
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();
  const {
    hasPermission: hasMicPermission,
    requestPermission: requestMicPermission,
  } = useMicrophonePermission();

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

  // Query both lenses and choose whichever is available
  const frontDevice = useCameraDevice('front');
  const backDevice = useCameraDevice('back');

  // Start with back (emulators commonly have back but not front)
  const [position, setPosition] = useState<'back' | 'front'>('back');
  const device = position === 'front' ? frontDevice : backDevice;

  // If current lens doesn't exist, auto-fallback to the other
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

  // Where we keep recordings (persistent)
  const recordingsDir = FileSystem.documentDirectory + 'recordings';

  const ensureDirAsync = async () => {
    const info = await FileSystem.getInfoAsync(recordingsDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(recordingsDir, { intermediates: true });
    }
  };

  const persistVideoAsync = async (video: VideoFile) => {
    await ensureDirAsync();
    const src = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
    const dst = `${recordingsDir}/${Date.now()}.mp4`;
    await FileSystem.copyAsync({ from: src, to: dst });
    return dst; // file:// URI
  };

  const startRecording = async () => {
    try {
      if (!cameraRef.current || !device) return;
      setIsRecording(true);
      setLastVideoPath(null);

      await cameraRef.current.startRecording({
        fileType: 'mp4',
        flash: 'off',
        onRecordingFinished: async (video) => {
          try {
            const saved = await persistVideoAsync(video);
            setLastVideoPath(saved);
          } catch (e: any) {
            Alert.alert('Save failed', String(e?.message ?? e));
          } finally {
            setIsRecording(false);
          }
        },
        onRecordingError: (error) => {
          setIsRecording(false);
          console.error(error);
          Alert.alert('Recording error', String(error?.message ?? error));
        },
      });
    } catch (e: any) {
      setIsRecording(false);
      Alert.alert('Could not start recording', String(e?.message ?? e));
    }
  };

  const stopRecording = async () => {
    try {
      await cameraRef.current?.stopRecording();
    } catch (e) {
      // VisionCamera can throw if stop is called twice — ignore.
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

  // If neither lens exists, guide the user
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
      {/* Only render the camera when this tab is focused and a device exists */}
      {isFocused && device ? (
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={isFocused}
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
