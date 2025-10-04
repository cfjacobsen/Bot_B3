import { clsx } from "clsx";
import { ArrowPathIcon, PauseCircleIcon, PlayCircleIcon } from "@heroicons/react/24/outline";
import type { SystemStatus } from "../types/api";

interface HeaderProps {
  status?: SystemStatus;
  onRefresh(): void;
}

const statusColors: Record<string, string> = {
  running: "bg-green-500/10 text-green-400 border border-green-400/30",
  paused: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
  stopped: "bg-red-500/10 text-red-400 border border-red-500/30",
};

const statusLabels: Record<string, { label: string; Icon: typeof PlayCircleIcon }> = {
  running: { label: "Executando", Icon: PlayCircleIcon },
  paused: { label: "Pausado", Icon: PauseCircleIcon },
  stopped: { label: "Parado", Icon: PauseCircleIcon },
};

export function DashboardHeader({ status, onRefresh }: HeaderProps) {
  const state = status?.running ? "running" : status?.paused ? "paused" : "stopped";
  const { label, Icon } = statusLabels[state];

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-white">Bot B3 · Painel Executivo</h1>
        <p className="text-sm text-gray-400 mt-1">
          Monitoramento em tempo real do motor de trading, risco, IA e operações do mini-índice.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className={clsx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm", statusColors[state])}>
            <Icon className="h-4 w-4" /> {label}
          </span>
          <span className="text-xs text-gray-400">Atualizado em {status?.market?.lastUpdate ?? "--"}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg bg-surface/80 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-surface"
        >
          <ArrowPathIcon className="h-4 w-4" /> Atualizar agora
        </button>
      </div>
    </header>
  );
}
