import { FormEvent, useState } from "react";
import { useDashboardSettings } from "../store/settings";

export function ConnectionPanel() {
  const { backendUrl, setBackendUrl, autoRefresh, toggleAutoRefresh } = useDashboardSettings();
  const [value, setValue] = useState(backendUrl || "");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setBackendUrl(value);
  };

  return (
    <div className="rounded-xl border border-white/5 bg-surface/80 p-4 shadow-sm shadow-black/20 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-200">Conexão Backend</h3>
        <p className="mt-1 text-xs text-gray-500">Defina manualmente a URL do backend se estiver usando preview/Live Share.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm text-gray-100 focus:border-accent focus:outline-none"
          placeholder="http://127.0.0.1:3001"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-accent/80 px-3 py-2 text-sm font-semibold text-background hover:bg-accent"
        >
          Aplicar URL
        </button>
      </form>
      <div className="flex items-center justify-between text-sm text-gray-300">
        <span>Auto refresh</span>
        <button
          type="button"
          onClick={toggleAutoRefresh}
          className={`relative inline-flex h-6 w-11 items-center rounded-full ${autoRefresh ? 'bg-emerald-500/80' : 'bg-white/10'}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${autoRefresh ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
      </div>
    </div>
  );
}
