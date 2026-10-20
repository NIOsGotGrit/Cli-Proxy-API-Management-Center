import { apiCallApi } from './apiCall';
import { isRecord } from '@/utils/helpers';

export type RouteKind =
  'direct' | 'provider_replacement' | 'model_mapping' | 'account_change' | 'failed_attempt';
export interface CacheTokens {
  total: number;
  read: number;
  write: number;
}
export interface RouteEvent {
  id: string;
  completedAt: number;
  requestedAt: number;
  provider: string;
  requestedProvider: string;
  requestedModel: string;
  actualModel: string;
  responseModel: string;
  kind: RouteKind;
  failed: boolean;
  statusCode: number;
  effort: string;
  latencyMs: number;
  sessionId: string;
  parentSessionId: string;
  traceId: string;
  account: string;
  accountId: string;
  accountChanged: boolean;
  reason: string;
  cache: CacheTokens | null;
  previousCacheHit: number | null;
  cacheDrop: boolean;
  attempts: Array<{ provider: string; model: string; statusCode: number }>;
}
export interface CacheSummary {
  requests: number;
  reportedRequests: number;
  input: number;
  read: number;
  write: number;
  groups: Array<{
    provider: string;
    model: string;
    requests: number;
    reportedRequests: number;
    input: number;
    read: number;
    write: number;
  }>;
}
export interface RoutingSnapshot {
  connected: boolean;
  serverTime: number;
  receivedAt: number;
  lastSeen: number;
  disconnections: number;
  events: RouteEvent[];
  latestServed: RouteEvent | null;
  latestReplacement: RouteEvent | null;
  cache: CacheSummary;
}
const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 254) : '');
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const kinds: RouteKind[] = [
  'direct',
  'provider_replacement',
  'model_mapping',
  'account_change',
  'failed_attempt',
];

function normalizeCache(raw: unknown): CacheTokens | null {
  if (!isRecord(raw)) return null;
  const total = raw.total_tokens;
  const read = raw.cache_read_tokens;
  const write = raw.cache_write_tokens;
  if (
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total < 0 ||
    typeof read !== 'number' ||
    !Number.isFinite(read) ||
    read < 0 ||
    typeof write !== 'number' ||
    !Number.isFinite(write) ||
    write < 0 ||
    read + write > total
  )
    return null;
  return { total, read, write };
}

function normalizeCacheSummary(raw: Record<string, unknown>) {
  const cache = normalizeCache({
    total_tokens: raw.input_tokens,
    cache_read_tokens: raw.read_tokens,
    cache_write_tokens: raw.write_tokens,
  });
  if (
    !cache ||
    typeof raw.requests !== 'number' ||
    typeof raw.reported_requests !== 'number' ||
    !Number.isSafeInteger(raw.requests) ||
    !Number.isSafeInteger(raw.reported_requests) ||
    raw.requests < 0 ||
    raw.reported_requests < 0 ||
    raw.reported_requests > raw.requests
  ) {
    throw new Error('Routing monitor unavailable');
  }
  return {
    requests: raw.requests,
    reportedRequests: raw.reported_requests,
    input: cache.total,
    read: cache.read,
    write: cache.write,
  };
}

export function normalizeRouteEvent(raw: unknown): RouteEvent | null {
  if (
    !isRecord(raw) ||
    !text(raw.id) ||
    !text(raw.actual_model) ||
    !kinds.includes(raw.kind as RouteKind)
  )
    return null;
  return {
    id: text(raw.id),
    completedAt: count(raw.completed_at),
    requestedAt: count(raw.requested_at),
    provider: text(raw.provider),
    requestedProvider: text(raw.requested_provider),
    requestedModel: text(raw.requested_model),
    actualModel: text(raw.actual_model),
    responseModel: text(raw.response_model),
    kind: raw.kind as RouteKind,
    failed: raw.failed === true,
    statusCode: count(raw.status_code),
    effort: text(raw.effort),
    latencyMs: count(raw.latency_ms),
    sessionId: text(raw.session_id),
    parentSessionId: text(raw.parent_session_id),
    traceId: text(raw.trace_id),
    account: text(raw.account),
    accountId: text(raw.account_id),
    accountChanged: raw.account_changed === true,
    reason: text(raw.reason),
    cache: normalizeCache(raw.cache),
    previousCacheHit:
      typeof raw.previous_cache_hit === 'number' &&
      raw.previous_cache_hit >= 0 &&
      raw.previous_cache_hit <= 100
        ? raw.previous_cache_hit
        : null,
    cacheDrop: raw.cache_drop === true,
    attempts: Array.isArray(raw.attempts)
      ? raw.attempts
          .slice(0, 20)
          .filter(isRecord)
          .map((attempt) => ({
            provider: text(attempt.provider),
            model: text(attempt.model),
            statusCode: count(attempt.status_code),
          }))
      : [],
  };
}

export function normalizeRoutingSnapshot(raw: unknown): RoutingSnapshot {
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.events) ||
    !isRecord(raw.cache_summary)
  )
    throw new Error('Routing monitor unavailable');
  const summary = raw.cache_summary;
  return {
    connected: raw.connected === true,
    serverTime: count(raw.server_time),
    receivedAt: Date.now(),
    lastSeen: count(raw.last_seen),
    disconnections: count(raw.disconnections),
    events: raw.events
      .slice(0, 200)
      .map(normalizeRouteEvent)
      .filter((event): event is RouteEvent => event !== null),
    latestServed: normalizeRouteEvent(raw.latest_served),
    latestReplacement: normalizeRouteEvent(raw.latest_replacement),
    cache: {
      ...normalizeCacheSummary(summary),
      groups: Array.isArray(summary.groups)
        ? summary.groups
            .slice(0, 100)
            .filter(isRecord)
            .map((group) => ({
              provider: text(group.provider),
              model: text(group.model),
              ...normalizeCacheSummary(group),
            }))
        : [],
    },
  };
}

export const routingMonitorApi = {
  async snapshot(): Promise<RoutingSnapshot> {
    // Internal Docker service. The existing management API authenticates and proxies this read.
    const result = await apiCallApi.request({
      method: 'GET',
      url: 'http://fleet-routing-monitor:8787/events',
      proxy_url: 'direct',
    });
    if (result.statusCode !== 200) throw new Error('Routing monitor unavailable');
    return normalizeRoutingSnapshot(result.body);
  },
};
