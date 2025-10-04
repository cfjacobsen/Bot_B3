import axios from "axios";

const deriveBaseUrl = () => {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl) return envUrl;
  const stored = window.localStorage.getItem("backend_url");
  if (stored) return stored;
  try {
    const url = new URL(window.location.href);
    if (url.port) {
      return `${url.protocol}//${url.hostname}:3001`;
    }
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "http://127.0.0.1:3001";
  }
};

export const apiClient = axios.create({
  baseURL: deriveBaseUrl(),
  timeout: 5000,
});

export const fetcher = async <T>(url: string): Promise<T> => {
  const response = await apiClient.get<T>(url);
  return response.data;
};
