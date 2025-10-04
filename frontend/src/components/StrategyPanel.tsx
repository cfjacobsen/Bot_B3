import type { StrategyStatus, AiState } from "../types/api";

interface StrategyPanelProps {
  strategy: StrategyStatus;
  ai: AiState;
}

export function StrategyPanel({ strategy, ai }: StrategyPanelProps) {
  const signal = strategy.lastSignal;
  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 p-4 shadow-sm shadow-black/20 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Estratégia Ativa · {strategy.symbol}</h3>
        <span className="text-xs text-gray-500">Qtd base {strategy.defaultQuantity}</span>
      </div>
      {signal ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-gray-200">
          <div className="flex items-center justify-between">
            <span className="font-semibold">{signal.action}</span>
            <span className="text-xs text-gray-400">Confiança {(signal.confidence * 100).toFixed(0)}%</span>
          </div>
          <p className="mt-2 text-gray-300 text-xs leading-relaxed">{signal.reason}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Nenhum sinal processado ainda.</p>
      )}
      <div className="grid grid-cols-2 gap-3 text-xs text-gray-400">
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-gray-500">IA LLM</p>
          <p className="text-gray-200 mt-1">{ai.llm.enabled ? ai.llm.provider ?? 'Ativo' : 'Desabilitado'}</p>
        </div>
        <div className="rounded-lg bg-white/5 px-3 py-2">
          <p className="text-gray-500">Ia RL</p>
          <p className="text-gray-200 mt-1">{ai.rl.enabled ? ai.rl.lastAction?.action ?? 'Sem ação' : 'Desabilitado'}</p>
        </div>
      </div>
    </div>
  );
}
