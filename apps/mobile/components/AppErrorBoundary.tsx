import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/colors';

interface State { error: Error | null }

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>VoiceForge hit an unexpected error</Text>
        <Text style={styles.body}>Your saved local records remain on this device. Try returning to the app; if the problem repeats, export your data before clearing anything.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Try VoiceForge again" style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { color: Colors.dark.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { color: Colors.dark.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  button: { backgroundColor: Colors.dark.accent, borderRadius: 13, paddingHorizontal: 24, paddingVertical: 14, marginTop: 22 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
