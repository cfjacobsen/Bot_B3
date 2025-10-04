import type { AiState } from "../types/api";

interface AiPanelProps {
  ai: AiState;
}

export function AiPanel({ ai }: AiPanelProps) {
  const consensus = ai.llm.lastConsensus;
  const rl = ai.rl.lastAction;

  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 p-4 shadow-sm shadow-black/20 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-200">IA · Consenso LLM</h3>
        {ai.llm.enabled && consensus ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-100">{consensus.bias}</span>
              <span className="text-xs text-gray-400">Confiança {Math.round(consensus.confidence * 100)}%</span>
            </div>
            <p className="mt-2 text-gray-300 text-sm leading-relaxed">{consensus.rationale}</p>
            {consensus.keyLevels?.length ? (
              <ul className="mt-2 flex flex-wrap gap-2 text-xs text-gray-400">
                {consensus.keyLevels.map((level) => (
                  <li key={level} className="rounded-full bg-background/60 px-3 py-1">{level}</li>
                ))}
              </ul>
            ) : null}
            {consensus.riskNotes && (
              <p className="mt-2 text-xs text-amber-300">{consensus.riskNotes}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            Aguarde - consenso IA ainda não foi calculado ou está desabilitado.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-200">IA · Sugestão Reinforcement Learning</h3>
        {ai.rl.enabled && rl ? (
          <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{rl.action}</span>
              {rl.confidence != null && <span className="text-xs">Confiança {Math.round(rl.confidence * 100)}%</span>}
            </div>
            {rl.quantity && <p className="text-xs mt-1">Qtd sugerida: {rl.quantity}</p>}
            {rl.reason && <p className="text-xs mt-2 text-emerald-100/80">{rl.reason}</p>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-500">RL desabilitado ou sem ação recente.</p>
        )}
      </div>
    </div>
  );
}
