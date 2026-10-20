import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getTypeLabel } from '@/features/authFiles/constants';
import { useNow } from '@/hooks/useNow';
import type { RoutingSnapshot } from '@/services/api/routingMonitor';
import { monitorState, requestedProviderLabel } from './routing';
import styles from './activity.module.scss';

export function RoutingSummary({ data, error }: { data: RoutingSnapshot | null; error: boolean }) {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const { fresh, recentReplacement, latest } = monitorState(data, error, now);
  const percent =
    data && data.cache.input > 0 ? Math.min(100, (100 * data.cache.read) / data.cache.input) : null;
  const cacheDrops =
    data?.events.filter((event) => event.cacheDrop && event.completedAt >= data.serverTime - 900000)
      .length ?? 0;
  const number = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  return (
    <div className={styles.summaryGrid}>
      <section className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>{t('routing_monitor.title')}</h2>
          <span className={recentReplacement ? styles.warning : styles.muted}>
            {t(
              `routing_monitor.${!fresh ? (error ? 'unavailable' : 'reconnecting') : recentReplacement ? 'recent_replacement' : 'observing'}`
            )}
          </span>
        </div>
        {latest ? (
          <>
            <div className={styles.route}>
              {requestedProviderLabel(latest)} <span aria-hidden="true">→</span>{' '}
              {getTypeLabel(t, latest.provider)}
            </div>
            <p className={styles.models}>
              {latest.requestedModel} → {latest.actualModel}
            </p>
            <p className={styles.muted}>
              {t('routing_monitor.last_served', {
                time: new Date(latest.completedAt).toLocaleTimeString(i18n.resolvedLanguage, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              })}
            </p>
          </>
        ) : (
          <p className={styles.empty}>
            {t(`routing_monitor.${error ? 'unavailable_description' : 'waiting'}`)}
          </p>
        )}
        <Link to="/activity" className={styles.link}>
          {t('routing_monitor.view_requests')} →
        </Link>
      </section>
      <section className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>{t('routing_monitor.cache_hit')}</h2>
          <span className={styles.muted}>{t('routing_monitor.last_15m')}</span>
        </div>
        <div className={styles.metric}>
          {percent === null
            ? '—'
            : `${percent.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })}%`}
        </div>
        <p className={styles.muted}>
          {data && percent !== null
            ? t('routing_monitor.cache_read_of', {
                read: number(data.cache.read),
                total: number(data.cache.input),
              })
            : t('routing_monitor.not_reported')}
        </p>
        {data && data.cache.reportedRequests > 0 && (
          <p className={styles.muted}>
            {t('routing_monitor.cache_writes', {
              count: number(data.cache.write),
              reported: data.cache.reportedRequests,
              total: data.cache.requests,
            })}
          </p>
        )}
        {cacheDrops > 0 && (
          <p className={styles.warning}>
            {t('routing_monitor.cache_drops', { count: cacheDrops })}
          </p>
        )}
        {!fresh && data && <p className={styles.warning}>{t('routing_monitor.last_known')}</p>}
        <Link to="/activity" className={styles.link}>
          {t('workspace.view_details')} →
        </Link>
      </section>
    </div>
  );
}
