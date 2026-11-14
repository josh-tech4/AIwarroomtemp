import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh && !originalRequest.url?.includes("/auth/login")) {
        originalRequest._retry = true;
        try {
          const resp = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
            refresh,
          });
          localStorage.setItem("access_token", resp.data.access);
          if (resp.data.refresh) {
            localStorage.setItem("refresh_token", resp.data.refresh);
          }
          originalRequest.headers.Authorization = `Bearer ${resp.data.access}`;
          return apiClient(originalRequest);
        } catch {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }
      }
    }
    return Promise.reject(error);
  }
);

export function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string; details?: Record<string, unknown> }; detail?: string }
      | undefined;
    if (data?.error?.message) {
      const details = data.error.details;
      if (details && typeof details === "object") {
        const firstDetail = Object.entries(details)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
          .slice(0, 2)
          .join(" | ");
        if (firstDetail && !firstDetail.startsWith("detail:")) {
          return `${data.error.message} (${firstDetail})`;
        }
      }
      return data.error.message;
    }
    if (data?.detail) {
      return data.detail;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

