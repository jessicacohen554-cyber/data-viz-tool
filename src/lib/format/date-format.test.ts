/**
 * Oracle: docs/TABLEAU-SPEC.md §8.2 token table (2024-02-05 14:07:09.045,
 * a Monday, ISO week 6) and §4.2 part / trunc labels. All UTC.
 */
import { describe, expect, it } from 'vitest';
import {
  STANDARD_DATE_FORMATS, TRUNC_PATTERNS, compileDatePattern, datePartLabel, datePartOf, dateTruncLabel,
  dayOfYear, formatDate, isoWeek, isoWeekday, truncDate,
} from './date-format';

const T = Date.UTC(2024, 1, 5, 14, 7, 9, 45);

describe('§8.2 tokens on 2024-02-05 14:07:09.045', () => {
  const rows: Array<[string, string]> = [
    ['yyyy', '2024'], ['yy', '24'], ['Q', 'Q1'], ['MM', '02'], ['M', '2'], ['MMM', 'Feb'], ['MMMM', 'February'],
    ['ww', '06'], ['w', '6'], ['dd', '05'], ['d', '5'], ['ddd', 'Mon'], ['dddd', 'Monday'],
    ['HH', '14'], ['H', '14'], ['hh', '02'], ['h', '2'], ['mm', '07'], ['ss', '09'], ['SSS', '045'],
    ['a', 'PM'], ['D', '36'],
  ];
  for (const [token, out] of rows) it(`${token} → ${out}`, () => expect(formatDate(T, token)).toBe(out));

  it('quoted and other characters are literal', () => {
    expect(formatDate(T, "yyyy-MM-dd'T'HH:mm")).toBe('2024-02-05T14:07');
    expect(formatDate(T, "'Day' D 'of' yyyy")).toBe('Day 36 of 2024');
    expect(formatDate(T, "h 'o''clock' a")).toBe("2 o'clock PM");
    expect(formatDate(T, 'yyyy/MM/dd')).toBe('2024/02/05');
  });

  it('12-hour clock wraps midnight and noon', () => {
    expect(formatDate(Date.UTC(2024, 0, 1, 0, 30), 'h:mm a')).toBe('12:30 AM');
    expect(formatDate(Date.UTC(2024, 0, 1, 12, 0), 'hh:mm a')).toBe('12:00 PM');
  });

  it('non-finite input renders empty', () => {
    expect(formatDate(NaN, 'yyyy')).toBe('');
  });

  it('compiles once per pattern', () => {
    expect(compileDatePattern('yyyy-MM')).toBe(compileDatePattern('yyyy-MM'));
  });
});

describe('standard list (§8.1)', () => {
  it('renders every preset', () => {
    const expected: Record<string, string> = {
      'yyyy-MM-dd': '2024-02-05', 'MM/dd/yyyy': '02/05/2024', 'dd/MM/yyyy': '05/02/2024',
      'MMM d, yyyy': 'Feb 5, 2024', 'MMMM d, yyyy': 'February 5, 2024', 'ddd, MMM d, yyyy': 'Mon, Feb 5, 2024',
      'MMM yyyy': 'Feb 2024', 'yyyy': '2024', 'Q yyyy': 'Q1 2024', 'HH:mm': '14:07', 'h:mm a': '2:07 PM',
      'yyyy-MM-dd HH:mm': '2024-02-05 14:07', 'MMM d, yyyy h:mm a': 'Feb 5, 2024 2:07 PM',
    };
    expect(STANDARD_DATE_FORMATS.length).toBe(13);
    for (const p of STANDARD_DATE_FORMATS) expect(formatDate(T, p)).toBe(expected[p]);
  });
});

describe('ISO week and day of year', () => {
  it('week 1 holds the first Thursday', () => {
    expect(isoWeek(Date.UTC(2021, 0, 1))).toBe(53); // Fri 2021-01-01 → ISO 2020-W53
    expect(isoWeek(Date.UTC(2021, 0, 4))).toBe(1);
    expect(isoWeek(Date.UTC(2024, 11, 30))).toBe(1); // Mon 2024-12-30 → ISO 2025-W01
    expect(isoWeek(Date.UTC(2020, 11, 31))).toBe(53);
  });
  it('weekday is Monday-first 1..7', () => {
    expect(isoWeekday(T)).toBe(1);
    expect(isoWeekday(Date.UTC(2024, 1, 4))).toBe(7);
  });
  it('day of year handles leap years', () => {
    expect(dayOfYear(Date.UTC(2024, 11, 31))).toBe(366);
    expect(dayOfYear(Date.UTC(2023, 11, 31))).toBe(365);
  });
});

describe('§4.2 part labels', () => {
  it('labels each part', () => {
    expect(datePartLabel('year', 2024)).toBe('2024');
    expect(datePartLabel('quarter', 3)).toBe('Q3');
    expect(datePartLabel('month', 3)).toBe('Mar');
    expect(datePartLabel('week', 12)).toBe('Wk 12');
    expect(datePartLabel('day', 5)).toBe('5');
    expect(datePartLabel('weekday', 1)).toBe('Mon');
    expect(datePartLabel('weekday', 7)).toBe('Sun');
    expect(datePartLabel('hour', 0)).toBe('0');
    expect(datePartLabel('minute', 59)).toBe('59');
  });
  it('out-of-domain and non-finite', () => {
    expect(datePartLabel('month', 13)).toBe('13');
    expect(datePartLabel('month', NaN)).toBe('');
  });
  it('datePartOf matches the domains', () => {
    expect(datePartOf('year', T)).toBe(2024);
    expect(datePartOf('quarter', T)).toBe(1);
    expect(datePartOf('month', T)).toBe(2);
    expect(datePartOf('week', T)).toBe(6);
    expect(datePartOf('day', T)).toBe(5);
    expect(datePartOf('weekday', T)).toBe(1);
    expect(datePartOf('hour', T)).toBe(14);
    expect(datePartOf('minute', T)).toBe(7);
  });
});

describe('§4.2 trunc labels and truncation', () => {
  it('labels start of period', () => {
    expect(dateTruncLabel('year', T)).toBe('2024');
    expect(dateTruncLabel('quarter', T)).toBe('Q1 2024');
    expect(dateTruncLabel('month', T)).toBe('Feb 2024');
    expect(dateTruncLabel('week', T)).toBe('2024-02-05');
    expect(dateTruncLabel('day', T)).toBe('2024-02-05');
    expect(dateTruncLabel('hour', T)).toBe('2024-02-05 14:00');
    expect(dateTruncLabel('minute', T)).toBe('2024-02-05 14:07');
  });
  it('truncates to the ISO Monday for week', () => {
    const sun = Date.UTC(2024, 1, 11, 23, 59);
    expect(truncDate('week', sun)).toBe(Date.UTC(2024, 1, 5));
    expect(truncDate('quarter', Date.UTC(2024, 10, 20))).toBe(Date.UTC(2024, 9, 1));
    expect(truncDate('hour', T)).toBe(Date.UTC(2024, 1, 5, 14));
    expect(truncDate('year', T)).toBe(Date.UTC(2024, 0, 1));
  });
  it('every level has a trunc pattern', () => {
    expect(Object.keys(TRUNC_PATTERNS).sort()).toEqual(['day', 'hour', 'minute', 'month', 'quarter', 'week', 'year']);
  });
});
