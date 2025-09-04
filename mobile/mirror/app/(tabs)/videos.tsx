import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { listSessions, SessionMeta } from '../../modules/sessions/local';
import { Video as ExpoVideo, AVPlaybackStatus, ResizeMode } from 'expo-av';

function msToHMS(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function VideoRow({ meta }: { meta: SessionMeta }) {
  const ref = useRef<ExpoVideo>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;        // type-narrow
    setIsPlaying(status.isPlaying);
  };

  const toggle = async () => {
    const s = await ref.current?.getStatusAsync();
    if (!s || !s.isLoaded) return;
    if (s.isPlaying) await ref.current?.pauseAsync();
    else await ref.current?.playAsync();
  };

  const created = new Date(meta.createdAt);

  return (
    <View style={styles.card}>
      <Text style={styles.name}>{meta.id}.mp4</Text>
      <ExpoVideo
        ref={ref}
        source={{ uri: meta.videoPath }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        onPlaybackStatusUpdate={onStatus}
        useNativeControls
      />
      <View style={styles.row}>
        <Text style={styles.meta}>
          {created.toLocaleString()} · {msToHMS(meta.durationMs)} · {meta.devicePosition}
        </Text>
        <Pressable style={styles.chip} onPress={toggle}>
          <Text style={{ fontWeight: '600' }}>{isPlaying ? 'Pause' : 'Play'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function VideosScreen() {
  const [items, setItems] = useState<SessionMeta[]>([]);

  useEffect(() => {
    (async () => {
      const list = await listSessions();
      setItems(list);
    })();
  }, []);

  return (
    <FlatList
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      data={items}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <VideoRow meta={item} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No recordings yet.</Text>
          <Text style={styles.emptyText}>Record something from the “Record” tab.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: '#666', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    elevation: 1,
  },
  name: { alignSelf: 'flex-start', marginBottom: 6, color: '#373a3c', fontWeight: '600' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  row: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: '#555' },
  chip: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
});
