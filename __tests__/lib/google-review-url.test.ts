import { describe, it, expect } from 'vitest';
import { buildGoogleReviewUrl, normalizeGoogleReviewUrl } from '@/lib/google-places';

describe('buildGoogleReviewUrl', () => {
  it('builds the canonical writereview deep link from a place_id', () => {
    expect(buildGoogleReviewUrl('ChIJabc123')).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJabc123',
    );
  });

  it('url-encodes the place id', () => {
    expect(buildGoogleReviewUrl('a b')).toContain('placeid=a%20b');
  });
});

describe('normalizeGoogleReviewUrl', () => {
  it('returns null for empty / junk input', () => {
    expect(normalizeGoogleReviewUrl('')).toBeNull();
    expect(normalizeGoogleReviewUrl('   ')).toBeNull();
    expect(normalizeGoogleReviewUrl('not a link')).toBeNull();
  });

  it('treats a bare place_id as a place id', () => {
    expect(normalizeGoogleReviewUrl('ChIJN1t_tDeuEmsRUsoyG83frY4')).toBe(
      'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    );
  });

  it('extracts place_id / placeid from a query string', () => {
    expect(
      normalizeGoogleReviewUrl('https://search.google.com/local/writereview?placeid=ChIJxyz'),
    ).toBe('https://search.google.com/local/writereview?placeid=ChIJxyz');
    expect(
      normalizeGoogleReviewUrl('https://maps.google.com/?cid=123&place_id=ChIJabc'),
    ).toBe('https://search.google.com/local/writereview?placeid=ChIJabc');
  });

  it('appends /review to a bare g.page link', () => {
    expect(normalizeGoogleReviewUrl('https://g.page/r/AbCdEf')).toBe(
      'https://g.page/r/AbCdEf/review',
    );
    expect(normalizeGoogleReviewUrl('https://g.page/r/AbCdEf/review')).toBe(
      'https://g.page/r/AbCdEf/review',
    );
  });

  it('keeps other google / maps urls as-is', () => {
    const u = 'https://maps.app.goo.gl/abcXYZ';
    expect(normalizeGoogleReviewUrl(u)).toBe(u);
  });
});
