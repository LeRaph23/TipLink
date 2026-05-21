import { describe, it, expect, vi, afterEach } from 'vitest';
import { reverseGeocodeBatchBan } from '@/lib/osm-import';

// Build a CSV response that mimics the BAN /reverse/csv endpoint output.
// Header order matches what the real API returns (only the columns the parser
// looks up are relevant; the rest are filler).
function csv(rows: Array<Record<string, string>>): string {
  const headers = [
    'id', 'longitude', 'latitude',
    'result_label', 'result_score', 'result_type',
    'result_housenumber', 'result_street', 'result_postcode', 'result_city',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCell(r[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

function escapeCell(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function mockFetchCsv(body: string) {
  return vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'text/csv' } }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reverseGeocodeBatchBan', () => {
  it('returns an empty map for empty input without hitting the network', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const out = await reverseGeocodeBatchBan([]);
    expect(out.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('parses BAN CSV into a Map keyed by input id', async () => {
    const body = csv([
      {
        id: 'a1', longitude: '2.3522', latitude: '48.8566',
        result_label: '1 Place Jean-Paul II 75004 Paris',
        result_score: '0.95', result_housenumber: '1', result_street: 'Place Jean-Paul II',
        result_postcode: '75004', result_city: 'Paris',
      },
      {
        id: 'a2', longitude: '7.7521', latitude: '48.5734',
        result_label: 'Place du Château 67000 Strasbourg',
        result_score: '0.82', result_street: 'Place du Château',
        result_postcode: '67000', result_city: 'Strasbourg',
      },
    ]);
    globalThis.fetch = mockFetchCsv(body) as typeof fetch;

    const out = await reverseGeocodeBatchBan([
      { id: 'a1', lat: 48.8566, lon: 2.3522 },
      { id: 'a2', lat: 48.5734, lon: 7.7521 },
    ]);

    expect(out.size).toBe(2);
    expect(out.get('a1')).toEqual({
      address: '1 Place Jean-Paul II, Paris',
      postal_code: '75004',
    });
    expect(out.get('a2')).toEqual({
      address: 'Place du Château, Strasbourg',
      postal_code: '67000',
    });
  });

  it('drops rows below the minimum score (caller should fall back to Nominatim)', async () => {
    const body = csv([
      {
        id: 'good', longitude: '2.3', latitude: '48.8',
        result_label: 'Rue OK', result_score: '0.9',
        result_street: 'Rue OK', result_postcode: '75001', result_city: 'Paris',
      },
      {
        id: 'too-rough', longitude: '0', latitude: '0',
        result_label: 'Ocean', result_score: '0.10',
        result_street: '', result_postcode: '', result_city: '',
      },
    ]);
    globalThis.fetch = mockFetchCsv(body) as typeof fetch;

    const out = await reverseGeocodeBatchBan([
      { id: 'good', lat: 48.8, lon: 2.3 },
      { id: 'too-rough', lat: 0, lon: 0 },
    ]);

    expect(out.has('good')).toBe(true);
    expect(out.has('too-rough')).toBe(false);
  });

  it('falls back to result_label when street/city columns are blank', async () => {
    const body = csv([
      {
        id: 'labelonly', longitude: '2', latitude: '48',
        result_label: '2 rue de Rivoli 75001 Paris',
        result_score: '0.7',
        // street/city deliberately empty
        result_postcode: '75001',
      },
    ]);
    globalThis.fetch = mockFetchCsv(body) as typeof fetch;

    const out = await reverseGeocodeBatchBan([{ id: 'labelonly', lat: 48, lon: 2 }]);
    expect(out.get('labelonly')).toEqual({
      address: '2 rue de Rivoli 75001 Paris',
      postal_code: '75001',
    });
  });

  it('throws on HTTP error so the caller can decide whether to retry', async () => {
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch;
    await expect(
      reverseGeocodeBatchBan([{ id: '1', lat: 48, lon: 2 }])
    ).rejects.toThrow(/BAN HTTP 500/);
  });

  it('handles CSV cells with embedded commas via double-quote escaping', async () => {
    const body = csv([
      {
        id: 'comma', longitude: '2', latitude: '48',
        result_label: 'Place de la République, Paris', // contains a comma
        result_score: '0.9',
        result_street: 'Place de la République, secteur 1',
        result_postcode: '75011', result_city: 'Paris',
      },
    ]);
    globalThis.fetch = mockFetchCsv(body) as typeof fetch;

    const out = await reverseGeocodeBatchBan([{ id: 'comma', lat: 48, lon: 2 }]);
    expect(out.get('comma')?.address).toBe('Place de la République, secteur 1, Paris');
    expect(out.get('comma')?.postal_code).toBe('75011');
  });
});
