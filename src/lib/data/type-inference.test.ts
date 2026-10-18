import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GEO_MATCH_SHARE, headerGeoHint, inferAll, inferGeoRole, inferType, isNullToken, uniqueHeader } from './type-inference';

describe('isNullToken', () => {
  it('recognises the §1.2 null tokens case-insensitively after trimming', () => {
    for (const t of ['', 'NULL', 'null', 'NA', 'n/a', 'N/A', 'NaN', '#N/A', '  ', ' null ']) expect(isNullToken(t), t).toBe(true);
    for (const t of ['0', 'none', 'nan1', 'Null value', 'N', 'x']) expect(isNullToken(t), t).toBe(false);
  });
});

describe('inferType', () => {
  it('boolean only when every value is a boolean word; 0/1 stay numeric', () => {
    expect(inferType(['true', 'FALSE', 'yes', 'n', 'T', 'f', 'Y', 'no']).type).toBe('boolean');
    expect(inferType(['0', '1', '1']).type).toBe('integer');
    expect(inferType(['true', '1']).type).toBe('string');
  });

  it('integer needs a signed digit run inside ±2^31; otherwise number', () => {
    expect(inferType(['1', '-2', '+3', '2147483647'])).toMatchObject({ type: 'integer', storage: 'i32' });
    expect(inferType(['1', '2147483648'])).toMatchObject({ type: 'number', storage: 'f64' });
    expect(inferType(['1.5', '2', '.5', '4e2', '-1E-3'])).toMatchObject({ type: 'number', storage: 'f64' });
    expect(inferType(['1,234']).type).toBe('string');
    expect(inferType(['$5']).type).toBe('string');
    expect(inferType(['5%']).type).toBe('string');
  });

  it('dates: ISO first, datetime when a time part exists, ambiguity flagged', () => {
    expect(inferType(['2024-02-05', '2019-12-31'])).toMatchObject({ type: 'date', storage: 'date', dateFormat: 'yyyy-MM-dd', dateAmbiguous: false });
    expect(inferType(['2024-02-05T14:07'])).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm" });
    expect(inferType(['01/02/2024', '03/04/2024'])).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: true });
    expect(inferType(['13/01/2024', '02/29/2024']).type).toBe('string');
  });

  it('strips null tokens before deciding and reports counts', () => {
    const r = inferType(['NULL', '1', '', '2', 'NA']);
    expect(r).toMatchObject({ type: 'integer', nulls: 3, sampled: 2, confidence: 1 });
    expect(inferType(['', 'NULL'])).toMatchObject({ type: 'string', confidence: 0, nulls: 2, sampled: 0 });
    expect(inferType([' 5 ', '6']).type).toBe('integer');
  });
});

describe('uniqueHeader', () => {
  it('suffixes duplicates and names blank headers', () => {
    expect(uniqueHeader(['a', 'b', 'a', 'a', ''])).toEqual(['a', 'b', 'a (2)', 'a (3)', 'Column 5']);
    expect(uniqueHeader(['a', 'a (2)', 'a'])).toEqual(['a', 'a (2)', 'a (3)']);
  });
});

describe('headerGeoHint', () => {
  it('reads tokens, camelCase and glued names; stays silent otherwise', () => {
    expect(headerGeoHint('State')).toBe('us-state');
    expect(headerGeoHint('st')).toBe('us-state');
    expect(headerGeoHint('state_code')).toBe('us-state');
    expect(headerGeoHint('StateCode')).toBe('us-state');
    expect(headerGeoHint('Country')).toBe('country');
    expect(headerGeoHint('ISO3')).toBe('country');
    expect(headerGeoHint('iso_a2')).toBe('country');
    expect(headerGeoHint('County')).toBe('us-county');
    expect(headerGeoHint('county_fips')).toBe('us-county');
    expect(headerGeoHint('zone')).toBe('ercot-zone');
    expect(headerGeoHint('weather_zone')).toBe('ercot-zone');
    expect(headerGeoHint('Lat')).toBe('latitude');
    expect(headerGeoHint('latitude (generated)')).toBe('latitude');
    expect(headerGeoHint('lon')).toBe('longitude');
    expect(headerGeoHint('lng')).toBe('longitude');
    expect(headerGeoHint('Longitude')).toBe('longitude');
    for (const h of ['price_usd_mwh', 'region', 'demand_mw', 'timestamp', 'first', 'platform', 'name']) expect(headerGeoHint(h), h).toBeNull();
  });
});

describe('inferGeoRole', () => {
  const STATES = ['Texas', 'California', 'New York', 'Florida', 'Ohio', 'Georgia', 'Maine', 'Utah', 'Iowa', 'Nevada'];
  const CODES = ['TX', 'CA', 'NY', 'FL', 'OH', 'GA', 'ME', 'UT', 'IA', 'NV'];
  const ISO2 = ['US', 'CA', 'MX', 'GB', 'FR', 'DE', 'JP', 'CN', 'BR', 'IN'];
  const ISO3 = ['USA', 'CAN', 'MEX', 'GBR', 'FRA', 'DEU', 'JPN', 'CHN', 'BRA', 'IND'];
  const NAMES = ['United States', 'Canada', 'Mexico', 'United Kingdom', 'France', 'Germany', 'Japan', 'China', 'Brazil', 'India'];
  const ZONES = ['Houston', 'North', 'Northeast', 'Panhandle', 'South', 'South_Central', 'West'];

  it('US states by name, by code and mixed, in any case', () => {
    expect(inferGeoRole('state', STATES, 'string')).toBe('us-state');
    expect(inferGeoRole('state', CODES, 'string')).toBe('us-state');
    expect(inferGeoRole('region', STATES.map((s) => s.toUpperCase()), 'string')).toBe('us-state');
    expect(inferGeoRole('loc', [...CODES.map((c) => c.toLowerCase()), ...STATES], 'string')).toBe('us-state');
    expect(inferGeoRole('st', ['tx', 'ca', 'ny'], 'string')).toBe('us-state');
  });

  it('countries by ISO2, ISO3 and English name, with and without a header hint', () => {
    expect(inferGeoRole('iso', ISO2, 'string')).toBe('country');
    expect(inferGeoRole('Country Code', ISO3, 'string')).toBe('country');
    expect(inferGeoRole('country', NAMES, 'string')).toBe('country');
    expect(inferGeoRole('x', [...ISO3, ...NAMES.map((n) => n.toLowerCase())], 'string')).toBe('country');
    expect(inferGeoRole('x', ['Côte d’Ivoire', 'Viet Nam', 'Russia', 'South Korea', 'Czechia'], 'string')).toBe('country');
  });

  it('ambiguous two-letter codes: the header decides, else states win the tie', () => {
    const both = ['CA', 'DE', 'IN', 'GA', 'PA'];
    expect(inferGeoRole('country', both, 'string')).toBe('country');
    expect(inferGeoRole('state', both, 'string')).toBe('us-state');
    expect(inferGeoRole('code', both, 'string')).toBe('us-state');
  });

  it('ERCOT zones: dataset spelling, "South Central", compass-only needs a zone header', () => {
    expect(inferGeoRole('zone', ZONES, 'string')).toBe('ercot-zone');
    expect(inferGeoRole('region', ZONES, 'string')).toBe('ercot-zone');
    expect(inferGeoRole('region', ['Houston', 'South Central', 'west', 'NORTH'], 'string')).toBe('ercot-zone');
    expect(inferGeoRole('direction', ['North', 'South', 'West'], 'string')).toBeNull();
    expect(inferGeoRole('zone', ['North', 'South', 'West'], 'string')).toBe('ercot-zone');
    expect(inferGeoRole('direction', ['North', 'South', 'West', 'East'], 'string')).toBeNull();
  });

  it('latitude / longitude need a numeric type, the header and the range', () => {
    const lats = ['29.76', '32.78', '-33.87', '51.5', '0'];
    const lons = ['-95.37', '-96.8', '151.2', '-0.12', '179.9'];
    expect(inferGeoRole('lat', lats, 'number')).toBe('latitude');
    expect(inferGeoRole('Latitude', lats, 'number')).toBe('latitude');
    expect(inferGeoRole('lon', lons, 'number')).toBe('longitude');
    expect(inferGeoRole('lng', lons, 'number')).toBe('longitude');
    expect(inferGeoRole('longitude', ['1', '2'], 'integer')).toBe('longitude');
    expect(inferGeoRole('lat', lons, 'number')).toBeNull(); // 151.2 and 179.9 are out of range → 3/5 < 80%
    expect(inferGeoRole('latitude', ['200', '300'], 'number')).toBeNull();
    expect(inferGeoRole('price', lats, 'number')).toBeNull();
    expect(inferGeoRole('lat', lats, 'string')).toBeNull();
    expect(inferGeoRole('lat', lats, 'date')).toBeNull();
  });

  it('counties by pattern; bare FIPS only under a county / FIPS header', () => {
    expect(inferGeoRole('county', ['Harris County, TX', 'Travis County, TX', 'Orleans Parish, LA', 'Cook, IL'], 'string')).toBe('us-county');
    expect(inferGeoRole('place', ['Harris County', 'Travis County', 'Dallas County'], 'string')).toBe('us-county');
    expect(inferGeoRole('fips', ['48201', '48453', '01001', '06037'], 'string')).toBe('us-county');
    expect(inferGeoRole('zip', ['48201', '48453', '01001', '06037'], 'string')).toBeNull();
    expect(inferGeoRole('county_fips', ['48201', '48453', '1001', '6037'], 'integer')).toBe('us-county');
    expect(inferGeoRole('id', ['48201', '48453', '1001', '6037'], 'integer')).toBeNull();
  });

  it(`needs ≥ ${GEO_MATCH_SHARE * 100}% of sampled values and rejects look-alikes`, () => {
    expect(inferGeoRole('state', [...STATES.slice(0, 8), 'Texas Instruments', 'Georgia Pacific'], 'string')).toBe('us-state');
    expect(inferGeoRole('state', [...STATES.slice(0, 7), 'Texas Instruments', 'Georgia Pacific', 'Ohio Valley'], 'string')).toBeNull();
    expect(inferGeoRole('company', ['Texas Instruments', 'Georgia Pacific', 'Delaware North'], 'string')).toBeNull();
    expect(inferGeoRole('state', [], 'string')).toBeNull();
    expect(inferGeoRole('state', STATES, 'boolean')).toBeNull();
  });
});

describe('inferAll on tests/fixtures/types.csv', () => {
  const text = readFileSync(join(__dirname, '../../../tests/fixtures/types.csv'), 'utf8');
  const lines = text.trim().split('\n');
  const header = lines[0]!.split(',');
  const rows = lines.slice(1).map((l) => l.split(','));
  const metas = inferAll(header, rows);
  const by = Object.fromEntries(metas.map((m) => [m.name, m]));

  it('infers every column as the fixture intends', () => {
    expect(by.bool_tf).toMatchObject({ type: 'boolean', storage: 'bool', role: 'dimension', defaultAggregation: 'count' });
    expect(by.bool_yn!.type).toBe('boolean');
    expect(by.int_small).toMatchObject({ type: 'integer', storage: 'i32', role: 'measure', defaultContinuity: 'continuous', defaultAggregation: 'sum' });
    expect(by.int_big).toMatchObject({ type: 'number', storage: 'f64' });
    expect(by.num!.type).toBe('number');
    expect(by.iso_dt).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSS", role: 'dimension', defaultContinuity: 'discrete' });
    expect(by.iso_z).toMatchObject({ type: 'datetime', dateFormat: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" });
    expect(by.date_only).toMatchObject({ type: 'date', dateFormat: 'yyyy-MM-dd' });
    expect(by.us_md).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: false });
    expect(by.us_dm).toMatchObject({ type: 'date', dateFormat: 'dd/MM/yyyy', dateAmbiguous: false });
    expect(by.us_amb).toMatchObject({ type: 'date', dateFormat: 'MM/dd/yyyy', dateAmbiguous: true });
    expect(by.month_name).toMatchObject({ type: 'date', dateFormat: 'dd-MMM-yyyy' });
    expect(by.str_mixed).toMatchObject({ type: 'string', storage: 'dict', nullCount: 1 });
    expect(by.nulls_only).toMatchObject({ type: 'string', nullCount: 6, confidence: 0 });
    expect(by.int_with_null).toMatchObject({ type: 'integer', nullCount: 2 });
    expect(by.yyyymm).toMatchObject({ type: 'date', dateFormat: 'yyyy-MM' });
    expect(by.time_only).toMatchObject({ type: 'datetime', dateFormat: 'HH:mm:ss' });
  });

  it('dedupes header names and numbers columns by position', () => {
    expect(metas.map((m) => m.name).slice(-2)).toEqual(['dup', 'dup (2)']);
    metas.forEach((m, i) => expect(m.index).toBe(i));
  });

  it('reports geoRole on every field (null when none)', () => {
    for (const m of metas) expect(m.geoRole, m.name).toBeNull();
    const geo = inferAll(['zone', 'state', 'lat', 'lon', 'price'], [
      ['Houston', 'TX', '29.76', '-95.37', '20'], ['West', 'Texas', '31.9', '-102.1', '18'], ['North', 'OK', '32.8', '-96.8', '25'],
    ]);
    expect(geo.map((m) => m.geoRole)).toEqual(['ercot-zone', 'us-state', 'latitude', 'longitude', null]);
  });
});
