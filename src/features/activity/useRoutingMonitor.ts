import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/services/api/client';
import { routingMonitorApi, type RoutingSnapshot } from '@/services/api/routingMonitor';
import { useInterval } from '@/hooks/useInterval';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';

export function useRoutingMonitor() {
  const apiBase = useAuthStore((state) => state.apiBase);
  const key = useAuthStore((state) => state.managementKey);
  const connected = useAuthStore((state) => state.connectionStatus) === 'connected';
  const layer = usePageTransitionLayer();
  const enabled = connected && (!layer || layer.isCurrentLayer);
  const revision = apiClient.getConnectionRevision();
  const [state, setState] = useState<{
    revision: number;
    data: RoutingSnapshot | null;
    error: boolean;
  }>({ revision, data: null, error: false });
  const request = useRef<{ revision: number; pending: Promise<void> } | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled || !apiBase || !key) return;
    const scope = apiClient.getConnectionRevision();
    if (request.current?.revision === scope) return request.current.pending;
    const pending = routingMonitorApi
      .snapshot()
      .then((data) => {
        if (mounted.current && apiClient.getConnectionRevision() === scope)
          setState({ revision: scope, data, error: false });
      })
      .catch(() => {
        if (mounted.current && apiClient.getConnectionRevision() === scope)
          setState((previous) => ({
            revision: scope,
            data: previous.revision === scope ? previous.data : null,
            error: true,
          }));
      })
      .finally(() => {
        if (request.current?.pending === pending) request.current = null;
      });
    request.current = { revision: scope, pending };
    return pending;
  }, [apiBase, key, enabled]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  useInterval(
    () => {
      if (document.visibilityState === 'visible') void refresh();
    },
    enabled ? 5000 : null
  );
  const current = state.revision === revision ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? false, refresh };
}
