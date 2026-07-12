import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/colors';

interface ScreenStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: string;
}

export function ScreenState({ loading, error, empty }: ScreenStateProps) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      {loading ? <ActivityIndicator color={Colors.dark.accent} size="large" /> : null}
      <Text style={[styles.message, error ? styles.error : null]}>
        {loading ? 'Loading VoiceForge…' : error ?? empty}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { color: Colors.dark.textSecondary, fontSize: 15, textAlign: 'center' },
  error: { color: Colors.dark.danger },
});
