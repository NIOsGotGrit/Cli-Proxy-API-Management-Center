import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useQuotaStore } from '@/stores';
import { useNow } from '@/hooks/useNow';
import { buildResetDisplay } from '@/utils/quota';
import { quotaSnapshot } from './quotaSnapshot';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import styles from './OverviewPage.module.scss';

/** Operational home. Credential health is distinct from quota availability. */
export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const now = useNow();
  const claudeQuota = useQuotaStore((state) => state.claudeQuota);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const quota = quotaSnapshot(Object.values(claudeQuota), Object.values(codexQuota), now);
  const reset = buildResetDisplay(null, quota.nextReset, now, i18n.resolvedLanguage);
  const { connected, connectionStatus, credentials, traffic, refresh } = useDashboardOverview();
  const version = useAuthStore((state) => state.serverVersion);
  useHeaderRefresh(refresh, connected);
  return (
    <div className={styles.page}>
      <PageHeader
        title={t('workspace.overview')}
        description={t('workspace.overview_description')}
        action={
          <Button variant="secondary" onClick={() => void refresh()} disabled={!connected}>
            {t('common.refresh')}
          </Button>
        }
      />
      <div className={styles.grid}>
        <section className={styles.surface}>
          <h2>{t('workspace.proxy_status')}</h2>
          <strong className={styles.value}>
            {t(
              connectionStatus === 'connected'
                ? 'common.connected'
                : connectionStatus === 'connecting'
                  ? 'common.connecting'
                  : 'common.disconnected'
            )}
          </strong>
          <p>{version ? `CPA ${version}` : t('workspace.version_unknown')}</p>
          <Link to="/system">{t('workspace.system_details')} →</Link>
        </section>
        <section className={styles.surface}>
          <h2>{t('workspace.accounts')}</h2>
          <strong className={styles.value}>{credentials ? credentials.active : '—'}</strong>
          <p>{t('workspace.account_health')}</p>
          <Link to="/auth-files">{t('workspace.manage_accounts')} →</Link>
        </section>
      </div>
      <section className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>{t('workspace.capacity')}</h2>
          <Link to="/quota">{t('workspace.view_quota')} →</Link>
        </div>
        {quota.checked ? (
          <>
            <dl className={styles.metrics}>
              <div>
                <dt>{t('workspace.reported_allowance')}</dt>
                <dd>{quota.available}</dd>
              </div>
              <div>
                <dt>{t('quota_management.overview.plan_limit')}</dt>
                <dd>{quota.limited}</dd>
              </div>
              {quota.stale > 0 && (
                <div>
                  <dt>{t('quota_management.overview.last_known')}</dt>
                  <dd>{quota.stale}</dd>
                </div>
              )}
            </dl>
            {reset && (
              <p>{t('workspace.next_reset', { time: `${reset.relative} · ${reset.absolute}` })}</p>
            )}
            <p>{t('workspace.quota_snapshot_scope')}</p>
          </>
        ) : (
          <p>{t('workspace.capacity_description')}</p>
        )}
      </section>
      <section className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>{t('workspace.activity')}</h2>
          <Link to="/activity">{t('workspace.view_activity')} →</Link>
        </div>
        <dl className={styles.metrics}>
          <div>
            <dt>{t('dashboard.hero_requests_label')}</dt>
            <dd>{traffic.total.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t('stats.success')}</dt>
            <dd>{traffic.totalSuccess.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t('stats.failure')}</dt>
            <dd>{traffic.totalFailure.toLocaleString()}</dd>
          </div>
        </dl>
        <p>{t('workspace.activity_scope')}</p>
      </section>
    </div>
  );
}
