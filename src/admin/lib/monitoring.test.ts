import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

const { describeCron, formatBytes, formatDuration, formatMinutes, jobState } = await import('./monitoring');

describe('describeCron', () => {
  it('reads the schedules the migrations use', () => {
    expect(describeCron('*/5 * * * *')).toEqual({ key: 'everyMinutes', values: { count: 5 } });
    expect(describeCron('20 * * * *')).toEqual({ key: 'hourly', values: { minute: '20' } });
    expect(describeCron('5 * * * *')).toEqual({ key: 'hourly', values: { minute: '05' } });
    expect(describeCron('0 */4 * * *')).toEqual({ key: 'everyHours', values: { count: 4, minute: '00' } });
    expect(describeCron('40 19 * * *')).toEqual({ key: 'daily', values: { time: '19:40' } });
  });
  it('falls back to the raw expression, or "not scheduled"', () => {
    expect(describeCron('0 9 * * 1')).toEqual({ key: 'raw', values: { expr: '0 9 * * 1' } });
    expect(describeCron(null)).toEqual({ key: 'notScheduled', values: {} });
  });
});

describe('formatting', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
  });
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42 ms');
    expect(formatDuration(2500)).toBe('2.5 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(formatMinutes(30)).toBe('30 min');
    expect(formatMinutes(1560)).toBe('26 h');
    expect(formatMinutes(90)).toBe('1 h 30 min');
  });
});

describe('jobState', () => {
  const base = { healthy: true, last_ok: true, last_run_at: '2026-01-01T00:00:00Z', running: false };
  it('orders running > never > failing > late > ok', () => {
    expect(jobState({ ...base, running: true, last_ok: false })).toBe('running');
    expect(jobState({ ...base, last_run_at: null })).toBe('never');
    expect(jobState({ ...base, last_ok: false, healthy: false })).toBe('failing');
    expect(jobState({ ...base, healthy: false })).toBe('late');
    expect(jobState(base)).toBe('ok');
  });
});
