import { describe, expect, it } from 'vitest';
import { eventTone, formatMoney, formatNumber, formatPercent, timeAgo } from './format';
import { niceMax } from '../components/charts';
import { presetRange } from '../components/DateRangePicker';

describe('admin formatting', () => {
  it('formats money in the plan currency, compact for large values', () => {
    expect(formatMoney(29, 'USD', 'en')).toBe('$29');
    expect(formatMoney(29.5, 'USD', 'en')).toBe('$29.50');
    expect(formatMoney(125_000, 'USD', 'en', true)).toBe('$125K');
  });

  it('formats counts and percentages', () => {
    expect(formatNumber(1234, 'en')).toBe('1,234');
    expect(formatNumber(15_300, 'en', true)).toBe('15.3K');
    expect(formatPercent(2.5, 'en')).toBe('2.5%');
  });

  it('describes recent times relatively and old ones as dates', () => {
    const now = Date.parse('2026-09-25T12:00:00Z');
    expect(timeAgo('2026-09-25T11:57:00Z', 'en', now)).toBe('3 minutes ago');
    expect(timeAgo('2026-09-24T12:00:00Z', 'en', now)).toBe('yesterday');
    expect(timeAgo('2026-07-01T12:00:00Z', 'en', now)).toMatch(/2026/);
  });

  it('colours events by meaning', () => {
    expect(eventTone('payment_failed')).toBe('crit');
    expect(eventTone('upgrade')).toBe('ok');
    expect(eventTone('unknown_type')).toBe('neutral');
  });
});

describe('chart scale and date ranges', () => {
  it('rounds the axis top to a readable value', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(137)).toBe(200);
    expect(niceMax(24)).toBe(25);
  });

  it('builds preset ranges ending now', () => {
    const now = new Date('2026-09-25T15:30:00');
    const r = presetRange('30d', now);
    expect(r.to).toBe(now);
    expect(r.from.getDate()).toBe(27);
    expect(r.from.getMonth()).toBe(7);
    expect(presetRange('ytd', now).from.getMonth()).toBe(0);
  });
});
