import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { searchSirene, estimateBirthYearFromFirstName } from '@/lib/sirene';

describe('estimateBirthYearFromFirstName', () => {
  it('returns 2003 for known young French first names', () => {
    expect(estimateBirthYearFromFirstName('Lucas')).toBe(2003);
    expect(estimateBirthYearFromFirstName('Emma')).toBe(2003);
    expect(estimateBirthYearFromFirstName('Léa')).toBe(2003); // diacritics stripped
    expect(estimateBirthYearFromFirstName('HUGO')).toBe(2003);
  });

  it('returns null for older / unknown names', () => {
    expect(estimateBirthYearFromFirstName('Jacqueline')).toBeNull();
    expect(estimateBirthYearFromFirstName('Bernard')).toBeNull();
    expect(estimateBirthYearFromFirstName(null)).toBeNull();
    expect(estimateBirthYearFromFirstName('')).toBeNull();
    expect(estimateBirthYearFromFirstName('123')).toBeNull();
  });

  it('strips diacritics, whitespace, and non-letters', () => {
    expect(estimateBirthYearFromFirstName('  Léo  ')).toBe(2003);
    expect(estimateBirthYearFromFirstName('Maël-Antoine')).toBeNull(); // composite → MAELANTOINE not matched
    expect(estimateBirthYearFromFirstName('Mael')).toBe(2003);
  });
});

describe('searchSirene', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.INSEE_API_KEY = 'test-key';
    process.env.INSEE_SIRENE_BASE_URL = 'https://test.example.com/sirene';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws when INSEE_API_KEY is missing', async () => {
    delete process.env.INSEE_API_KEY;
    await expect(searchSirene({ nafCodes: ['4791B'] })).rejects.toThrow(/INSEE_API_KEY/);
  });

  it('builds the Lucene query with NAF + creation date + personne physique', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ header: { total: 0 }, etablissements: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchSirene({
      nafCodes: ['4791B', '7022Z'],
      createdAfter: '2024-01-01',
      createdBefore: '2025-01-01',
      personnePhysiqueOnly: true,
    });

    // One HTTP call per NAF code (avoids OR in periode()).
    expect(fetchMock.mock.calls).toHaveLength(2);
    const url0 = String(fetchMock.mock.calls[0]![0]);
    const url1 = String(fetchMock.mock.calls[1]![0]);
    expect(url0).toContain('etatAdministratifEtablissement%3AA');
    expect(url0).toContain('4791B');
    expect(url1).toContain('7022Z');
    expect(url0).toContain('2024-01-01');
    expect(url0).toContain('2025-01-01');
  });

  it('passes the API key in the request header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ header: { total: 0 }, etablissements: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await searchSirene({ nafCodes: ['4791B'] });

    const opts = fetchMock.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(opts.headers['X-INSEE-Api-Key-Integration']).toBe('test-key');
  });

  it('maps raw etablissement to flat shape', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        header: { total: 1 },
        etablissements: [{
          siret: '12345678901234',
          uniteLegale: {
            denominationUniteLegale: null,
            prenomUsuelUniteLegale: 'Lucas',
            nomUniteLegale: 'Martin',
            dateCreationUniteLegale: '2024-06-15',
            activitePrincipaleUniteLegale: '4791B',
            categorieJuridiqueUniteLegale: '1000',
          },
          adresseEtablissement: {
            codePostalEtablissement: '69001',
            libelleCommuneEtablissement: 'LYON',
          },
        }],
      }),
    }) as unknown as typeof fetch;

    const r = await searchSirene({ nafCodes: ['4791B'] });
    expect(r.total).toBe(1);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toEqual({
      siret: '12345678901234',
      companyName: 'Lucas Martin',
      firstName: 'Lucas',
      lastName: 'Martin',
      city: 'LYON',
      postalCode: '69001',
      nafCode: '4791B',
      creationDate: '2024-06-15',
      categorieJuridique: '1000',
    });
  });

  it('detects when more pages are available', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        header: { total: 500 },
        etablissements: Array.from({ length: 100 }, (_, i) => ({
          siret: String(i).padStart(14, '0'),
          uniteLegale: {},
        })),
      }),
    }) as unknown as typeof fetch;

    const r = await searchSirene({ nafCodes: ['4791B'], pageSize: 100, page: 0, personnePhysiqueOnly: false });
    expect(r.hasMore).toBe(true);
    expect(r.results).toHaveLength(100);
  });

  it('throws a helpful error on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"erreur":"Too many requests"}',
    }) as unknown as typeof fetch;

    await expect(searchSirene({ nafCodes: ['4791B'] })).rejects.toThrow(/SIRENE API 429/);
  });
});
