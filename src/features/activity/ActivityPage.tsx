import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { getTypeLabel } from '@/features/authFiles/constants';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { apiClient } from '@/services/api/client';
import { useRoutingMonitor } from './useRoutingMonitor';
import { cacheHit, requestedProviderLabel } from './routing';
import { RoutingSummary } from './RoutingSummary';
import styles from './activity.module.scss';

export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const monitor = useRoutingMonitor();
  const [changesOnly, setChangesOnly] = useState(false);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<{ revision: number; id: string } | null>(null);
  const data = monitor.data;
  const revision = apiClient.getConnectionRevision();
  const event =
    selected?.revision === revision ? data?.events.find((row) => row.id === selected.id) : null;
  const rows = (data?.events ?? []).filter(
    (row) =>
      !changesOnly ||
      row.kind === 'provider_replacement' ||
      row.kind === 'account_change' ||
      row.cacheDrop
  );
  const percent = (value: number | null) =>
    value === null
      ? '—'
      : `${value.toLocaleString(i18n.resolvedLanguage, { maximumFractionDigits: 1 })}%`;
  const date = (time: number) => new Date(time).toLocaleString(i18n.resolvedLanguage);
  useHeaderRefresh(monitor.refresh);
  return (
    <div className={styles.page}>
      <PageHeader
        title={t('workspace.activity')}
        description={t('routing_monitor.description')}
        action={
          <div className={styles.actions}>
            <Link to="/activity/traffic" className={styles.link}>
              {t('routing_monitor.traffic')}
            </Link>
            <Button variant="secondary" onClick={() => void monitor.refresh()}>
              {t('common.refresh')}
            </Button>
          </div>
        }
      />
      <RoutingSummary data={data} error={monitor.error} />
      <section className={styles.surface}>
        <div className={styles.sectionHeader}>
          <h2>{t('routing_monitor.requests')}</h2>
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={changesOnly}
              onChange={(change) => {
                setChangesOnly(change.target.checked);
                setLimit(25);
              }}
            />
            {t('routing_monitor.changes_only')}
          </label>
        </div>
        {!rows.length ? (
          <EmptyState
            title={t('routing_monitor.waiting')}
            description={t(
              monitor.error
                ? 'routing_monitor.unavailable_description'
                : 'routing_monitor.completed_only'
            )}
          />
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={`${styles.table} ${styles.requestsTable}`}>
                <thead>
                  <tr>
                    <th>{t('routing_monitor.time')}</th>
                    <th>{t('routing_monitor.requested')}</th>
                    <th>{t('routing_monitor.handled_by')}</th>
                    <th>{t('routing_monitor.result')}</th>
                    <th>{t('routing_monitor.cache_hit')}</th>
                    <th>
                      <span className={styles.srOnly}>{t('workspace.view_details')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, limit).map((row) => (
                    <tr key={row.id}>
                      <td className={styles.time} title={date(row.completedAt)}>
                        {new Date(row.completedAt).toLocaleTimeString(i18n.resolvedLanguage, {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td data-label={t('routing_monitor.requested')}>
                        <span>{requestedProviderLabel(row)}</span>
                        <span className={styles.secondary}>{row.requestedModel}</span>
                      </td>
                      <td data-label={t('routing_monitor.handled_by')}>
                        <span>{getTypeLabel(t, row.provider)}</span>
                        <span className={styles.secondary}>{row.actualModel}</span>
                      </td>
                      <td>
                        <span
                          className={
                            row.kind === 'provider_replacement' || row.failed
                              ? styles.warning
                              : undefined
                          }
                        >
                          {t(`routing_monitor.${row.kind}`)}
                        </span>
                        {row.cacheDrop && (
                          <span className={styles.warning}>{t('routing_monitor.cache_drop')}</span>
                        )}
                      </td>
                      <td data-label={t('routing_monitor.cache_hit')}>
                        {percent(cacheHit(row.cache))}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.detailAction}
                          onClick={() => setSelected({ revision, id: row.id })}
                          aria-label={t('routing_monitor.request_details', {
                            time: date(row.completedAt),
                          })}
                        >
                          {t('workspace.view_details')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > limit && (
              <Button variant="ghost" onClick={() => setLimit((value) => value + 25)}>
                {t('routing_monitor.show_more')}
              </Button>
            )}
          </>
        )}
        <p className={styles.caption}>{t('routing_monitor.history_scope')}</p>
      </section>
      {data && data.cache.groups.length > 0 && (
        <section className={styles.surface}>
          <h2>{t('routing_monitor.cache_by_model')}</h2>
          <p className={styles.muted}>{t('routing_monitor.cache_definition')}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('routing_monitor.handled_by')}</th>
                  <th>{t('routing_monitor.cache_hit')}</th>
                  <th>{t('routing_monitor.cache_reads')}</th>
                  <th>{t('routing_monitor.cache_write_label')}</th>
                  <th>{t('routing_monitor.requests')}</th>
                </tr>
              </thead>
              <tbody>
                {data.cache.groups.map((group) => (
                  <tr key={`${group.provider}:${group.model}`}>
                    <td>
                      {getTypeLabel(t, group.provider)}
                      <span className={styles.secondary}>{group.model}</span>
                    </td>
                    <td>{percent(group.input > 0 ? (100 * group.read) / group.input : null)}</td>
                    <td>{group.read.toLocaleString(i18n.resolvedLanguage)}</td>
                    <td>{group.write.toLocaleString(i18n.resolvedLanguage)}</td>
                    <td>
                      {group.reportedRequests} / {group.requests}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Sheet
        open={!!event}
        onClose={() => setSelected(null)}
        title={t('routing_monitor.request_detail')}
        description={event ? date(event.completedAt) : ''}
      >
        {event && (
          <div className={styles.details}>
            <h3>{t(`routing_monitor.${event.kind}`)}</h3>
            <dl className={styles.facts}>
              <div>
                <dt>{t('routing_monitor.requested')}</dt>
                <dd>
                  {requestedProviderLabel(event)}
                  <span className={styles.secondary}>{event.requestedModel}</span>
                </dd>
              </div>
              <div>
                <dt>{t('routing_monitor.handled_by')}</dt>
                <dd>
                  {getTypeLabel(t, event.provider)}
                  <span className={styles.secondary}>{event.actualModel}</span>
                </dd>
              </div>
              <div>
                <dt>{t('workspace.accounts')}</dt>
                <dd>
                  {event.account || event.accountId || t('routing_monitor.not_reported')}
                  {event.accountChanged && (
                    <span className={styles.warning}>{t('routing_monitor.account_change')}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('routing_monitor.effort')}</dt>
                <dd>{event.effort || t('routing_monitor.not_reported')}</dd>
              </div>
              <div>
                <dt>{t('routing_monitor.reason')}</dt>
                <dd>
                  {t(
                    `routing_monitor.${['rate_limit', 'authentication', 'upstream_error'].includes(event.reason) ? event.reason : 'not_reported'}`
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('routing_monitor.duration')}</dt>
                <dd>
                  {(event.latencyMs / 1000).toLocaleString(i18n.resolvedLanguage, {
                    maximumFractionDigits: 1,
                  })}{' '}
                  s
                </dd>
              </div>
              <div>
                <dt>{t('routing_monitor.cache_hit')}</dt>
                <dd>
                  {percent(cacheHit(event.cache))}
                  {event.cacheDrop && (
                    <span className={styles.warning}>
                      {t('routing_monitor.cache_fell', {
                        before: percent(event.previousCacheHit),
                        after: percent(cacheHit(event.cache)),
                      })}
                    </span>
                  )}
                </dd>
              </div>
              {event.cache && (
                <>
                  <div>
                    <dt>{t('routing_monitor.input_tokens')}</dt>
                    <dd>{event.cache.total.toLocaleString(i18n.resolvedLanguage)}</dd>
                  </div>
                  <div>
                    <dt>{t('routing_monitor.cache_reads')}</dt>
                    <dd>{event.cache.read.toLocaleString(i18n.resolvedLanguage)}</dd>
                  </div>
                  <div>
                    <dt>{t('routing_monitor.cache_write_label')}</dt>
                    <dd>{event.cache.write.toLocaleString(i18n.resolvedLanguage)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>{t('routing_monitor.session')}</dt>
                <dd className={styles.identifier}>
                  {event.sessionId || t('routing_monitor.not_reported')}
                </dd>
              </div>
            </dl>
            {event.attempts.length > 0 && (
              <section>
                <h3>{t('routing_monitor.previous_attempts')}</h3>
                {event.attempts.map((attempt, index) => (
                  <p key={index}>
                    {getTypeLabel(t, attempt.provider)} · {attempt.model} · HTTP{' '}
                    {attempt.statusCode}
                  </p>
                ))}
              </section>
            )}
            <p className={styles.muted}>{t('routing_monitor.cache_note')}</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
