/** Routes keep their existing URLs; navigation changes do not change API or page contracts. */
export const SETTINGS_PATHS = [
  '/settings',
  '/ai-providers',
  '/routing',
  '/config',
  '/api-keys',
  '/logs',
  '/plugins',
  '/plugin-store',
  '/plugin-pages',
  '/system',
  '/quick-start',
];

export function isSettingsPath(pathname: string): boolean {
  return SETTINGS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function workspaceReturnPath(pathname: string, search = '', hash = ''): string {
  return isSettingsPath(pathname) ? '/' : `${pathname}${search}${hash}`;
}

export function navigationLinkActive(path: string, pathname: string, search: string): boolean {
  const [targetPath, query] = path.split('?');
  if (targetPath === '/auth-files' && pathname === '/oauth') return true;
  if (targetPath !== '/' && pathname !== targetPath && !pathname.startsWith(`${targetPath}/`))
    return false;
  if (targetPath === '/' && pathname !== '/' && pathname !== '/dashboard') return false;
  if (query)
    return new URLSearchParams(search).get('field') === new URLSearchParams(query).get('field');
  if (targetPath === '/config' && new URLSearchParams(search).get('field') === 'routingStrategy')
    return false;
  return true;
}
