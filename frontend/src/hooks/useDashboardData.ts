import { useQuery, useQueryClient, QueryObserverOptions } from "@tanstack/react-query";
import { fetcher } from "../api/client";
import type { SystemStatus, MetricsSummary, OrdersResponse, MarketResponse } from "../types/api";

const SYSTEM_STATUS_KEY = ["system-status"];
const METRICS_KEY = ["system-metrics"];
const ORDERS_KEY = ["orders"];
const MARKET_KEY = ["market-snapshot"];

type IntervalOption<T> = QueryObserverOptions<T>["refetchInterval"];

const refreshInterval = (enabled: boolean, value: number): IntervalOption<unknown> => (enabled ? value : false);

export const useSystemStatus = (autoRefresh: boolean) =>
  useQuery<SystemStatus>({
    queryKey: SYSTEM_STATUS_KEY,
    queryFn: () => fetcher<SystemStatus>("/api/system/status"),
    refetchInterval: refreshInterval(autoRefresh, 5000),
  });

export const useMetrics = (autoRefresh: boolean) =>
  useQuery<MetricsSummary>({
    queryKey: METRICS_KEY,
    queryFn: () => fetcher<MetricsSummary>("/api/system/metrics"),
    refetchInterval: refreshInterval(autoRefresh, 5000),
  });

export const useOrders = (autoRefresh: boolean, limit = 20) =>
  useQuery<OrdersResponse>({
    queryKey: [...ORDERS_KEY, limit],
    queryFn: () => fetcher<OrdersResponse>(`/api/execution/orders?limit=${limit}`),
    refetchInterval: refreshInterval(autoRefresh, 5000),
  });

export const useMarketSnapshot = (autoRefresh: boolean) =>
  useQuery<MarketResponse>({
    queryKey: MARKET_KEY,
    queryFn: () => fetcher<MarketResponse>("/api/market/snapshot"),
    refetchInterval: refreshInterval(autoRefresh, 1500),
  });

export const useDashboardData = (autoRefresh: boolean) => {
  const queryClient = useQueryClient();
  const status = useSystemStatus(autoRefresh);
  const metrics = useMetrics(autoRefresh);
  const orders = useOrders(autoRefresh);
  const market = useMarketSnapshot(autoRefresh);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: SYSTEM_STATUS_KEY });
    queryClient.invalidateQueries({ queryKey: METRICS_KEY });
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
    queryClient.invalidateQueries({ queryKey: MARKET_KEY });
  };

  return {
    status,
    metrics,
    orders,
    market,
    refetchAll,
  };
};
