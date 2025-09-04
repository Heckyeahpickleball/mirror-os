import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { listSessions, type Session } from '@/modules/sessions/local';

function msToClock(ms?: number) {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function basename(uri: string) {
  try {
    return decodeURIComponent(uri.split('/').pop() ?? uri);
  } catch {
    return uri;
  }
}

export default function VideosScreen() {
  const [items, setItems] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const rows = await listSessions();
    setItems(rows);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (loading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Loading…</Text>
      </View>
    );
  }

  if (!items.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No recordings yet.</Text>
        <Text style={[styles.emptyText, { opacity: 0.6 }]}>
          Record something from the “Record” tab.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(s) => s.id}
      contentContainerStyle={{ padding: 12, paddingBottom: 48 }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.name}>{basename(item.videoPath)}</Text>
          <Video
            source={{ uri: item.videoPath }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            isLooping={false}
          />
          <View style={styles.metaRow}>
            <Text style={styles.meta}>
              {new Date(item.createdAt).toLocaleString()}
            </Text>
            <View style={{ flex: 1 }} />
            <Text style={[styles.meta, styles.chip]}>{msToClock(item.durationMs)}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: '#666' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    elevation: 2,
  },
  name: { fontWeight: '600', marginBottom: 8, color: '#333' },
  video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  meta: { color: '#373a3a' },
  chip: {
    backgroundColor: '#eef2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontWeight: '600',
    overflow: 'hidden',
  },
});
