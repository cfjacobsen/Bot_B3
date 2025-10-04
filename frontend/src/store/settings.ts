import { create } from "zustand";

type Theme = "dark" | "light";

interface DashboardSettings {
  theme: Theme;
  autoRefresh: boolean;
  backendUrl: string | null;
  setTheme: (theme: Theme) => void;
  toggleAutoRefresh: () => void;
  setBackendUrl: (url: string) => void;
}

const initialBackendUrl = window.localStorage.getItem("backend_url") || "";

export const useDashboardSettings = create<DashboardSettings>((set) => ({
  theme: "dark",
  autoRefresh: true,
  backendUrl: initialBackendUrl,
  setTheme: (theme) => set({ theme }),
  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
  setBackendUrl: (url) => {
    window.localStorage.setItem("backend_url", url);
    set({ backendUrl: url });
  },
}));
