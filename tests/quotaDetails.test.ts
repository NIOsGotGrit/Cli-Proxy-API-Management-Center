import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/locales/en.json';
import { QuotaDetails } from '@/features/quota/components/QuotaDetails';
import type { ClaudeQuotaState, CodexQuotaState } from '@/types';

const i18n = createInstance();
await i18n.init({
  lng: 'en',
  resources: { en: { translation: en } },
  interpolation: { escapeValue: false },
});
const initialLanguage = i18n.language;
afterEach(async () => {
  await i18n.changeLanguage(initialLanguage);
});
const render = (props: Parameters<typeof QuotaDetails>[0]) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n }, createElement(QuotaDetails, props))
  );

describe('quota detail disclosure', () => {
  test('keeps scoped allowance separate from the base limits already shown in the summary', () => {
    const quota: ClaudeQuotaState = {
      status: 'success',
      windows: [
        { id: 'seven-day', label: 'Base weekly', usedPercent: 100, resetLabel: '' },
        { id: 'five-hour', label: 'Base five hour', usedPercent: 0, resetLabel: '' },
        { id: 'scoped', label: 'Model quota', usedPercent: 99.96, resetLabel: '' },
      ],
    };
    const markup = render({ provider: 'claude', quota });
    expect(markup).toContain('Model quota');
    expect(markup).toContain('&lt;0.1%');
    expect(markup).not.toContain('Base weekly');
    expect(markup).not.toContain('Base five hour');
    expect(markup).toContain('<th scope="col">Resets</th>');
  });
  test('hides empty extra-usage amounts while preserving a distinct dollar balance', () => {
    const quota: ClaudeQuotaState = {
      status: 'success',
      planType: 'max',
      windows: [],
      extraUsage: {
        isEnabled: false,
        usedCredits: null,
        monthlyLimit: null,
        utilization: null,
        currency: null,
        disabledReason: null,
        userDisabled: null,
        spendLimitReached: null,
      },
      dollarWindows: [
        {
          key: 'provider_balance',
          remainingDollars: 170,
          usedDollars: 80,
          limitDollars: 250,
          utilization: 32,
          resetsAt: null,
        },
      ],
    };
    const markup = render({ provider: 'claude', quota, claudeResets: 0 });
    expect(markup).toContain('Disabled');
    expect(markup).toContain('$170.00 remaining');
    expect(markup).toContain('$80.00');
    expect(markup).toContain('$250.00');
    expect(markup).not.toContain('Spent — / Limit —');
    expect(markup).toContain('Resets remaining');
  });
  test('does not equate Codex credits with quota or manual resets', () => {
    const quota: CodexQuotaState = {
      status: 'success',
      windows: [],
      creditBalance: '62500',
      rateLimitResetCreditsAvailableCount: 0,
      planType: 'self_serve_business_prolite',
    };
    const markup = render({ provider: 'codex', quota });
    expect(markup).toContain('Business Premium');
    expect(markup).toContain('62500');
    expect(markup).toContain('Resets remaining');
    expect(markup).not.toContain('62500%');
    expect(markup).not.toContain('Unlimited');
  });
});
