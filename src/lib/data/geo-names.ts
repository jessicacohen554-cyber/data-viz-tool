/**
 * Geographic name tables and value matchers for geo-role inference (shard T1,
 * owner ruling D-13). Every matcher returns the **canonical key the map layers
 * in `public/geo/` carry** so a matched value joins a polygon directly:
 * US states → USPS code (`us-states.geojson` `code`), countries → ISO 3166-1
 * alpha-3 (`world-countries.geojson` `iso_a3`), ERCOT zones → the dataset
 * spelling (`ercot-zones.geojson` `zone`), counties → `{ name, state, fips }`.
 *
 * Matching is case-insensitive and ignores diacritics, punctuation and
 * underscore/space differences (`normalizeGeoKey`). Tables are plain data:
 * 50 states + DC, the 249 ISO 3166-1 entries plus Kosovo (`XK`) with common
 * English names and aliases, and the seven ERCOT model zones with the
 * weather-zone crosswalk documented in `public/geo/README.md`.
 *
 * Framework-free and main-thread-safe (R-PURE).
 */

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Canonical lookup form of a label: trimmed, lower-cased, diacritics stripped,
 * `&` → `and`, every run of punctuation / underscores / whitespace → one space.
 */
export function normalizeGeoKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// US states
// ---------------------------------------------------------------------------

/** One US state (or DC): name, USPS code, 2-digit Census FIPS code. */
export interface UsState { name: string; code: string; fips: string }

/** The 50 states plus the District of Columbia, alphabetical by name. */
export const US_STATES: readonly UsState[] = [
  { name: 'Alabama', code: 'AL', fips: '01' }, { name: 'Alaska', code: 'AK', fips: '02' },
  { name: 'Arizona', code: 'AZ', fips: '04' }, { name: 'Arkansas', code: 'AR', fips: '05' },
  { name: 'California', code: 'CA', fips: '06' }, { name: 'Colorado', code: 'CO', fips: '08' },
  { name: 'Connecticut', code: 'CT', fips: '09' }, { name: 'Delaware', code: 'DE', fips: '10' },
  { name: 'District of Columbia', code: 'DC', fips: '11' }, { name: 'Florida', code: 'FL', fips: '12' },
  { name: 'Georgia', code: 'GA', fips: '13' }, { name: 'Hawaii', code: 'HI', fips: '15' },
  { name: 'Idaho', code: 'ID', fips: '16' }, { name: 'Illinois', code: 'IL', fips: '17' },
  { name: 'Indiana', code: 'IN', fips: '18' }, { name: 'Iowa', code: 'IA', fips: '19' },
  { name: 'Kansas', code: 'KS', fips: '20' }, { name: 'Kentucky', code: 'KY', fips: '21' },
  { name: 'Louisiana', code: 'LA', fips: '22' }, { name: 'Maine', code: 'ME', fips: '23' },
  { name: 'Maryland', code: 'MD', fips: '24' }, { name: 'Massachusetts', code: 'MA', fips: '25' },
  { name: 'Michigan', code: 'MI', fips: '26' }, { name: 'Minnesota', code: 'MN', fips: '27' },
  { name: 'Mississippi', code: 'MS', fips: '28' }, { name: 'Missouri', code: 'MO', fips: '29' },
  { name: 'Montana', code: 'MT', fips: '30' }, { name: 'Nebraska', code: 'NE', fips: '31' },
  { name: 'Nevada', code: 'NV', fips: '32' }, { name: 'New Hampshire', code: 'NH', fips: '33' },
  { name: 'New Jersey', code: 'NJ', fips: '34' }, { name: 'New Mexico', code: 'NM', fips: '35' },
  { name: 'New York', code: 'NY', fips: '36' }, { name: 'North Carolina', code: 'NC', fips: '37' },
  { name: 'North Dakota', code: 'ND', fips: '38' }, { name: 'Ohio', code: 'OH', fips: '39' },
  { name: 'Oklahoma', code: 'OK', fips: '40' }, { name: 'Oregon', code: 'OR', fips: '41' },
  { name: 'Pennsylvania', code: 'PA', fips: '42' }, { name: 'Rhode Island', code: 'RI', fips: '44' },
  { name: 'South Carolina', code: 'SC', fips: '45' }, { name: 'South Dakota', code: 'SD', fips: '46' },
  { name: 'Tennessee', code: 'TN', fips: '47' }, { name: 'Texas', code: 'TX', fips: '48' },
  { name: 'Utah', code: 'UT', fips: '49' }, { name: 'Vermont', code: 'VT', fips: '50' },
  { name: 'Virginia', code: 'VA', fips: '51' }, { name: 'Washington', code: 'WA', fips: '53' },
  { name: 'West Virginia', code: 'WV', fips: '54' }, { name: 'Wisconsin', code: 'WI', fips: '55' },
  { name: 'Wyoming', code: 'WY', fips: '56' },
];

/** Extra spellings → USPS code (normalised on build). */
const STATE_ALIASES: ReadonlyArray<[alias: string, code: string]> = [
  ['Washington DC', 'DC'], ['Washington D.C.', 'DC'], ['D.C.', 'DC'],
];

const STATE_BY_KEY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const s of US_STATES) { m.set(normalizeGeoKey(s.name), s.code); m.set(normalizeGeoKey(s.code), s.code); }
  for (const [alias, code] of STATE_ALIASES) m.set(normalizeGeoKey(alias), code);
  return m;
})();

const STATE_FIPS: ReadonlySet<string> = new Set(US_STATES.map((s) => s.fips));

/** USPS code of a state name / code / alias, or null. */
export function matchUsState(raw: string): string | null {
  return STATE_BY_KEY.get(normalizeGeoKey(raw)) ?? null;
}

// ---------------------------------------------------------------------------
// Countries (ISO 3166-1)
// ---------------------------------------------------------------------------

/** One country: common English name, ISO alpha-2, alpha-3, further accepted spellings. */
export interface Country { name: string; alpha2: string; alpha3: string; aliases: readonly string[] }

type Row = [alpha2: string, alpha3: string, name: string, ...aliases: string[]];

const COUNTRY_ROWS: readonly Row[] = [
  ['AF', 'AFG', 'Afghanistan'], ['AX', 'ALA', 'Åland Islands', 'Aland'], ['AL', 'ALB', 'Albania'],
  ['DZ', 'DZA', 'Algeria'], ['AS', 'ASM', 'American Samoa'], ['AD', 'AND', 'Andorra'], ['AO', 'AGO', 'Angola'],
  ['AI', 'AIA', 'Anguilla'], ['AQ', 'ATA', 'Antarctica'], ['AG', 'ATG', 'Antigua and Barbuda', 'Antigua and Barb.'],
  ['AR', 'ARG', 'Argentina'], ['AM', 'ARM', 'Armenia'], ['AW', 'ABW', 'Aruba'], ['AU', 'AUS', 'Australia'],
  ['AT', 'AUT', 'Austria'], ['AZ', 'AZE', 'Azerbaijan'], ['BS', 'BHS', 'Bahamas', 'The Bahamas'],
  ['BH', 'BHR', 'Bahrain'], ['BD', 'BGD', 'Bangladesh'], ['BB', 'BRB', 'Barbados'], ['BY', 'BLR', 'Belarus'],
  ['BE', 'BEL', 'Belgium'], ['BZ', 'BLZ', 'Belize'], ['BJ', 'BEN', 'Benin'], ['BM', 'BMU', 'Bermuda'],
  ['BT', 'BTN', 'Bhutan'], ['BO', 'BOL', 'Bolivia', 'Bolivia (Plurinational State of)', 'Plurinational State of Bolivia'],
  ['BQ', 'BES', 'Bonaire, Sint Eustatius and Saba', 'Caribbean Netherlands'],
  ['BA', 'BIH', 'Bosnia and Herzegovina', 'Bosnia and Herz.', 'Bosnia'], ['BW', 'BWA', 'Botswana'],
  ['BV', 'BVT', 'Bouvet Island'], ['BR', 'BRA', 'Brazil', 'Brasil'], ['IO', 'IOT', 'British Indian Ocean Territory'],
  ['BN', 'BRN', 'Brunei', 'Brunei Darussalam'], ['BG', 'BGR', 'Bulgaria'], ['BF', 'BFA', 'Burkina Faso'],
  ['BI', 'BDI', 'Burundi'], ['CV', 'CPV', 'Cabo Verde', 'Cape Verde'], ['KH', 'KHM', 'Cambodia'],
  ['CM', 'CMR', 'Cameroon'], ['CA', 'CAN', 'Canada'], ['KY', 'CYM', 'Cayman Islands', 'Cayman Is.'],
  ['CF', 'CAF', 'Central African Republic', 'Central African Rep.'], ['TD', 'TCD', 'Chad'], ['CL', 'CHL', 'Chile'],
  ['CN', 'CHN', 'China', "People's Republic of China", 'PRC', 'Mainland China'], ['CX', 'CXR', 'Christmas Island'],
  ['CC', 'CCK', 'Cocos (Keeling) Islands', 'Cocos Islands'], ['CO', 'COL', 'Colombia'], ['KM', 'COM', 'Comoros'],
  ['CG', 'COG', 'Congo', 'Republic of the Congo', 'Congo-Brazzaville', 'Congo, Rep.'],
  ['CD', 'COD', 'Democratic Republic of the Congo', 'Congo, Democratic Republic of the', 'DR Congo', 'DRC', 'Dem. Rep. Congo', 'Congo-Kinshasa', 'Congo, Dem. Rep.', 'Zaire'],
  ['CK', 'COK', 'Cook Islands', 'Cook Is.'], ['CR', 'CRI', 'Costa Rica'],
  ['CI', 'CIV', "Côte d'Ivoire", 'Ivory Coast', 'Cote dIvoire'], ['HR', 'HRV', 'Croatia'], ['CU', 'CUB', 'Cuba'],
  ['CW', 'CUW', 'Curaçao'], ['CY', 'CYP', 'Cyprus'], ['CZ', 'CZE', 'Czechia', 'Czech Republic'],
  ['DK', 'DNK', 'Denmark'], ['DJ', 'DJI', 'Djibouti'], ['DM', 'DMA', 'Dominica'],
  ['DO', 'DOM', 'Dominican Republic', 'Dominican Rep.'], ['EC', 'ECU', 'Ecuador'], ['EG', 'EGY', 'Egypt'],
  ['SV', 'SLV', 'El Salvador'], ['GQ', 'GNQ', 'Equatorial Guinea', 'Eq. Guinea'], ['ER', 'ERI', 'Eritrea'],
  ['EE', 'EST', 'Estonia'], ['SZ', 'SWZ', 'Eswatini', 'eSwatini', 'Swaziland'], ['ET', 'ETH', 'Ethiopia'],
  ['FK', 'FLK', 'Falkland Islands', 'Falkland Islands (Malvinas)', 'Falkland Is.', 'Malvinas'],
  ['FO', 'FRO', 'Faroe Islands', 'Faeroe Islands', 'Faroe Is.'], ['FJ', 'FJI', 'Fiji'], ['FI', 'FIN', 'Finland'],
  ['FR', 'FRA', 'France'], ['GF', 'GUF', 'French Guiana'], ['PF', 'PYF', 'French Polynesia'],
  ['TF', 'ATF', 'French Southern Territories', 'French Southern and Antarctic Lands', 'Fr. S. Antarctic Lands'],
  ['GA', 'GAB', 'Gabon'], ['GM', 'GMB', 'Gambia', 'The Gambia'], ['GE', 'GEO', 'Georgia'],
  ['DE', 'DEU', 'Germany', 'Deutschland'], ['GH', 'GHA', 'Ghana'], ['GI', 'GIB', 'Gibraltar'],
  ['GR', 'GRC', 'Greece'], ['GL', 'GRL', 'Greenland'], ['GD', 'GRD', 'Grenada'], ['GP', 'GLP', 'Guadeloupe'],
  ['GU', 'GUM', 'Guam'], ['GT', 'GTM', 'Guatemala'], ['GG', 'GGY', 'Guernsey'], ['GN', 'GIN', 'Guinea'],
  ['GW', 'GNB', 'Guinea-Bissau'], ['GY', 'GUY', 'Guyana'], ['HT', 'HTI', 'Haiti'],
  ['HM', 'HMD', 'Heard Island and McDonald Islands', 'Heard I. and McDonald Is.'],
  ['VA', 'VAT', 'Vatican City', 'Holy See', 'Vatican'], ['HN', 'HND', 'Honduras'],
  ['HK', 'HKG', 'Hong Kong', 'Hong Kong SAR'], ['HU', 'HUN', 'Hungary'], ['IS', 'ISL', 'Iceland'],
  ['IN', 'IND', 'India'], ['ID', 'IDN', 'Indonesia'],
  ['IR', 'IRN', 'Iran', 'Iran (Islamic Republic of)', 'Islamic Republic of Iran'], ['IQ', 'IRQ', 'Iraq'],
  ['IE', 'IRL', 'Ireland', 'Republic of Ireland'], ['IM', 'IMN', 'Isle of Man'], ['IL', 'ISR', 'Israel'],
  ['IT', 'ITA', 'Italy'], ['JM', 'JAM', 'Jamaica'], ['JP', 'JPN', 'Japan'], ['JE', 'JEY', 'Jersey'],
  ['JO', 'JOR', 'Jordan'], ['KZ', 'KAZ', 'Kazakhstan'], ['KE', 'KEN', 'Kenya'], ['KI', 'KIR', 'Kiribati'],
  ['KP', 'PRK', 'North Korea', "Korea (Democratic People's Republic of)", "Democratic People's Republic of Korea", 'Korea, North', 'DPRK'],
  ['KR', 'KOR', 'South Korea', 'Korea, Republic of', 'Republic of Korea', 'Korea, South', 'Korea'],
  ['KW', 'KWT', 'Kuwait'], ['KG', 'KGZ', 'Kyrgyzstan', 'Kyrgyz Republic'],
  ['LA', 'LAO', 'Laos', "Lao People's Democratic Republic", 'Lao PDR'], ['LV', 'LVA', 'Latvia'],
  ['LB', 'LBN', 'Lebanon'], ['LS', 'LSO', 'Lesotho'], ['LR', 'LBR', 'Liberia'], ['LY', 'LBY', 'Libya'],
  ['LI', 'LIE', 'Liechtenstein'], ['LT', 'LTU', 'Lithuania'], ['LU', 'LUX', 'Luxembourg'],
  ['MO', 'MAC', 'Macao', 'Macau', 'Macao SAR'], ['MG', 'MDG', 'Madagascar'], ['MW', 'MWI', 'Malawi'],
  ['MY', 'MYS', 'Malaysia'], ['MV', 'MDV', 'Maldives'], ['ML', 'MLI', 'Mali'], ['MT', 'MLT', 'Malta'],
  ['MH', 'MHL', 'Marshall Islands', 'Marshall Is.'], ['MQ', 'MTQ', 'Martinique'], ['MR', 'MRT', 'Mauritania'],
  ['MU', 'MUS', 'Mauritius'], ['YT', 'MYT', 'Mayotte'], ['MX', 'MEX', 'Mexico', 'México'],
  ['FM', 'FSM', 'Micronesia', 'Micronesia (Federated States of)', 'Federated States of Micronesia'],
  ['MD', 'MDA', 'Moldova', 'Moldova, Republic of', 'Republic of Moldova'], ['MC', 'MCO', 'Monaco'],
  ['MN', 'MNG', 'Mongolia'], ['ME', 'MNE', 'Montenegro'], ['MS', 'MSR', 'Montserrat'], ['MA', 'MAR', 'Morocco'],
  ['MZ', 'MOZ', 'Mozambique'], ['MM', 'MMR', 'Myanmar', 'Burma'], ['NA', 'NAM', 'Namibia'], ['NR', 'NRU', 'Nauru'],
  ['NP', 'NPL', 'Nepal'], ['NL', 'NLD', 'Netherlands', 'The Netherlands', 'Holland'],
  ['NC', 'NCL', 'New Caledonia'], ['NZ', 'NZL', 'New Zealand'], ['NI', 'NIC', 'Nicaragua'], ['NE', 'NER', 'Niger'],
  ['NG', 'NGA', 'Nigeria'], ['NU', 'NIU', 'Niue'], ['NF', 'NFK', 'Norfolk Island'],
  ['MK', 'MKD', 'North Macedonia', 'Macedonia', 'Republic of North Macedonia'],
  ['MP', 'MNP', 'Northern Mariana Islands', 'N. Mariana Is.'], ['NO', 'NOR', 'Norway'], ['OM', 'OMN', 'Oman'],
  ['PK', 'PAK', 'Pakistan'], ['PW', 'PLW', 'Palau'],
  ['PS', 'PSE', 'Palestine', 'Palestine, State of', 'State of Palestine', 'Palestinian Territories', 'West Bank and Gaza'],
  ['PA', 'PAN', 'Panama', 'Panamá'], ['PG', 'PNG', 'Papua New Guinea'], ['PY', 'PRY', 'Paraguay'], ['PE', 'PER', 'Peru', 'Perú'],
  ['PH', 'PHL', 'Philippines', 'The Philippines'], ['PN', 'PCN', 'Pitcairn', 'Pitcairn Islands'], ['PL', 'POL', 'Poland'],
  ['PT', 'PRT', 'Portugal'], ['PR', 'PRI', 'Puerto Rico'], ['QA', 'QAT', 'Qatar'], ['RE', 'REU', 'Réunion', 'Reunion'],
  ['RO', 'ROU', 'Romania'], ['RU', 'RUS', 'Russia', 'Russian Federation'], ['RW', 'RWA', 'Rwanda'],
  ['BL', 'BLM', 'Saint Barthélemy', 'St. Barthelemy', 'St-Barthélemy'],
  ['SH', 'SHN', 'Saint Helena', 'Saint Helena, Ascension and Tristan da Cunha', 'St. Helena'],
  ['KN', 'KNA', 'Saint Kitts and Nevis', 'St. Kitts and Nevis', 'St. Kitts & Nevis'],
  ['LC', 'LCA', 'Saint Lucia', 'St. Lucia'], ['MF', 'MAF', 'Saint Martin', 'Saint Martin (French part)', 'St-Martin'],
  ['PM', 'SPM', 'Saint Pierre and Miquelon', 'St. Pierre and Miquelon'],
  ['VC', 'VCT', 'Saint Vincent and the Grenadines', 'St. Vincent and the Grenadines', 'St. Vin. and Gren.'],
  ['WS', 'WSM', 'Samoa'], ['SM', 'SMR', 'San Marino'],
  ['ST', 'STP', 'Sao Tome and Principe', 'São Tomé and Príncipe', 'São Tomé and Principe'],
  ['SA', 'SAU', 'Saudi Arabia', 'KSA'], ['SN', 'SEN', 'Senegal'], ['RS', 'SRB', 'Serbia'],
  ['SC', 'SYC', 'Seychelles'], ['SL', 'SLE', 'Sierra Leone'], ['SG', 'SGP', 'Singapore'],
  ['SX', 'SXM', 'Sint Maarten', 'Sint Maarten (Dutch part)'], ['SK', 'SVK', 'Slovakia', 'Slovak Republic'],
  ['SI', 'SVN', 'Slovenia'], ['SB', 'SLB', 'Solomon Islands', 'Solomon Is.'], ['SO', 'SOM', 'Somalia'],
  ['ZA', 'ZAF', 'South Africa', 'RSA'],
  ['GS', 'SGS', 'South Georgia and the South Sandwich Islands', 'S. Geo. and the Is.', 'South Georgia'],
  ['SS', 'SSD', 'South Sudan', 'S. Sudan'], ['ES', 'ESP', 'Spain', 'España'], ['LK', 'LKA', 'Sri Lanka'],
  ['SD', 'SDN', 'Sudan'], ['SR', 'SUR', 'Suriname', 'Surinam'], ['SJ', 'SJM', 'Svalbard and Jan Mayen', 'Svalbard'],
  ['SE', 'SWE', 'Sweden'], ['CH', 'CHE', 'Switzerland', 'Schweiz', 'Suisse'],
  ['SY', 'SYR', 'Syria', 'Syrian Arab Republic'], ['TW', 'TWN', 'Taiwan', 'Taiwan, Province of China', 'Republic of China', 'Chinese Taipei'],
  ['TJ', 'TJK', 'Tajikistan'], ['TZ', 'TZA', 'Tanzania', 'Tanzania, United Republic of', 'United Republic of Tanzania'],
  ['TH', 'THA', 'Thailand'], ['TL', 'TLS', 'Timor-Leste', 'East Timor'], ['TG', 'TGO', 'Togo'], ['TK', 'TKL', 'Tokelau'],
  ['TO', 'TON', 'Tonga'], ['TT', 'TTO', 'Trinidad and Tobago'], ['TN', 'TUN', 'Tunisia'],
  ['TR', 'TUR', 'Türkiye', 'Turkey', 'Turkiye'], ['TM', 'TKM', 'Turkmenistan'],
  ['TC', 'TCA', 'Turks and Caicos Islands', 'Turks and Caicos'], ['TV', 'TUV', 'Tuvalu'], ['UG', 'UGA', 'Uganda'],
  ['UA', 'UKR', 'Ukraine'], ['AE', 'ARE', 'United Arab Emirates', 'UAE'],
  ['GB', 'GBR', 'United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'UK', 'U.K.', 'Great Britain', 'Britain'],
  ['US', 'USA', 'United States', 'United States of America', 'U.S.', 'U.S.A.', 'US of A'],
  ['UM', 'UMI', 'United States Minor Outlying Islands', 'U.S. Minor Outlying Islands'],
  ['UY', 'URY', 'Uruguay'], ['UZ', 'UZB', 'Uzbekistan'], ['VU', 'VUT', 'Vanuatu'],
  ['VE', 'VEN', 'Venezuela', 'Venezuela (Bolivarian Republic of)', 'Bolivarian Republic of Venezuela'],
  ['VN', 'VNM', 'Vietnam', 'Viet Nam'], ['VG', 'VGB', 'British Virgin Islands', 'Virgin Islands (British)', 'British Virgin Is.'],
  ['VI', 'VIR', 'U.S. Virgin Islands', 'Virgin Islands (U.S.)', 'United States Virgin Islands', 'US Virgin Islands', 'U.S. Virgin Is.'],
  ['WF', 'WLF', 'Wallis and Futuna'], ['EH', 'ESH', 'Western Sahara', 'W. Sahara'], ['YE', 'YEM', 'Yemen'],
  ['ZM', 'ZMB', 'Zambia'], ['ZW', 'ZWE', 'Zimbabwe'],
  // User-assigned code used by Natural Earth and most map layers.
  ['XK', 'XKX', 'Kosovo', 'Republic of Kosovo'],
];

/** ISO 3166-1 countries (249) plus Kosovo, in ISO name order. */
export const COUNTRIES: readonly Country[] = COUNTRY_ROWS.map(([alpha2, alpha3, name, ...aliases]) => ({ name, alpha2, alpha3, aliases }));

const COUNTRY_BY_KEY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of COUNTRIES) {
    for (const k of [c.name, c.alpha2, c.alpha3, ...c.aliases]) {
      const key = normalizeGeoKey(k);
      if (!m.has(key)) m.set(key, c.alpha3);
    }
  }
  return m;
})();

/** ISO alpha-3 of a country name / alpha-2 / alpha-3 / alias, or null. */
export function matchCountry(raw: string): string | null {
  return COUNTRY_BY_KEY.get(normalizeGeoKey(raw)) ?? null;
}

// ---------------------------------------------------------------------------
// ERCOT zones
// ---------------------------------------------------------------------------

/** The seven model zones, spelled as the `zone` column of the ERCOT datasets. */
export const ERCOT_ZONES: readonly string[] = ['Houston', 'North', 'Northeast', 'Panhandle', 'South', 'South_Central', 'West'];

/**
 * Normalised compass words. A column of bare `North` / `South` / `East` /
 * `West` values is not an ERCOT zone column unless its header says so or a
 * non-compass spelling (`Houston`, `Panhandle`, `South Central`, `COAST`, …)
 * appears (see `inferGeoRole`).
 */
export const COMPASS_WORDS: ReadonlySet<string> = new Set(['north', 'south', 'east', 'west']);

/**
 * Alternate spellings and the ERCOT weather-zone crosswalk from
 * `public/geo/README.md` (West ← FAR_WEST + WEST; North ← NORTH_C + NORTH;
 * Northeast ← EAST; Houston ← COAST; South_Central ← SOUTH_C; South ← SOUTHERN).
 */
const ZONE_ALIASES: ReadonlyArray<[alias: string, zone: string]> = [
  ['South Central', 'South_Central'], ['SouthCentral', 'South_Central'], ['SCENT', 'South_Central'], ['SOUTH_C', 'South_Central'],
  ['North East', 'Northeast'], ['EAST', 'Northeast'],
  ['COAST', 'Houston'],
  ['NCENT', 'North'], ['NORTH_C', 'North'],
  ['SOUTHERN', 'South'],
  ['FAR_WEST', 'West'], ['FWEST', 'West'],
];

const ZONE_BY_KEY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const z of ERCOT_ZONES) m.set(normalizeGeoKey(z), z);
  for (const [alias, z] of ZONE_ALIASES) m.set(normalizeGeoKey(alias), z);
  return m;
})();

/** Canonical ERCOT zone (`South_Central` spelling) of a label, or null. */
export function matchErcotZone(raw: string): string | null {
  return ZONE_BY_KEY.get(normalizeGeoKey(raw)) ?? null;
}

// ---------------------------------------------------------------------------
// US counties
// ---------------------------------------------------------------------------

/** A county reference parsed from a label. `state` is USPS; `fips` is set only for FIPS input; `name` is null for FIPS input. */
export interface UsCounty { name: string | null; state: string | null; fips: string | null }

const COUNTY_WORD = /\s+(county|parish|borough|census area|municipality)$/i;

/**
 * Parse `<County> County, <ST>`, `<County>, <ST>`, `<County> County` (also
 * Parish / Borough / Census Area / Municipality) or a 5-digit FIPS string whose
 * first two digits are a state FIPS code. `allowFips` gates the bare-digit form,
 * which the caller enables only when the header names a county or FIPS column
 * (a 5-digit ZIP code is otherwise indistinguishable).
 */
export function matchUsCounty(raw: string, allowFips = true): UsCounty | null {
  const s = raw.trim();
  if (/^\d{5}$/.test(s)) {
    if (!allowFips || !STATE_FIPS.has(s.slice(0, 2)) || s.slice(2) === '000') return null;
    return { name: null, state: US_STATES.find((st) => st.fips === s.slice(0, 2))?.code ?? null, fips: s };
  }
  const comma = s.lastIndexOf(',');
  let namePart = s, state: string | null = null;
  if (comma >= 0) {
    const st = s.slice(comma + 1).trim();
    if (!/^[A-Za-z]{2}$/.test(st)) return null;
    state = matchUsState(st);
    if (!state) return null;
    namePart = s.slice(0, comma).trim();
  }
  if (namePart.length === 0) return null;
  const hasWord = COUNTY_WORD.test(namePart);
  if (!hasWord && state === null) return null;
  const name = namePart.replace(COUNTY_WORD, '').trim();
  if (name.length === 0 || /^\d+$/.test(name)) return null;
  return { name, state, fips: null };
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/** True for a finite latitude in [−90, 90]. */
export function isLatitude(v: number): boolean {
  return v === v && v >= -90 && v <= 90;
}

/** True for a finite longitude in [−180, 180]. */
export function isLongitude(v: number): boolean {
  return v === v && v >= -180 && v <= 180;
}
