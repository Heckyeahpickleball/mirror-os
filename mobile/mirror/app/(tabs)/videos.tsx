import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';

type Clip = { name: string; uri: string; mtime?: number };

const DIR = FileSystem.documentDirectory + 'recordings';

export default function VideosScreen() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const info = await FileSystem.getInfoAsync(DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
      }
      const names = await FileSystem.readDirectoryAsync(DIR);
      const withMeta = await Promise.all(
        names
          .filter((n) => n.endsWith('.mp4'))
          .map(async (name) => {
            const uri = `${DIR}/${name}`;
            const st = await FileSystem.getInfoAsync(uri);
            return {
              name,
              uri,
              mtime: (st as any).modificationTime as number | undefined,
            };
          })
      );
      withMeta.sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
      setClips(withMeta);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const width = Dimensions.get('window').width;
  const videoWidth = width - 24; // card horizontal padding (12 + 12)
  const videoHeight = Math.round((videoWidth * 9) / 16);

  if (!clips.length && !refreshing) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.emptyText}>
          No recordings yet. Record something in the “Record” tab.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={clips}
      keyExtractor={(item) => item.name}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.filename}>{item.name}</Text>
          <Video
            style={{ width: videoWidth, height: videoHeight, borderRadius: 12, backgroundColor: '#111' }}
            source={{ uri: item.uri }}
            useNativeControls
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            isLooping={false}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f4f5' },
  emptyText: { fontSize: 16, color: '#555', textAlign: 'center', paddingHorizontal: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  filename: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    color: '#111827',
  },
});
