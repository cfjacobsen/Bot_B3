import { useMemo, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardHeader } from "./components/DashboardHeader";
import { Layout } from "./components/Layout";
import { MetricsGrid } from "./components/MetricsGrid";
import { PriceChart } from "./components/PriceChart";
import { OrdersTable } from "./components/OrdersTable";
import { RiskPanel } from "./components/RiskPanel";
import { AiPanel } from "./components/AiPanel";
import { StrategyPanel } from "./components/StrategyPanel";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { useDashboardData } from "./hooks/useDashboardData";
import { useDashboardSettings } from "./store/settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Dashboard() {
  const { autoRefresh } = useDashboardSettings();
  const { status, metrics, orders, market, refetchAll } = useDashboardData(autoRefresh);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refetchAll(), 10000);
    return () => clearInterval(id);
  }, [autoRefresh, refetchAll]);

  const lastCandles = market.data?.candles.slice(-60) ?? status.data?.market.candles.slice(-60) ?? [];

  return (
    <Layout
      header={<DashboardHeader status={status.data} onRefresh={refetchAll} />}
      sidebar={
        <div className="space-y-6">
          <ConnectionPanel />
          {status.data?.risk && <RiskPanel risk={status.data.risk} />}
          {status.data?.ai && <AiPanel ai={status.data.ai} />}
        </div>
      }
    >
      <MetricsGrid metrics={metrics.data} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PriceChart data={lastCandles} />
        </div>
        <StrategyPanel
          strategy={status.data?.strategy ?? { symbol: "WIN", defaultQuantity: 1 }}
          ai={status.data?.ai ?? {
            llm: { enabled: false, provider: null, cached: false, timestamp: null, lastConsensus: null },
            rl: { enabled: false, lastAction: null, confidence: null, value: null, reason: null, timestamp: null },
          }}
        />
      </div>
      <OrdersTable orders={orders.data?.orders ?? []} />
    </Layout>
  );
}

export default function App() {
  const client = useMemo(() => queryClient, []);
  return (
    <QueryClientProvider client={client}>
      <Dashboard />
    </QueryClientProvider>
  );
}
