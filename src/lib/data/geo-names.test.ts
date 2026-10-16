import { describe, expect, it } from 'vitest';
import {
  COUNTRIES, ERCOT_ZONES, US_STATES, isLatitude, isLongitude, matchCountry, matchErcotZone, matchUsCounty, matchUsState,
  normalizeGeoKey,
} from './geo-names';

describe('normalizeGeoKey', () => {
  it('lower-cases, strips diacritics and punctuation, folds & and underscores', () => {
    expect(normalizeGeoKey("  Côte d'Ivoire ")).toBe('cote d ivoire');
    expect(normalizeGeoKey('South_Central')).toBe('south central');
    expect(normalizeGeoKey('St. Kitts & Nevis')).toBe('st kitts and nevis');
    expect(normalizeGeoKey('U.S.A.')).toBe('u s a');
  });
});

describe('US states', () => {
  it('lists 50 states + DC with unique codes and FIPS', () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(51);
    expect(new Set(US_STATES.map((s) => s.fips)).size).toBe(51);
    expect(US_STATES.find((s) => s.code === 'TX')).toEqual({ name: 'Texas', code: 'TX', fips: '48' });
  });

  it('matches names, codes and DC spellings case-insensitively; rejects look-alikes', () => {
    expect(matchUsState('Texas')).toBe('TX');
    expect(matchUsState('texas')).toBe('TX');
    expect(matchUsState(' tx ')).toBe('TX');
    expect(matchUsState('NEW york')).toBe('NY');
    expect(matchUsState('Washington, D.C.')).toBe('DC');
    expect(matchUsState('District of Columbia')).toBe('DC');
    expect(matchUsState('Texas Instruments')).toBeNull();
    expect(matchUsState('Georgia Pacific')).toBeNull();
    expect(matchUsState('Tex')).toBeNull();
    expect(matchUsState('')).toBeNull();
  });
});

describe('countries', () => {
  it('covers ISO 3166-1 (≥ 249 entries) with unique alpha-2 and alpha-3', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    expect(new Set(COUNTRIES.map((c) => c.alpha2)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.alpha3)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) { expect(c.alpha2).toMatch(/^[A-Z]{2}$/); expect(c.alpha3).toMatch(/^[A-Z]{3}$/); }
  });

  it('matches alpha-2, alpha-3, common names and aliases to alpha-3', () => {
    expect(matchCountry('US')).toBe('USA');
    expect(matchCountry('usa')).toBe('USA');
    expect(matchCountry('United States')).toBe('USA');
    expect(matchCountry('United States of America')).toBe('USA');
    expect(matchCountry('U.S.')).toBe('USA');
    expect(matchCountry('UK')).toBe('GBR');
    expect(matchCountry('Great Britain')).toBe('GBR');
    expect(matchCountry('gb')).toBe('GBR');
    expect(matchCountry('Deutschland')).toBe('DEU');
    expect(matchCountry('Russia')).toBe('RUS');
    expect(matchCountry('Russian Federation')).toBe('RUS');
    expect(matchCountry('South Korea')).toBe('KOR');
    expect(matchCountry('Korea, Republic of')).toBe('KOR');
    expect(matchCountry("Côte d'Ivoire")).toBe('CIV');
    expect(matchCountry('Ivory Coast')).toBe('CIV');
    expect(matchCountry('Czech Republic')).toBe('CZE');
    expect(matchCountry('Türkiye')).toBe('TUR');
    expect(matchCountry('Turkey')).toBe('TUR');
    expect(matchCountry('Viet Nam')).toBe('VNM');
    expect(matchCountry('Dem. Rep. Congo')).toBe('COD');
    expect(matchCountry('Congo')).toBe('COG');
    expect(matchCountry('Kosovo')).toBe('XKX');
    expect(matchCountry('Georgia')).toBe('GEO');
  });

  it('rejects non-countries', () => {
    for (const v of ['Europe', 'Earth', 'Texas', 'Houston', 'USD', 'EU', 'Africa', '']) expect(matchCountry(v), v).toBeNull();
  });
});

describe('ERCOT zones', () => {
  it('matches the seven dataset spellings, South Central variants and the weather-zone crosswalk', () => {
    expect(ERCOT_ZONES).toEqual(['Houston', 'North', 'Northeast', 'Panhandle', 'South', 'South_Central', 'West']);
    for (const z of ERCOT_ZONES) expect(matchErcotZone(z)).toBe(z);
    expect(matchErcotZone('south central')).toBe('South_Central');
    expect(matchErcotZone('SOUTH_CENTRAL')).toBe('South_Central');
    expect(matchErcotZone('SouthCentral')).toBe('South_Central');
    expect(matchErcotZone('north east')).toBe('Northeast');
    expect(matchErcotZone('COAST')).toBe('Houston');
    expect(matchErcotZone('NCENT')).toBe('North');
    expect(matchErcotZone('FAR_WEST')).toBe('West');
    expect(matchErcotZone('East')).toBe('Northeast');
    expect(matchErcotZone('Dallas')).toBeNull();
    expect(matchErcotZone('Central')).toBeNull();
  });
});

describe('US counties', () => {
  it('parses "<County> County, <ST>", "<County>, <ST>", "<County> County" and FIPS', () => {
    expect(matchUsCounty('Harris County, TX')).toEqual({ name: 'Harris', state: 'TX', fips: null });
    expect(matchUsCounty('Travis, TX')).toEqual({ name: 'Travis', state: 'TX', fips: null });
    expect(matchUsCounty('Orleans Parish, LA')).toEqual({ name: 'Orleans', state: 'LA', fips: null });
    expect(matchUsCounty('Harris County')).toEqual({ name: 'Harris', state: null, fips: null });
    expect(matchUsCounty('48201')).toEqual({ name: null, state: 'TX', fips: '48201' });
    expect(matchUsCounty('01001')).toEqual({ name: null, state: 'AL', fips: '01001' });
  });

  it('rejects ZIP-like digits without a state FIPS prefix, FIPS when disallowed, bad states and plain words', () => {
    expect(matchUsCounty('77002')).toBeNull();
    expect(matchUsCounty('48000')).toBeNull();
    expect(matchUsCounty('48201', false)).toBeNull();
    expect(matchUsCounty('Harris County, XX')).toBeNull();
    expect(matchUsCounty('Harris, Texas')).toBeNull();
    expect(matchUsCounty('Houston')).toBeNull();
    expect(matchUsCounty('Texas Instruments')).toBeNull();
    expect(matchUsCounty(', TX')).toBeNull();
  });
});

describe('coordinates', () => {
  it('ranges are inclusive and NaN fails', () => {
    expect(isLatitude(-90)).toBe(true); expect(isLatitude(90)).toBe(true); expect(isLatitude(90.0001)).toBe(false);
    expect(isLongitude(-180)).toBe(true); expect(isLongitude(180)).toBe(true); expect(isLongitude(181)).toBe(false);
    expect(isLatitude(NaN)).toBe(false); expect(isLongitude(NaN)).toBe(false);
  });
});
