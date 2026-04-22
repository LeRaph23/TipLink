import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { writeNfcUrl } from '../lib/nfc';
import { nanoid } from '../lib/nanoid';
import { supabase } from '../lib/supabase';

interface Props {
  establishmentId: string;
  staffId?: string;
}

type WriteState = 'idle' | 'provisioning' | 'waiting_nfc' | 'writing' | 'success' | 'error';

export function NFCWriter({ establishmentId, staffId }: Props) {
  const [state, setState] = useState<WriteState>('idle');
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = process.env.EXPO_PUBLIC_BASE_URL ?? 'https://tipl.ink';

  const handleWrite = async () => {
    setState('provisioning');
    setError(null);

    try {
      // 1. Generate NanoID and persist sticker to Supabase
      const shortId = nanoid();

      const { error: dbError } = await supabase
        .from('nfc_stickers')
        .insert({
          short_id: shortId,
          establishment_id: staffId ? null : establishmentId,
          staff_id: staffId ?? null,
        });

      if (dbError) throw new Error(dbError.message);

      const url = `${baseUrl}/s/${shortId}`;
      setLastUrl(url);

      // 2. Prompt user to hold phone to NFC chip
      setState('waiting_nfc');

      // 3. Write URL to chip and lock READ-ONLY
      setState('writing');
      await writeNfcUrl(url);

      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'NFC write failed');
      setState('error');
    }
  };

  const stateMessages: Record<WriteState, string> = {
    idle: 'Tap to encode a new NFC chip',
    provisioning: 'Generating sticker ID…',
    waiting_nfc: 'Hold phone near the NFC chip…',
    writing: 'Writing & locking chip…',
    success: 'Chip encoded successfully!',
    error: error ?? 'Something went wrong',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.message}>{stateMessages[state]}</Text>

      {lastUrl && state === 'success' && (
        <Text style={styles.url}>{lastUrl}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.button,
          state === 'waiting_nfc' || state === 'writing' ? styles.buttonDisabled : null,
        ]}
        onPress={handleWrite}
        disabled={state === 'waiting_nfc' || state === 'writing' || state === 'provisioning'}
      >
        <Text style={styles.buttonText}>
          {state === 'success' ? 'Encode another chip' : 'Encode NFC chip'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#374151',
  },
  url: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6B7280',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#111827',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
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
});
