import type { CacheTokens, RouteEvent, RoutingSnapshot } from '@/services/api/routingMonitor';

export function cacheHit(cache: CacheTokens | null): number | null {
  return cache && cache.total > 0 && cache.read <= cache.total
    ? (100 * cache.read) / cache.total
    : null;
}
export function monitorState(snapshot: RoutingSnapshot | null, error: boolean, now: number) {
  const fresh = !!snapshot && !error && snapshot.connected && now - snapshot.receivedAt < 20000;
  const serverNow = snapshot ? snapshot.serverTime + Math.max(0, now - snapshot.receivedAt) : now;
  const replacement = snapshot?.latestReplacement;
  const recentReplacement =
    fresh &&
    replacement &&
    serverNow - replacement.completedAt < 60000 &&
    serverNow >= replacement.completedAt
      ? replacement
      : null;
  return { fresh, recentReplacement, latest: recentReplacement || snapshot?.latestServed || null };
}
export function requestedProviderLabel(event: RouteEvent): string {
  return (
    (
      { claude: 'Claude', openai: 'OpenAI', google: 'Gemini', xai: 'xAI', kimi: 'Kimi' } as Record<
        string,
        string
      >
    )[event.requestedProvider] || '—'
  );
}
