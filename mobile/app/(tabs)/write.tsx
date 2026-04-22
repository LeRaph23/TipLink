import { View, Text, StyleSheet } from 'react-native';
import { NFCWriter } from '../../components/NFCWriter';

// FIXME: Replace with actual establishment/staff IDs from auth context
const DEMO_ESTABLISHMENT_ID = 'demo-establishment-id';

export default function WriteScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Encode NFC Chip</Text>
      <Text style={styles.subtitle}>
        Hold your phone near an NTAG213 sticker to encode and lock it.
      </Text>
      <NFCWriter establishmentId={DEMO_ESTABLISHMENT_ID} />
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
});
