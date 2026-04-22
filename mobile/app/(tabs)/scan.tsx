import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { readNfcTag } from '../../lib/nfc';

export default function ScanScreen() {
  const [url, setUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    try {
      const result = await readNfcTag();
      setUrl(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan NFC Chip</Text>
      <Text style={styles.subtitle}>Verify the URL encoded on a chip.</Text>

      <TouchableOpacity
        style={[styles.button, isScanning && styles.buttonDisabled]}
        onPress={handleScan}
        disabled={isScanning}
      >
        <Text style={styles.buttonText}>
          {isScanning ? 'Hold phone near chip…' : 'Scan chip'}
        </Text>
      </TouchableOpacity>

      {url && (
        <View style={styles.result}>
          <Text style={styles.resultLabel}>Encoded URL:</Text>
          <Text style={styles.resultUrl}>{url}</Text>
        </View>
      )}

      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  result: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  resultLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  resultUrl: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#111827',
  },
  error: {
    marginTop: 16,
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
