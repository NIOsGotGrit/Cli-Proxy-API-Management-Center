import type { ClaudeQuotaState, CodexQuotaState } from '@/types';
import { quotaOverview } from '@/features/quota/quotaOverview';

/** Cached observations are useful on Home only when their freshness remains explicit. */
export function quotaSnapshot(claude: ClaudeQuotaState[], codex: CodexQuotaState[], now: number) {
  const summaries = [
    ...claude
      .filter((quota) => quota.observedAt)
      .map((quota) => quotaOverview('claude', quota, now)),
    ...codex.filter((quota) => quota.observedAt).map((quota) => quotaOverview('codex', quota, now)),
  ];
  const current = summaries.filter((summary) =>
    ['available', 'running_low', 'plan_limit'].includes(summary.status)
  );
  const resets = current
    .flatMap((summary) => [summary.fiveHour, summary.weekly])
    .map((window) => window?.resetAtMs)
    .filter(
      (reset): reset is number => typeof reset === 'number' && Number.isFinite(reset) && reset > now
    );
  return {
    checked: summaries.length,
    available: current.filter((summary) => summary.status !== 'plan_limit').length,
    limited: current.filter((summary) => summary.status === 'plan_limit').length,
    stale: summaries.filter((summary) => summary.status === 'last_known').length,
    nextReset: resets.length ? Math.min(...resets) : null,
  };
}
