import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { getTypeLabel } from '@/features/authFiles/constants';
import {
  formatRemaining,
  quotaOverview,
  remainingPercent,
  type OverviewQuota,
  type OverviewWindow,
} from '../quotaOverview';
import { QuotaCard, type QuotaCardProps } from './QuotaCard';
import styles from './QuotaRow.module.scss';

export function QuotaRow(props: QuotaCardProps) {
  const { entry, quota } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const provider = entry.type === 'claude' ? 'claude' : 'codex';
  const summary = quotaOverview(provider, quota as OverviewQuota | undefined, now);
  const warning = ['plan_limit', 'running_low', 'unknown', 'last_known'].includes(summary.status);

  const renderWindow = (window?: OverviewWindow) => {
    const remaining = remainingPercent(window);
    const reset = window
      ? buildResetDisplay(window.resetLabel, window.resetAtMs, now, i18n.resolvedLanguage)
      : null;
    return (
      <span className={styles.window}>
        <span className={remaining !== null && remaining <= 10 ? styles.low : styles.remaining}>
          {formatRemaining(remaining, i18n.resolvedLanguage)}
        </span>
        <span className={styles.reset}>
          {reset?.absolute ??
            t(`quota_management.overview.${window ? 'no_reset' : 'not_reported'}`)}
        </span>
      </span>
    );
  };

  return (
    <div className={styles.account}>
      <button
        type="button"
        className={styles.row}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles.identity}>
          <span className={styles.name}>{entry.file.email || entry.file.name}</span>
          <span className={styles.provider}>{getTypeLabel(t, provider)}</span>
          <span className={warning ? styles.warning : styles.status}>
            {t(`quota_management.overview.${summary.status}`)}
          </span>
        </span>
        {renderWindow(summary.weekly)}
        {renderWindow(summary.fiveHour)}
      </button>
      {expanded && (
        <div id={detailsId} className={styles.details}>
          {summary.observedAt && (
            <p className={styles.observed}>
              {t('quota_management.overview.checked_at', {
                time: new Date(summary.observedAt).toLocaleString(i18n.resolvedLanguage),
              })}
            </p>
          )}
          <QuotaCard {...props} entranceDelayMs={null} />
        </div>
      )}
    </div>
  );
}
