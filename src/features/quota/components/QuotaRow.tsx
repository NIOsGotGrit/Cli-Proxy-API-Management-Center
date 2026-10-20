import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/ui/Sheet';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { getTypeLabel, getAuthFileIcon } from '@/features/authFiles/constants';
import {
  formatRemaining,
  quotaOverview,
  remainingPercent,
  type OverviewQuota,
  type OverviewWindow,
} from '../quotaOverview';
import { QuotaCard, type QuotaCardProps } from './QuotaCard';
import styles from './QuotaRow.module.scss';

/** Account summary owns disclosure; the existing card owns refresh and reset operations. */
export function QuotaRow(props: QuotaCardProps) {
  const { entry, quota } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const provider = entry.type === 'claude' ? 'claude' : 'codex';
  const summary = quotaOverview(provider, quota as OverviewQuota | undefined, now);
  const warning = ['plan_limit', 'running_low', 'unknown', 'last_known'].includes(summary.status);
  const name = entry.file.email || entry.file.name;
  const icon = getAuthFileIcon(provider, props.resolvedTheme);
  const checkedAt = summary.observedAt ? new Date(summary.observedAt) : null;

  const renderWindow = (label: string, window?: OverviewWindow) => {
    const remaining = remainingPercent(window);
    const reset = window
      ? buildResetDisplay(window.resetLabel, window.resetAtMs, now, i18n.resolvedLanguage)
      : null;
    return (
      <div className={styles.window}>
        <span className={styles.label}>{label}</span>
        <span className={remaining !== null && remaining <= 10 ? styles.low : styles.remaining}>
          {formatRemaining(remaining, i18n.resolvedLanguage)}
        </span>
        <span className={styles.reset}>
          {reset ? (
            <>
              <span>{reset.relative || reset.absolute}</span>
              {reset.relative && <span className={styles.absolute}>{reset.absolute}</span>}
            </>
          ) : (
            t(`quota_management.overview.${window ? 'no_reset' : 'not_reported'}`)
          )}
        </span>
      </div>
    );
  };
  const limits = (
    <div className={styles.limits}>
      {renderWindow(t('quota_management.overview.five_hour_left'), summary.fiveHour)}
      {renderWindow(t('quota_management.overview.weekly_left'), summary.weekly)}
    </div>
  );

  return (
    <article className={styles.account}>
      <header className={styles.identity}>
        <div className={styles.provider}>
          {icon && <img src={icon} alt="" />}
          <span>{getTypeLabel(t, provider)}</span>
          <span className={warning ? styles.warning : styles.status}>
            {t(`quota_management.overview.${summary.status}`)}
          </span>
        </div>
        <h2 className={styles.name}>{name}</h2>
      </header>
      {limits}
      <footer className={styles.footer}>
        <span className={styles.checked} title={checkedAt?.toLocaleString(i18n.resolvedLanguage)}>
          {checkedAt &&
            t('quota_management.overview.checked_at', {
              time: checkedAt.toLocaleTimeString(i18n.resolvedLanguage, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
        </span>
        <button
          type="button"
          className={styles.open}
          onClick={() => setExpanded(true)}
          aria-label={t('workspace.account_details', {
            name: `${getTypeLabel(t, provider)} · ${name}`,
          })}
        >
          {t('workspace.view_details')} <span aria-hidden="true">→</span>
        </button>
      </footer>
      <Sheet
        open={expanded}
        onClose={() => setExpanded(false)}
        size="md"
        title={name}
        eyebrow={getTypeLabel(t, provider)}
        description={t(`quota_management.overview.${summary.status}`)}
      >
        {expanded && (
          <div className={styles.detailBody}>
            {limits}
            <QuotaCard {...props} presentation="details" entranceDelayMs={null} />
          </div>
        )}
      </Sheet>
    </article>
  );
}
