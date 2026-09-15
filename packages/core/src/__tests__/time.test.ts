import { hhmmToMinutes, minutesToDecimalHours, minutesToHHMM } from '../index';

test('parses a clock time into minutes', () => {
  expect(hhmmToMinutes('00:00')).toBe(0);
  expect(hhmmToMinutes('01:55')).toBe(115);
  expect(hhmmToMinutes('23:59')).toBe(1439);
  expect(hhmmToMinutes(' 09:05 ')).toBe(545);
});

test('rejects anything that is not a clock time', () => {
  expect(hhmmToMinutes('24:00')).toBeNull();
  expect(hhmmToMinutes('12:60')).toBeNull();
  expect(hhmmToMinutes('1234')).toBeNull();
  expect(hhmmToMinutes('')).toBeNull();
  expect(hhmmToMinutes(undefined)).toBeNull();
  expect(hhmmToMinutes(null)).toBeNull();
});

test('formats minutes as a clock time, clamping what cannot be one', () => {
  expect(minutesToHHMM(0)).toBe('00:00');
  expect(minutesToHHMM(115)).toBe('01:55');
  // Block time is not wall-clock time: a long-haul month can exceed 24 hours and must not wrap.
  expect(minutesToHHMM(1500)).toBe('25:00');
  expect(minutesToHHMM(-5)).toBe('00:00');
  expect(minutesToHHMM(Number.NaN)).toBe('00:00');
});

test('converts minutes to decimal hours at the requested precision', () => {
  expect(minutesToDecimalHours(115)).toBe(1.9);
  expect(minutesToDecimalHours(115, 2)).toBe(1.92);
  expect(minutesToDecimalHours(0)).toBe(0);
});
