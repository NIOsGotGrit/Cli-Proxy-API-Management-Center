import { describe, expect, test } from 'bun:test';
import {
  isSettingsPath,
  navigationLinkActive,
  workspaceReturnPath,
} from '@/components/layout/navigation';

describe('workspace navigation', () => {
  test('every technical page and nested plugin page uses the Settings sidebar', () => {
    for (const path of [
      '/settings',
      '/ai-providers',
      '/routing',
      '/config',
      '/api-keys',
      '/logs',
      '/plugins',
      '/plugin-store',
      '/plugin-pages/example/0',
      '/system',
      '/quick-start',
    ]) {
      expect(isSettingsPath(path)).toBe(true);
    }
    for (const path of [
      '/',
      '/auth-files',
      '/auth-files/oauth-model-alias',
      '/oauth',
      '/quota',
      '/activity',
      '/configuration',
    ]) {
      expect(isSettingsPath(path)).toBe(false);
    }
  });
  test('workspace return preserves query and hash without returning to a settings page', () => {
    expect(workspaceReturnPath('/quota', '?provider=claude', '#account')).toBe(
      '/quota?provider=claude#account'
    );
    expect(workspaceReturnPath('/config', '?field=port')).toBe('/');
  });
  test('OAuth belongs to Accounts and detail editors retain their parent navigation', () => {
    expect(navigationLinkActive('/auth-files', '/oauth', '')).toBe(true);
    expect(navigationLinkActive('/auth-files', '/auth-files/oauth-model-alias', '')).toBe(true);
    expect(navigationLinkActive('/', '/quota', '')).toBe(false);
    expect(navigationLinkActive('/', '/dashboard', '')).toBe(true);
    expect(navigationLinkActive('/routing', '/routing', '')).toBe(true);
    expect(navigationLinkActive('/config', '/routing', '')).toBe(false);
  });
});
