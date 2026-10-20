import { describe, expect, test } from 'bun:test';
import { normalizeRouteEvent, normalizeRoutingSnapshot } from '@/services/api/routingMonitor';
import { cacheHit, monitorState } from '@/features/activity/routing';

const event = {
  id: 'request-1',
  provider: 'codex',
  requested_provider: 'claude',
  requested_model: 'claude-opus-5-5',
  actual_model: 'gpt-6.1-sol',
  kind: 'provider_replacement',
  completed_at: 100000,
  failed: false,
};
const snapshot = () =>
  normalizeRoutingSnapshot({
    version: 1,
    server_time: 110000,
    connected: true,
    events: [event],
    latest_replacement: event,
    latest_served: event,
    cache_summary: {
      requests: 1,
      reported_requests: 1,
      input_tokens: 1000,
      read_tokens: 900,
      write_tokens: 0,
      groups: [],
    },
  });

describe('routing observations', () => {
  test('normalizes only the published safe DTO and preserves actual and requested model separately', () => {
    const result = normalizeRouteEvent({
      ...event,
      api_key: 'secret',
      source: 'secret',
      cache: null,
    });
    expect(result?.requestedModel).toBe('claude-opus-5-5');
    expect(result?.actualModel).toBe('gpt-6.1-sol');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(normalizeRouteEvent({ ...event, kind: 'made_up_fallback' })).toBeNull();
  });
  test('missing and invalid cache data is unknown, not zero percent', () => {
    expect(cacheHit(null)).toBeNull();
    expect(cacheHit({ total: 0, read: 0, write: 0 })).toBeNull();
    expect(cacheHit({ total: 1000, read: 900, write: 50 })).toBe(90);
    expect(
      normalizeRouteEvent({
        ...event,
        cache: { total_tokens: 100, cache_read_tokens: 200, cache_write_tokens: 0 },
      })?.cache
    ).toBeNull();
    expect(
      normalizeRouteEvent({
        ...event,
        cache: { total_tokens: 100, cache_read_tokens: 'unknown', cache_write_tokens: 0 },
      })?.cache
    ).toBeNull();
  });
  test('an idle or disconnected monitor never claims a recent active replacement', () => {
    const data = snapshot();
    data.receivedAt = 200000;
    expect(monitorState(data, false, 200000).recentReplacement?.id).toBe('request-1');
    expect(monitorState(data, false, 261000).recentReplacement).toBeNull();
    expect(monitorState(data, true, 200000).recentReplacement).toBeNull();
    expect(monitorState({ ...data, connected: false }, false, 200000).recentReplacement).toBeNull();
    expect(monitorState(data, false, 261000).latest?.id).toBe('request-1');
  });
  test('rejects a missing collector rather than presenting an empty success state', () => {
    expect(() => normalizeRoutingSnapshot({})).toThrow('Routing monitor unavailable');
    expect(monitorState(null, true, Date.now()).fresh).toBe(false);
  });
  test('rejects malformed summary buckets rather than inventing a cache hit rate', () => {
    const raw = {
      version: 1,
      events: [],
      cache_summary: {
        requests: 1,
        reported_requests: 1,
        input_tokens: 100,
        read_tokens: 'unknown',
        write_tokens: 0,
      },
    };
    expect(() => normalizeRoutingSnapshot(raw)).toThrow('Routing monitor unavailable');
    expect(() =>
      normalizeRoutingSnapshot({
        ...raw,
        cache_summary: { ...raw.cache_summary, read_tokens: 101 },
      })
    ).toThrow('Routing monitor unavailable');
  });
});
