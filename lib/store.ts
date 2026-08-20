"use client";

import { create } from "zustand";
import type { ClientAuthSession } from "@/lib/rbac/permissions";
import { initialsFromName } from "@/lib/utils/name";

/** Compact display shape for shell chrome (topbar). */
export type TopbarUser = {
  id: string;
  fullName: string;
  email: string;
  roleName: string;
  initials: string;
  firmName: string;
};

export function toTopbarUser(session: ClientAuthSession): TopbarUser {
  return {
    id: session.id,
    fullName: session.fullName,
    email: session.email,
    roleName: session.jobTitle?.trim() || session.role.name,
    initials: initialsFromName(session.fullName),
    firmName: session.firm.name,
  };
}

type UiState = {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  toggleSidebarCollapsed: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setMobileNavOpen: (value: boolean) => void;
  toggleMobileNav: () => void;
};

type AuthState = {
  session: ClientAuthSession | null;
  isLoading: boolean;
  setSession: (session: ClientAuthSession | null) => void;
  setLoading: (value: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  toggleSidebarCollapsed: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
}));

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
}));
