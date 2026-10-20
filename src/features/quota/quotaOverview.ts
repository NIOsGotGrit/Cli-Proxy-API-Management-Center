import type { ClaudeQuotaState, CodexQuotaState } from '@/types';

export type OverviewQuota = ClaudeQuotaState | CodexQuotaState;
export type OverviewWindow = OverviewQuota['windows'][number];
export type QuotaOverviewStatus =
  'checking' | 'unknown' | 'last_known' | 'plan_limit' | 'running_low' | 'available';

/** Only the base account windows belong in the overview; scoped allowances stay in details. */
export function quotaOverview(
  provider: 'claude' | 'codex',
  quota?: OverviewQuota,
  now = Date.now()
) {
  const windows = quota?.windows ?? [];
  const weekly = windows.find(
    (window) => window.id === (provider === 'claude' ? 'seven-day' : 'weekly')
  );
  const fiveHour = windows.find((window) => window.id === 'five-hour');
  const observedAt = quota?.observedAt;
  const observedMs = observedAt ? Date.parse(observedAt) : null;
  const resetPassed = [weekly, fiveHour].some(
    (window) =>
      window?.resetAtMs &&
      window.resetAtMs <= now &&
      observedMs !== null &&
      window.resetAtMs > observedMs
  );
  const stale = Boolean(
    quota?.stale || resetPassed || (observedMs !== null && now - observedMs > 10 * 60_000)
  );
  let status: QuotaOverviewStatus = 'available';
  if (!quota || quota.status === 'idle' || (quota.status === 'loading' && !windows.length))
    status = 'checking';
  else if (quota.status === 'error') status = windows.length ? 'last_known' : 'unknown';
  else if (stale) status = 'last_known';
  else {
    const remaining = [weekly, fiveHour]
      .map(remainingPercent)
      .filter((value): value is number => value !== null);
    if (!remaining.length) status = 'unknown';
    else if (remaining.some((value) => value === 0)) status = 'plan_limit';
    else if (remaining.some((value) => value <= 10)) status = 'running_low';
  }
  return { weekly, fiveHour, status, observedAt };
}

export function remainingPercent(window?: OverviewWindow): number | null {
  const used = window?.usedPercent;
  return typeof used === 'number' && Number.isFinite(used) && used >= 0
    ? Math.max(0, Math.min(100, 100 - used))
    : null;
}

export function formatRemaining(value: number | null, locale?: string): string {
  if (value === null) return '—';
  if (value > 0 && value < 0.1) return '<0.1%';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value) + '%';
}
