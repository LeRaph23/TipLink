import { describe, it, expect } from 'vitest';
import {
  FRENCH_REGIONS,
  getRegion,
  departmentsForRegions,
} from '@/lib/admin/french-regions';

describe('FRENCH_REGIONS', () => {
  it('lists the 13 metropolitan regions', () => {
    expect(FRENCH_REGIONS).toHaveLength(13);
  });

  it('contains all 96 metropolitan départements with no duplicates', () => {
    const all = FRENCH_REGIONS.flatMap((r) => r.departments);
    expect(all).toHaveLength(96);
    expect(new Set(all).size).toBe(96);
  });

  it('uses typographic apostrophes for OSM-exact département names', () => {
    // OSM stores these with U+2019, not U+0027. The fetchZonesForCity query
    // matches by exact equality, so a straight ASCII apostrophe would miss.
    const all = FRENCH_REGIONS.flatMap((r) => r.departments);
    expect(all).toContain('Val-d’Oise');
    expect(all).toContain('Côte-d’Or');
    expect(all).toContain('Côtes-d’Armor');
  });
});

describe('getRegion', () => {
  it('returns the matching region by code', () => {
    const idf = getRegion('IDF');
    expect(idf?.name).toBe('Île-de-France');
    expect(idf?.departments).toContain('Paris');
  });

  it('returns undefined for an unknown code', () => {
    expect(getRegion('NOPE')).toBeUndefined();
  });
});

describe('departmentsForRegions', () => {
  it('flattens selected regions in catalog order', () => {
    const out = departmentsForRegions(['COR', 'IDF']);
    // IDF comes first in FRENCH_REGIONS, then COR — preserved here.
    const firstFew = out.slice(0, 3);
    expect(firstFew).toEqual(['Paris', 'Seine-et-Marne', 'Yvelines']);
    expect(out).toContain('Corse-du-Sud');
    expect(out).toContain('Haute-Corse');
  });

  it('returns empty for empty input', () => {
    expect(departmentsForRegions([])).toEqual([]);
  });

  it('silently drops unknown region codes', () => {
    const out = departmentsForRegions(['COR', 'NOPE']);
    expect(out).toEqual(['Corse-du-Sud', 'Haute-Corse']);
  });
});
