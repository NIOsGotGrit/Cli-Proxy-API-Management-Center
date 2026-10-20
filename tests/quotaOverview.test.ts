import { afterEach, describe, expect, test } from 'bun:test';
import { formatRemaining, quotaOverview } from '@/features/quota/quotaOverview';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';

const now = Date.parse('2026-10-20T06:00:00Z');
const claude = (weekly: number, fiveHour: number): ClaudeQuotaState => ({
  status: 'success',
  observedAt: new Date(now).toISOString(),
  windows: [
    {
      id: 'seven-day',
      label: 'Weekly',
      usedPercent: weekly,
      resetLabel: '',
      resetAtMs: now + 86_400_000,
    },
    {
      id: 'five-hour',
      label: '5-hour',
      usedPercent: fiveHour,
      resetLabel: '',
      resetAtMs: now + 3_600_000,
    },
    { id: 'seven-day-fable', label: 'Fable', usedPercent: 0, resetLabel: '' },
  ],
});
const initialStore = useQuotaStore.getState();
afterEach(() => useQuotaStore.setState(initialStore, true));

describe('flat account quota overview', () => {
  test('weekly exhaustion wins over an unused scoped allowance', () => {
    expect(quotaOverview('claude', claude(100, 5), now).status).toBe('plan_limit');
  });
  test('5-hour exhaustion is independently limiting even with weekly capacity', () => {
    const summary = quotaOverview('claude', claude(15, 100), now);
    expect(summary.weekly?.usedPercent).toBe(15);
    expect(summary.fiveHour?.usedPercent).toBe(100);
    expect(summary.status).toBe('plan_limit');
  });
  test('an unreported Codex 5-hour window stays unknown', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 68, resetLabel: '' }],
    };
    const summary = quotaOverview('codex', quota, now);
    expect(summary.weekly?.usedPercent).toBe(68);
    expect(summary.fiveHour).toBeUndefined();
    expect(formatRemaining(null)).toBe('—');
  });
  test('crossing a reset does not invent restored quota from an old observation', () => {
    expect(quotaOverview('claude', claude(100, 0), now + 3_600_001).status).toBe('last_known');
  });
  test('small remaining amounts are not rounded to zero', () => {
    expect(formatRemaining(0.04, 'en')).toBe('<0.1%');
    expect(formatRemaining(1.2, 'en')).toBe('1.2%');
  });
  test('unknown or malformed usage cannot appear available', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [{ id: 'weekly', label: 'Weekly', usedPercent: null, resetLabel: '' }],
    };
    expect(quotaOverview('codex', quota, now).status).toBe('unknown');
  });
  test('a failed Codex refresh retains the last quota and credits without claiming freshness', () => {
    const store = useQuotaStore.getState();
    store.setCodexQuota({
      one: {
        status: 'success',
        windows: [{ id: 'weekly', label: 'Weekly', usedPercent: 68, resetLabel: '' }],
        observedAt: new Date(now).toISOString(),
        creditBalance: '62500',
      },
    });
    store.setCodexQuota({ one: { status: 'loading', windows: [] } });
    store.setCodexQuota({ one: { status: 'error', windows: [], error: 'Quota check failed' } });
    const quota = useQuotaStore.getState().codexQuota.one;
    expect(quota.windows[0].usedPercent).toBe(68);
    expect(quota.creditBalance).toBe('62500');
    expect(quotaOverview('codex', quota, now).status).toBe('last_known');
    store.setCodexQuota({});
    expect(useQuotaStore.getState().codexQuota).toEqual({});
  });
});
