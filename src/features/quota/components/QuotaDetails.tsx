import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';
import type { AnthropicResetGrant } from '@/services/api/claudeResetGrants';
import { useNow } from '@/hooks/useNow';
import {
  buildResetDisplay,
  normalizePlanType,
  PREMIUM_CODEX_PLAN_TYPES,
  resolveResetMs,
} from '@/utils/quota';
import { formatRemaining, remainingPercent } from '../quotaOverview';
import styles from './QuotaDetails.module.scss';

type QuotaDetailsProps = {
  claudeResets?: number | null;
  claudeGrants?: readonly AnthropicResetGrant[];
} & (
  { provider: 'claude'; quota: ClaudeQuotaState } | { provider: 'codex'; quota: CodexQuotaState }
);

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Expanded rows add scoped limits and billing facts, without repeating the account limits. */
export function QuotaDetails(props: QuotaDetailsProps) {
  const { provider, quota } = props;
  const { t, i18n } = useTranslation();
  const now = useNow();
  const locale = i18n.resolvedLanguage;
  const claude = provider === 'claude' ? props.quota : null;
  const codex = provider === 'codex' ? props.quota : null;
  const extra = claude?.extraUsage;
  const windows = quota.windows.filter(
    (window) => !['five-hour', provider === 'claude' ? 'seven-day' : 'weekly'].includes(window.id)
  );
  const money = (value: number | null, currency = 'USD', divisor = 1) => {
    if (value === null) return '—';
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / divisor);
    } catch {
      return `${(value / divisor).toFixed(2)} ${currency}`;
    }
  };
  const reset = (label: string | null | undefined, at: number | null | undefined) => {
    const display = buildResetDisplay(label, at, now, locale);
    return display ? (
      <span className={styles.reset}>
        <span>{display.relative || display.absolute}</span>
        {display.relative && <span className={styles.secondary}>{display.absolute}</span>}
      </span>
    ) : (
      <span className={styles.secondary}>{t('quota_management.overview.no_reset')}</span>
    );
  };
  const planLabel = () => {
    if (!quota.planType) return t('claude_quota.plan_unknown');
    if (claude) return t(`claude_quota.${quota.planType}`, { defaultValue: quota.planType });
    const plan = normalizePlanType(quota.planType) ?? '';
    if (plan === 'self_serve_business_prolite') return t('codex_quota.plan_business_premium');
    if (plan === 'pro') return t('codex_quota.plan_pro');
    if (PREMIUM_CODEX_PLAN_TYPES.has(plan)) return t('codex_quota.plan_prolite');
    return t(`codex_quota.plan_${plan}`, { defaultValue: quota.planType });
  };
  const resetCount = claude ? props.claudeResets : codex?.rateLimitResetCreditsAvailableCount;

  return (
    <div className={styles.details}>
      {windows.length > 0 && (
        <section className={styles.limits}>
          <h3>{t('quota_management.details.additional_limits')}</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('quota_management.details.limit')}</th>
                <th scope="col">{t('quota_management.details.left')}</th>
                <th scope="col">{t('quota_management.details.resets')}</th>
              </tr>
            </thead>
            <tbody>
              {windows.map((window) => {
                const remaining = remainingPercent(window);
                return (
                  <tr key={window.id}>
                    <th scope="row">
                      {window.labelKey
                        ? t(
                            window.labelKey,
                            (window as { labelParams?: Record<string, string | number> })
                              .labelParams ?? {}
                          )
                        : window.label}
                    </th>
                    <td
                      className={remaining !== null && remaining <= 10 ? styles.low : styles.value}
                    >
                      {formatRemaining(remaining, locale)}
                    </td>
                    <td>{reset(window.resetLabel, window.resetAtMs)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <section className={styles.plan}>
        <h3>{t('quota_management.details.plan_and_balance')}</h3>
        <dl>
          <Fact label={t('claude_quota.plan_label')}>{planLabel()}</Fact>
          {resetCount != null && <Fact label={t('claude_reset.remaining')}>{resetCount}</Fact>}
          {extra && (
            <Fact label={t('claude_quota.extra_usage_label')}>
              {t(
                extra.isEnabled === null
                  ? 'claude_quota.plan_unknown'
                  : extra.isEnabled
                    ? 'claude_quota.extra_usage_enabled'
                    : 'claude_quota.extra_usage_disabled'
              )}
              {(extra.usedCredits !== null || extra.monthlyLimit !== null) && (
                <span className={styles.secondary}>
                  {t('claude_quota.usage_spent_limit', {
                    spent: money(extra.usedCredits, extra.currency ?? 'USD', 100),
                    limit: money(extra.monthlyLimit, extra.currency ?? 'USD', 100),
                  })}
                </span>
              )}
              {extra.utilization !== null && (
                <span className={styles.secondary}>
                  {t('claude_quota.usage_utilization', { percent: extra.utilization })}
                </span>
              )}
              {extra.userDisabled && (
                <span className={styles.secondary}>
                  {t('claude_quota.extra_usage_user_disabled')}
                </span>
              )}
              {extra.spendLimitReached && (
                <span className={styles.secondary}>
                  {t('claude_quota.extra_usage_spend_limit_reached')}
                </span>
              )}
              {extra.disabledReason && (
                <span className={styles.secondary}>
                  {t('claude_quota.extra_usage_disabled_reason', { reason: extra.disabledReason })}
                </span>
              )}
            </Fact>
          )}
          {codex && (codex.creditsUnlimited || codex.creditBalance != null) && (
            <Fact label={t('codex_quota.credit_balance_label')}>
              {codex.creditsUnlimited ? t('codex_quota.credit_unlimited') : codex.creditBalance}
            </Fact>
          )}
          {codex?.subscriptionActiveUntil != null && (
            <Fact label={t('codex_quota.expires_label')}>
              {reset(
                String(codex.subscriptionActiveUntil),
                resolveResetMs([codex.subscriptionActiveUntil])
              )}
            </Fact>
          )}
        </dl>
        {(claude?.dollarWindows ?? []).map((balance) => (
          <div className={styles.balance} key={balance.key}>
            <span className={styles.balanceValue}>
              {t('claude_quota.dollar_balance_remaining', {
                amount: money(balance.remainingDollars),
              })}
            </span>
            <span className={styles.secondary}>{balance.key}</span>
            <dl>
              <Fact label={t('quota_management.details.spent')}>{money(balance.usedDollars)}</Fact>
              <Fact label={t('quota_management.details.limit')}>{money(balance.limitDollars)}</Fact>
              <Fact label={t('quota_management.details.resets')}>
                {reset(null, resolveResetMs([balance.resetsAt]))}
              </Fact>
            </dl>
          </div>
        ))}
        {(props.claudeGrants ?? [])
          .filter((grant) => grant.resetsLeft > 0)
          .map((grant, index) => (
            <div className={styles.balance} key={grant.id}>
              <span>{grant.label || t('claude_reset.grant_number', { index: index + 1 })}</span>
              <span className={styles.secondary}>
                {t('claude_reset.count', { left: grant.resetsLeft, total: grant.resetsTotal })}
              </span>
              <dl>
                <Fact label={t('codex_quota.expires_label')}>
                  {reset(null, resolveResetMs([grant.endsAt]))}
                </Fact>
              </dl>
            </div>
          ))}
        {(codex?.rateLimitResetCredits ?? []).map((credit, index) => (
          <dl key={credit.id}>
            <Fact label={t('codex_quota.reset_credit_number', { index: index + 1 })}>
              {reset(credit.expiresAt, resolveResetMs([credit.expiresAt]))}
            </Fact>
          </dl>
        ))}
        {codex?.rateLimitResetCreditsError && (
          <p role="status" className={styles.low}>
            {t('codex_quota.reset_credits_expiry_failed', {
              message: codex.rateLimitResetCreditsError,
            })}
          </p>
        )}
      </section>
    </div>
  );
}
