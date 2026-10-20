import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { RoutingSummary } from '@/features/activity/RoutingSummary';
import { useRoutingMonitor } from '@/features/activity/useRoutingMonitor';
import { CapacityOverview } from './CapacityOverview';
import { useDashboardOverview } from './hooks/useDashboardOverview';
import styles from './OverviewPage.module.scss';

/** Operational home. Credential health is distinct from quota availability. */
export function OverviewPage() {
  const { t } = useTranslation();
  const monitor = useRoutingMonitor();
  const { connected, connectionStatus, credentials, authFiles, refresh } = useDashboardOverview();
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
      <CapacityOverview files={authFiles} connected={connected} />
      <RoutingSummary data={monitor.data} error={monitor.error} />
    </div>
  );
}
