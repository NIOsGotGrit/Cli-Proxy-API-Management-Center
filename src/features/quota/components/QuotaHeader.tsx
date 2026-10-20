import { useTranslation } from 'react-i18next';
import { resolveTimeZoneLabel } from '@/utils/time/timezone';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from './QuotaHeader.module.scss';

export type QuotaHeaderProps = {
  totalCount: number;
  loadedCount: number;
  attentionCount: number;
  refreshing: boolean;
  disableControls: boolean;
  onRefreshAll: () => void;
};

/** Quota uses the shared workspace page header. */
export function QuotaHeader(props: QuotaHeaderProps) {
  const { refreshing, disableControls, onRefreshAll } = props;
  const { t } = useTranslation();

  return (
    <PageHeader
      title={t('quota_management.overview.title')}
      description={
        <>
          {t('quota_management.overview.subtitle')} · {resolveTimeZoneLabel()}
        </>
      }
      action={
        <button
          type="button"
          className={styles.primaryAction}
          onClick={onRefreshAll}
          disabled={disableControls || refreshing}
        >
          <IconRefreshCw size={14} className={refreshing ? styles.spinning : undefined} />
          {t('common.refresh')}
        </button>
      }
    />
  );
}
