import { describe, expect, it } from 'vitest';
import {
  civilFromDays, compileParser, datePart, datePartLabel, dateTrunc, daysFromCivil, detectDateFormat, isoLabel, isoWeek,
  periodEnd, utcMs,
} from './date-parse';

const T = Date.UTC(2024, 1, 5, 14, 7, 9, 45); // 2024-02-05 14:07:09.045 (Monday, ISO week 6)

describe('civil calendar arithmetic', () => {
  it('round-trips against Date.UTC across centuries and leap days', () => {
    for (const [y, m, d] of [[1970, 1, 1], [2000, 2, 29], [1900, 3, 1], [2024, 2, 29], [2100, 12, 31], [1600, 1, 1], [2038, 1, 19]]) {
      const days = daysFromCivil(y!, m!, d!);
      expect(days * 86_400_000).toBe(Date.UTC(y!, m! - 1, d!));
      expect(civilFromDays(days)).toEqual([y, m, d]);
    }
  });

  it('utcMs builds the instant without the two-digit-year quirk of Date.UTC', () => {
    expect(utcMs(2024, 2, 5, 14, 7, 9, 45)).toBe(T);
    expect(civilFromDays(Math.floor(utcMs(50, 6, 1) / 86_400_000))).toEqual([50, 6, 1]);
  });
});

describe('ISO week', () => {
  it('follows ISO 8601 at the year edges', () => {
    expect(isoWeek(Date.UTC(2024, 11, 30))).toEqual({ week: 1, weekYear: 2025 });
    expect(isoWeek(Date.UTC(2021, 0, 3))).toEqual({ week: 53, weekYear: 2020 });
    expect(isoWeek(Date.UTC(2026, 0, 1))).toEqual({ week: 1, weekYear: 2026 });
    expect(isoWeek(T).week).toBe(6);
  });
});

describe('datePart / dateTrunc / periodEnd', () => {
  it('extracts every level in UTC', () => {
    expect(datePart(T, 'year')).toBe(2024);
    expect(datePart(T, 'quarter')).toBe(1);
    expect(datePart(T, 'month')).toBe(2);
    expect(datePart(T, 'week')).toBe(6);
    expect(datePart(T, 'day')).toBe(5);
    expect(datePart(T, 'hour')).toBe(14);
    expect(datePart(T, 'minute')).toBe(7);
    expect(datePart(NaN, 'month')).toBeNaN();
  });

  it('handles instants before the epoch', () => {
    const t = Date.UTC(1969, 11, 31, 23, 30);
    expect(datePart(t, 'hour')).toBe(23);
    expect(datePart(t, 'minute')).toBe(30);
    expect(datePart(t, 'year')).toBe(1969);
  });

  it('truncates to period starts; week is the ISO Monday', () => {
    expect(dateTrunc(T, 'year')).toBe(Date.UTC(2024, 0, 1));
    expect(dateTrunc(T, 'quarter')).toBe(Date.UTC(2024, 0, 1));
    expect(dateTrunc(Date.UTC(2024, 7, 20), 'quarter')).toBe(Date.UTC(2024, 6, 1));
    expect(dateTrunc(T, 'month')).toBe(Date.UTC(2024, 1, 1));
    expect(dateTrunc(T, 'week')).toBe(Date.UTC(2024, 1, 5));
    expect(dateTrunc(Date.UTC(2024, 1, 11, 3), 'week')).toBe(Date.UTC(2024, 1, 5));
    expect(dateTrunc(T, 'day')).toBe(Date.UTC(2024, 1, 5));
    expect(dateTrunc(T, 'hour')).toBe(Date.UTC(2024, 1, 5, 14));
    expect(dateTrunc(T, 'minute')).toBe(Date.UTC(2024, 1, 5, 14, 7));
  });

  it('periodEnd is the last millisecond of the period (leap February, year roll-over)', () => {
    expect(periodEnd(T, 'month')).toBe(Date.UTC(2024, 1, 29, 23, 59, 59, 999));
    expect(periodEnd(Date.UTC(2024, 11, 15), 'quarter')).toBe(Date.UTC(2024, 11, 31, 23, 59, 59, 999));
    expect(periodEnd(T, 'year')).toBe(Date.UTC(2024, 11, 31, 23, 59, 59, 999));
    expect(periodEnd(T, 'week')).toBe(Date.UTC(2024, 1, 11, 23, 59, 59, 999));
    expect(periodEnd(T, 'day')).toBe(Date.UTC(2024, 1, 5, 23, 59, 59, 999));
  });

  it('labels parts like Tableau headers', () => {
    expect(datePartLabel('quarter', 2)).toBe('Q2');
    expect(datePartLabel('month', 2)).toBe('Feb');
    expect(datePartLabel('week', 6)).toBe('Wk 6');
    expect(datePartLabel('year', 2024)).toBe('2024');
    expect(datePartLabel('hour', 0)).toBe('0');
  });

  it('isoLabel drops the time when it is midnight', () => {
    expect(isoLabel(Date.UTC(2024, 1, 5))).toBe('2024-02-05');
    expect(isoLabel(Date.UTC(2024, 1, 5, 14, 7, 9))).toBe('2024-02-05 14:07:09');
    expect(isoLabel(NaN)).toBe('Null');
  });
});

describe('compileParser', () => {
  it('parses ISO date-times with optional fraction and zone', () => {
    const p = compileParser("yyyy-MM-dd'T'HH:mm:ss.SSSZ");
    expect(p.hasTime).toBe(true);
    expect(p.parse('2024-02-05T14:07:09.045Z')).toBe(T);
    expect(p.parse('2024-02-05T14:07:09Z')).toBe(T - 45);
    expect(p.parse('2024-02-05T16:07:09.045+02:00')).toBe(T);
    expect(p.parse('2024-02-05T09:07:09.045-0500')).toBe(T);
    expect(p.parse('2024-02-05T14:07:09.045')).toBeNaN(); // zone required by this pattern
  });

  it('parses the ERCOT minute-resolution pattern and naive ISO', () => {
    expect(compileParser("yyyy-MM-dd'T'HH:mm").parse('2019-01-01T00:00')).toBe(Date.UTC(2019, 0, 1));
    expect(compileParser("yyyy-MM-dd'T'HH:mm:ss").parse('2024-02-05T14:07:09')).toBe(T - 45);
    expect(compileParser('yyyy-MM-dd HH:mm:ss.SSS').parse('2024-02-05 14:07:09')).toBe(T - 45);
  });

  it('accepts single-digit month/day when separated, fixed widths when not', () => {
    expect(compileParser('MM/dd/yyyy').parse('2/5/2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('MM/dd/yyyy').parse('02/05/2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('yyyyMMdd').parse('20240205')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('yyyyMMdd').parse('2024025')).toBeNaN();
  });

  it('parses month names, 12-hour clocks and two-digit years', () => {
    expect(compileParser('dd-MMM-yyyy').parse('05-Feb-2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('dd-MMM-yyyy').parse('05-feb-2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('MMM d, yyyy').parse('Feb 5, 2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('MMMM d, yyyy').parse('February 5, 2024')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('MMMM d, yyyy').parse('Feb 5, 2024')).toBeNaN();
    const h = compileParser('yyyy-MM-dd h:mm a');
    expect(h.parse('2024-02-05 2:07 PM')).toBe(Date.UTC(2024, 1, 5, 14, 7));
    expect(h.parse('2024-02-05 12:07 am')).toBe(Date.UTC(2024, 1, 5, 0, 7));
    expect(h.parse('2024-02-05 12:07 PM')).toBe(Date.UTC(2024, 1, 5, 12, 7));
    expect(compileParser('MM/dd/yy').parse('02/05/24')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('MM/dd/yy').parse('02/05/69')).toBe(Date.UTC(1969, 1, 5));
  });

  it('rejects impossible dates, trailing garbage and the wrong shape; tolerates padding', () => {
    const p = compileParser('yyyy-MM-dd');
    expect(p.parse('2023-02-29')).toBeNaN();
    expect(p.parse('2024-13-01')).toBeNaN();
    expect(p.parse('2024-02-05x')).toBeNaN();
    expect(p.parse('hello')).toBeNaN();
    expect(p.parse('')).toBeNaN();
    expect(p.parse('  2024-02-05 ')).toBe(Date.UTC(2024, 1, 5));
    expect(compileParser('HH:mm:ss').parse('24:00:00')).toBeNaN();
    expect(compileParser('HH:mm:ss').parse('14:07:09')).toBe(14 * 3_600_000 + 7 * 60_000 + 9000);
  });
});

describe('detectDateFormat', () => {
  it('picks the first candidate that parses every sample', () => {
    expect(detectDateFormat(['2024-02-05T14:07:09.045Z', '2024-02-06T00:00:00+01:00'])).toMatchObject({ pattern: "yyyy-MM-dd'T'HH:mm:ss.SSSZ", hasTime: true, ambiguous: false });
    expect(detectDateFormat(['2024-02-05T14:07:09'])).toMatchObject({ pattern: "yyyy-MM-dd'T'HH:mm:ss.SSS", hasTime: true });
    expect(detectDateFormat(['2019-01-01T00:00', '2024-12-31T23:00'])).toMatchObject({ pattern: "yyyy-MM-dd'T'HH:mm", hasTime: true });
    expect(detectDateFormat(['2024-02-05 14:07:09'])).toMatchObject({ pattern: 'yyyy-MM-dd HH:mm:ss.SSS', hasTime: true });
    expect(detectDateFormat(['2024-02-05 14:07'])).toMatchObject({ pattern: 'yyyy-MM-dd HH:mm', hasTime: true });
    expect(detectDateFormat(['2024-02-05', '2019-12-31'])).toMatchObject({ pattern: 'yyyy-MM-dd', hasTime: false });
    expect(detectDateFormat(['2024/02/05'])).toMatchObject({ pattern: 'yyyy/MM/dd' });
    expect(detectDateFormat(['20240205'])).toMatchObject({ pattern: 'yyyyMMdd', hasTime: false });
    expect(detectDateFormat(['05-Feb-2024'])).toMatchObject({ pattern: 'dd-MMM-yyyy' });
    expect(detectDateFormat(['Feb 5, 2024'])).toMatchObject({ pattern: 'MMM d, yyyy' });
    expect(detectDateFormat(['February 5, 2024'])).toMatchObject({ pattern: 'MMMM d, yyyy' });
    expect(detectDateFormat(['2024-02'])).toMatchObject({ pattern: 'yyyy-MM', hasTime: false });
    expect(detectDateFormat(['14:07:09'])).toMatchObject({ pattern: 'HH:mm:ss', hasTime: true });
  });

  it('applies the day/month rule', () => {
    expect(detectDateFormat(['01/15/2024', '02/05/2024'])).toMatchObject({ pattern: 'MM/dd/yyyy', ambiguous: false });
    expect(detectDateFormat(['15/01/2024', '05/02/2024'])).toMatchObject({ pattern: 'dd/MM/yyyy', ambiguous: false });
    expect(detectDateFormat(['01/02/2024', '03/04/2024'])).toMatchObject({ pattern: 'MM/dd/yyyy', ambiguous: true });
    expect(detectDateFormat(['13/01/2024', '02/29/2024'])).toBeNull();
    expect(detectDateFormat(['15-01-2024 14:07'])).toMatchObject({ pattern: 'dd-MM-yyyy HH:mm', hasTime: true });
  });

  it('returns null for mixed or non-date samples', () => {
    expect(detectDateFormat(['2024-02-05', '05-Feb-2024'])).toBeNull();
    expect(detectDateFormat(['abc'])).toBeNull();
    expect(detectDateFormat([])).toBeNull();
  });

  it('lenient mode picks the pattern parsing the most samples', () => {
    expect(detectDateFormat(['01/15/2024', '02/05/2024', 'x'], true)).toMatchObject({ pattern: 'MM/dd/yyyy', ambiguous: false });
    expect(detectDateFormat(['2024-02-05', '05-Feb-2024', '2024-02-06'], true)).toMatchObject({ pattern: 'yyyy-MM-dd' });
    expect(detectDateFormat(['abc', 'def'], true)).toBeNull();
    // Day/month conflict: the order that explains more values wins (7 of 8 here read as M/d).
    expect(detectDateFormat(['01/02/2024', '01/03/2024', '13/01/2024', '02/29/2024', '03/01/2024', '12/31/2024', '03/01/2024', '01/02/2024'], true)).toMatchObject({ pattern: 'MM/dd/yyyy' });
  });
});
