import { useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import { Button } from '@/components/ui/Button';
import { useQuotaStore } from '@/stores';
import { useNow } from '@/hooks/useNow';
import { useInterval } from '@/hooks/useInterval';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { buildResetDisplay } from '@/utils/quota';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { getTypeLabel } from '@/features/authFiles/constants';
import { classifyQuotaFiles } from '@/features/quota/logic';
import { useQuotaBatchLoader } from '@/features/quota/hooks/useQuotaBatchLoader';
import { QUOTA_ADAPTERS, getQuotaMap } from '@/features/quota/providers';
import {
  formatRemaining,
  remainingPercent,
  quotaOverview,
  type OverviewQuota,
  type OverviewWindow,
} from '@/features/quota/quotaOverview';
import styles from './CapacityOverview.module.scss';

export function CapacityOverview({
  files,
  connected,
}: {
  files: AuthFileItem[] | null;
  connected: boolean;
}) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const layer = usePageTransitionLayer();
  const active = connected && (!layer || layer.isCurrentLayer);
  const claude = useQuotaStore((state) => state.claudeQuota);
  const codex = useQuotaStore((state) => state.codexQuota);
  const entries = useMemo(
    () =>
      classifyQuotaFiles(files ?? []).filter(
        (entry) => entry.type === 'claude' || entry.type === 'codex'
      ),
    [files]
  );
  const { loadQuota, batchLoading } = useQuotaBatchLoader();
  const refresh = useCallback(
    async (force = false) => {
      if (!active) return;
      const targets = entries.filter((entry) => {
        if (entry.file.disabled) return false;
        const quota = getQuotaMap(QUOTA_ADAPTERS[entry.type])[getQuotaCacheKey(entry.file)] as
          OverviewQuota | undefined;
        if (quota?.status === 'loading') return false;
        return force || !quota?.observedAt || Date.now() - Date.parse(quota.observedAt) > 300000;
      });
      await loadQuota(targets);
    },
    [active, entries, loadQuota]
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useInterval(
    () => {
      if (document.visibilityState === 'visible') void refresh();
    },
    active ? 300000 : null
  );
  const windowCell = (label: string, window?: OverviewWindow) => {
    const remaining = remainingPercent(window);
    const reset = window
      ? buildResetDisplay(window.resetLabel, window.resetAtMs, now, i18n.resolvedLanguage)
      : null;
    return (
      <td data-label={label}>
        <strong className={remaining !== null && remaining <= 10 ? styles.low : styles.amount}>
          {formatRemaining(remaining, i18n.resolvedLanguage)}
        </strong>
        <span className={styles.secondary}>
          {reset?.absolute ??
            t(`quota_management.overview.${window ? 'no_reset' : 'not_reported'}`)}
        </span>
      </td>
    );
  };
  return (
    <section className={styles.surface}>
      <header className={styles.header}>
        <div>
          <h2>{t('workspace.capacity')}</h2>
          <p>
            {t('routing_monitor.capacity_description')} · {resolveTimeZoneLabel()}
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh(true)}
            disabled={!active || batchLoading}
          >
            {t('common.refresh')}
          </Button>
          <Link to="/quota">{t('workspace.view_quota')} →</Link>
        </div>
      </header>
      {!entries.length ? (
        <p className={styles.secondary}>{t('routing_monitor.capacity_empty')}</p>
      ) : (
        <div className={styles.wrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('workspace.accounts')}</th>
                <th>{t('claude_quota.plan_label')}</th>
                <th>{t('quota_management.overview.five_hour_left')}</th>
                <th>{t('quota_management.overview.weekly_left')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const provider = entry.type === 'claude' ? 'claude' : 'codex';
                const quota = (provider === 'claude' ? claude : codex)[
                  getQuotaCacheKey(entry.file)
                ];
                const summary = quotaOverview(provider, quota, now);
                const plan = quota?.planType;
                const planLabel = !plan
                  ? '—'
                  : provider === 'claude'
                    ? t(`claude_quota.${plan}`, { defaultValue: plan })
                    : t(
                        plan === 'self_serve_business_prolite'
                          ? 'codex_quota.plan_business_premium'
                          : `codex_quota.plan_${plan}`,
                        { defaultValue: plan }
                      );
                return (
                  <tr key={`${provider}:${getQuotaCacheKey(entry.file)}`}>
                    <td>
                      <span className={styles.name}>{entry.file.email || entry.file.name}</span>
                      <span className={styles.secondary}>
                        {getTypeLabel(t, provider)} ·{' '}
                        {t(`quota_management.overview.${summary.status}`)}
                      </span>
                      {quota?.observedAt && (
                        <span className={styles.secondary}>
                          {t('quota_management.overview.checked_at', {
                            time: new Date(quota.observedAt).toLocaleTimeString(
                              i18n.resolvedLanguage,
                              { hour: '2-digit', minute: '2-digit' }
                            ),
                          })}
                        </span>
                      )}
                    </td>
                    <td data-label={t('claude_quota.plan_label')}>{planLabel}</td>
                    {windowCell(t('quota_management.overview.five_hour_left'), summary.fiveHour)}
                    {windowCell(t('quota_management.overview.weekly_left'), summary.weekly)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
