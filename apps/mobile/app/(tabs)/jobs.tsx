import { Check, ChevronRight, MapPin } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenState } from '@/components/ScreenState';
import { Colors } from '@/constants/colors';
import { useApp } from '@/providers/AppProvider';

export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const app = useApp();

  if (!app.ready || app.loadError) return <ScreenState loading={!app.ready} error={app.loadError} />;
  if (!app.jobs.length) return <ScreenState empty="No jobs yet." />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <Text style={styles.title}>Jobs</Text>
      <Text style={styles.subtitle}>Select the job that should receive new field notes.</Text>
      <FlatList
        data={app.jobs}
        keyExtractor={(job) => job.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = item.id === app.activeJobId;
          return (
            <View style={[styles.card, selected && styles.selectedCard]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                style={styles.cardBody}
                onPress={() => router.push({ pathname: '/job-detail', params: { id: item.id } })}
              >
                <View style={styles.cardText}>
                  <Text style={styles.jobTitle}>{item.title}</Text>
                  <Text style={styles.client}>{item.client}</Text>
                  <View style={styles.locationRow}>
                    <MapPin color={Colors.dark.textMuted} size={13} />
                    <Text style={styles.address} numberOfLines={1}>{item.address}</Text>
                  </View>
                </View>
                <ChevronRight color={Colors.dark.textMuted} size={20} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={selected ? `${item.title} is active` : `Make ${item.title} active`}
                disabled={selected}
                style={[styles.selectButton, selected && styles.selectedButton]}
                onPress={() => void app.setActiveJobId(item.id)}
              >
                {selected ? <Check color={Colors.dark.success} size={15} /> : null}
                <Text style={[styles.selectText, selected && styles.selectedText]}>
                  {selected ? 'Active job' : 'Set active'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  title: { color: Colors.dark.text, fontSize: 26, fontWeight: '700', marginHorizontal: 20, marginTop: 12 },
  subtitle: { color: Colors.dark.textMuted, fontSize: 13, marginHorizontal: 20, marginTop: 5 },
  list: { padding: 20, paddingBottom: 100 },
  card: { backgroundColor: Colors.dark.surface, borderColor: Colors.dark.border, borderWidth: 1, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  selectedCard: { borderColor: Colors.dark.success },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardText: { flex: 1 },
  jobTitle: { color: Colors.dark.text, fontSize: 16, fontWeight: '700' },
  client: { color: Colors.dark.textSecondary, fontSize: 13, marginTop: 3 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  address: { color: Colors.dark.textMuted, fontSize: 12, flex: 1 },
  selectButton: { borderTopColor: Colors.dark.border, borderTopWidth: 1, padding: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  selectedButton: { backgroundColor: Colors.dark.successDim },
  selectText: { color: Colors.dark.accent, fontWeight: '700', fontSize: 12 },
  selectedText: { color: Colors.dark.success },
});
