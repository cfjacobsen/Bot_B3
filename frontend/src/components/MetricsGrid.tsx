import { MetricCard } from "./MetricCard";
import type { MetricsSummary } from "../types/api";

interface MetricsGridProps {
  metrics?: MetricsSummary;
  riskLabel?: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);

export function MetricsGrid({ metrics }: MetricsGridProps) {
  if (!metrics) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, index) => (
          <div key={index} className="h-24 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="P&L diário"
        value={formatCurrency(metrics.dailyPnl)}
        tone={metrics.dailyPnl >= 0 ? "success" : "danger"}
        sublabel={`Atualizado ${new Date(metrics.updatedAt).toLocaleTimeString('pt-BR')}`}
      />
      <MetricCard
        label="Trades no dia"
        value={metrics.trades.toString()}
        sublabel={`Win rate ${metrics.winRate.toFixed(1)}%`}
      />
      <MetricCard
        label="Em Execução"
        value={metrics.running ? "Ativo" : metrics.paused ? "Pausado" : "Parado"}
        tone={metrics.running ? 'success' : metrics.paused ? 'warning' : 'danger'}
        sublabel={`Fila de ordens ${metrics.ordersInQueue}`}
      />
      <MetricCard
        label="Drawdown"
        value={formatCurrency(metrics.risk.drawdown)}
        tone={metrics.risk.reachedTarget ? 'success' : metrics.risk.hitLossLimit ? 'danger' : 'neutral'}
        sublabel={metrics.risk.reachedTarget ? 'Meta diária atingida' : metrics.risk.hitLossLimit ? 'Stop diário ativado' : 'Dentro do plano'}
      />
    </div>
  );
}
