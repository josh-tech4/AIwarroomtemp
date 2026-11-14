import { create } from "zustand";
import { apiClient } from "../api/client";
import type { Organization, User } from "../types/api";

interface AuthState {
  user: User | null;
  organizations: Organization[];
  activeOrgId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setTokens: (access: string, refresh: string) => void;
  setActiveOrgId: (orgId: string) => void;
  fetchSession: () => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organizations: [],
  activeOrgId: localStorage.getItem("active_org_id"),
  isAuthenticated: Boolean(localStorage.getItem("access_token")),
  isLoading: false,

  setTokens: (access, refresh) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
    set({ isAuthenticated: true });
  },

  setActiveOrgId: (orgId) => {
    localStorage.setItem("active_org_id", orgId);
    set({ activeOrgId: orgId });
  },

  fetchSession: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      set({ user: null, organizations: [], isAuthenticated: false, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      const [meResp, orgResp] = await Promise.all([
        apiClient.get<User>("/auth/me/"),
        apiClient.get<{ results: Organization[] }>("/organizations/"),
      ]);
      const orgs = orgResp.data.results || [];
      const savedOrgId = localStorage.getItem("active_org_id");
      const validSaved = orgs.find((o) => o.id === savedOrgId);
      const activeOrgId = validSaved ? validSaved.id : orgs[0]?.id ?? null;
      if (activeOrgId) {
        localStorage.setItem("active_org_id", activeOrgId);
      }
      set({
        user: meResp.data,
        organizations: orgs,
        activeOrgId,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      set({
        user: null,
        organizations: [],
        activeOrgId: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("active_org_id");
    set({ user: null, organizations: [], activeOrgId: null, isAuthenticated: false });
  },
}));

