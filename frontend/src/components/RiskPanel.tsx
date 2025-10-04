import type { RiskSnapshot } from "../types/api";

interface RiskPanelProps {
  risk: RiskSnapshot;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value);

export function RiskPanel({ risk }: RiskPanelProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 p-4 shadow-sm shadow-black/20">
      <h3 className="text-sm font-medium text-gray-200">Gestão de Risco</h3>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-400">P&L Realizado</dt>
          <dd className={risk.realizedPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {formatCurrency(risk.realizedPnl)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">P&L Total</dt>
          <dd className={risk.totalPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {formatCurrency(risk.totalPnl)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">Exposição Líquida</dt>
          <dd className="text-gray-200 font-medium">{risk.netExposure}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Preço Médio</dt>
          <dd className="text-gray-200 font-medium">{risk.avgPrice ? risk.avgPrice.toFixed(2) : '--'}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Trades / Win rate</dt>
          <dd className="text-gray-200 font-medium">{risk.trades} · {risk.winRate.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-gray-400">Drawdown</dt>
          <dd className="text-gray-200 font-medium">{formatCurrency(risk.drawdown)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 ${risk.reachedTarget ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-gray-400'}`}>
          Meta diária {risk.reachedTarget ? 'atingida' : 'pendente'}
        </span>
        <span className={`rounded-full px-3 py-1 ${risk.hitLossLimit ? 'bg-rose-500/15 text-rose-300' : 'bg-white/5 text-gray-400'}`}>
          Loss limit {risk.hitLossLimit ? 'atingido' : 'ok'}
        </span>
      </div>
    </div>
  );
}
