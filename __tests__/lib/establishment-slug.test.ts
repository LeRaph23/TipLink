import { describe, it, expect } from 'vitest';
import { slugifyEstablishmentName } from '@/lib/establishment-slug';

describe('slugifyEstablishmentName', () => {
  it('lowercases the name', () => {
    expect(slugifyEstablishmentName('Salon Beauté')).toBe('salon-beaute');
    expect(slugifyEstablishmentName('LE GRAND SALON')).toBe('le-grand-salon');
  });

  it('strips accents (é → e, à → a, etc.)', () => {
    expect(slugifyEstablishmentName('Élégance')).toBe('elegance');
    expect(slugifyEstablishmentName('Côté Rêve')).toBe('cote-reve');
    expect(slugifyEstablishmentName('Crème Brûlée')).toBe('creme-brulee');
    expect(slugifyEstablishmentName('Açaí')).toBe('acai');
  });

  it('replaces runs of non-alphanumerics with a single hyphen', () => {
    expect(slugifyEstablishmentName('Hair & Beauty')).toBe('hair-beauty');
    expect(slugifyEstablishmentName('Salon   des     fleurs')).toBe('salon-des-fleurs');
    expect(slugifyEstablishmentName('A---B___C')).toBe('a-b-c');
    expect(slugifyEstablishmentName("L'Atelier d'Émilie")).toBe('l-atelier-d-emilie');
  });

  it('keeps digits', () => {
    expect(slugifyEstablishmentName('Studio 54')).toBe('studio-54');
    expect(slugifyEstablishmentName('Coiffure 2000')).toBe('coiffure-2000');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyEstablishmentName('  Salon  ')).toBe('salon');
    expect(slugifyEstablishmentName('!!!Salon!!!')).toBe('salon');
    expect(slugifyEstablishmentName('---Salon---')).toBe('salon');
    expect(slugifyEstablishmentName('&Salon&')).toBe('salon');
  });

  it('caps the slug at 80 characters', () => {
    const longName = 'a'.repeat(200);
    const slug = slugifyEstablishmentName(longName);
    expect(slug).toHaveLength(80);
    expect(slug).toBe('a'.repeat(80));
  });

  it('caps at 80 characters even with hyphenated words', () => {
    const longName = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    const slug = slugifyEstablishmentName(longName);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it('maps the same name to the same slug (the dedup-collision case)', () => {
    // Two establishments with the same display name produce an identical base
    // slug; this is exactly why makeUniqueEstablishmentSlug must disambiguate.
    expect(slugifyEstablishmentName('Le Salon')).toBe(
      slugifyEstablishmentName('Le Salon'),
    );
    // Names that differ only by accent/case/punctuation also collide.
    expect(slugifyEstablishmentName('Le Salon')).toBe(
      slugifyEstablishmentName('LE  SÀLON!'),
    );
  });

  it('returns an empty string (falsy, caller-handleable base) for empty input', () => {
    expect(slugifyEstablishmentName('')).toBe('');
  });

  it('returns an empty string when the name has no alphanumeric characters', () => {
    expect(slugifyEstablishmentName('   ')).toBe('');
    expect(slugifyEstablishmentName('!!!')).toBe('');
    expect(slugifyEstablishmentName('-_-')).toBe('');
    expect(slugifyEstablishmentName('### @@@ ***')).toBe('');
    // Pure-emoji / non-latin scripts strip to nothing too.
    expect(slugifyEstablishmentName('日本語')).toBe('');
  });

  it('produces a slug containing only [a-z0-9-] with no leading/trailing hyphen', () => {
    const samples = [
      'Salon Beauté & Spa #1',
      "  L'Étoile du Nord  ",
      'Crème de la Crème!!!',
      'Müller & Söhne GmbH',
    ];
    for (const name of samples) {
      const slug = slugifyEstablishmentName(name);
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });
});
