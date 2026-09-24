import { describe, expect, it } from 'vitest';
import { MAX_ATTACHMENTS_BYTES, readAttachments, sanitizeFilename } from '@/lib/admin/email-attachments';

const file = (name: string, bytes = 10) => new File([new Uint8Array(bytes)], name);

describe('readAttachments', () => {
  it('reads allowed files and keeps their content', async () => {
    const res = await readAttachments([file('Invoice-0002.pdf', 3), file('photo.JPG')]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.attachments.map((a) => a.filename)).toEqual(['Invoice-0002.pdf', 'photo.JPG']);
    expect(res.attachments[0].content.length).toBe(3);
  });

  it('ignores the empty entry a form sends when no file is picked', async () => {
    const res = await readAttachments([file('', 0)]);
    expect(res).toEqual({ ok: true, attachments: [] });
  });

  it('refuses executables and files without extension', async () => {
    expect((await readAttachments([file('facture.pdf.exe')])).ok).toBe(false);
    expect((await readAttachments([file('README')])).ok).toBe(false);
  });

  it('refuses more than 5 files', async () => {
    const res = await readAttachments(Array.from({ length: 6 }, (_, i) => file(`f${i}.pdf`)));
    expect(res.ok).toBe(false);
  });

  it('refuses a total above the limit', async () => {
    const res = await readAttachments([file('a.pdf', MAX_ATTACHMENTS_BYTES), file('b.pdf', 1)]);
    expect(res.ok).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('drops paths and header-breaking characters', () => {
    expect(sanitizeFilename('../../etc/pass"wd\r\n.pdf')).toBe('passwd.pdf');
    expect(sanitizeFilename('C:\\Users\\me\\avoir.pdf')).toBe('avoir.pdf');
  });

  it('shortens long names but keeps the extension', () => {
    const name = sanitizeFilename(`${'a'.repeat(200)}.pdf`);
    expect(name.length).toBe(100);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});
