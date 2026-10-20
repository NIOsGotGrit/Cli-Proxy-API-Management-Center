import { expect, test } from 'bun:test';
import { quotaSnapshot } from '@/features/dashboard/quotaSnapshot';
import type { ClaudeQuotaState } from '@/types';
const now = Date.now();
const quota = (
  usedPercent: number,
  observedAt = new Date(now).toISOString()
): ClaudeQuotaState => ({
  status: 'success',
  observedAt,
  windows: [{ id: 'seven-day', label: '', usedPercent, resetLabel: '', resetAtMs: now + 3600000 }],
});
test('Home distinguishes current allowance from old or failed observations', () => {
  const result = quotaSnapshot(
    [
      quota(100),
      quota(20),
      quota(0, new Date(now - 3600000).toISOString()),
      { ...quota(20), status: 'error' },
    ],
    [],
    now
  );
  expect(result).toEqual({
    checked: 4,
    available: 1,
    limited: 1,
    stale: 2,
    nextReset: now + 3600000,
  });
  expect(quotaSnapshot([{ status: 'idle', windows: [] }], [], now).checked).toBe(0);
});
