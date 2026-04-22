import NfcManager, { NfcTech, Ndef } from 'react-native-nfc-manager';

export async function initNfc(): Promise<boolean> {
  return NfcManager.start();
}

export async function writeNfcUrl(url: string): Promise<void> {
  await NfcManager.requestTechnology(NfcTech.Ndef);

  try {
    const bytes = Ndef.encodeMessage([Ndef.uriRecord(url)]);
    if (!bytes) throw new Error('Failed to encode NDEF message');

    await NfcManager.ndefHandler.writeNdefMessage(bytes);
    // Lock the chip READ-ONLY to prevent URL tampering by third parties
    await NfcManager.ndefHandler.makeReadOnly();
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}

export async function readNfcTag(): Promise<string | null> {
  await NfcManager.requestTechnology(NfcTech.Ndef);
  try {
    const tag = await NfcManager.getTag();
    const record = tag?.ndefMessage?.[0];
    if (!record) return null;

    const decoded = Ndef.uri.decodePayload(record.payload as Uint8Array);
    return decoded;
  } finally {
    NfcManager.cancelTechnologyRequest();
  }
}
