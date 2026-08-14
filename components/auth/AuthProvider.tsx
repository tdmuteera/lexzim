"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { ClientAuthSession } from "@/lib/rbac/permissions";
import { hasAllPermissions, hasAnyPermission, hasPermission } from "@/lib/rbac/permissions";
import { useAuthStore } from "@/lib/store";

type AuthContextValue = {
  user: ClientAuthSession | null;
  isLoading: boolean;
  can: (code: string) => boolean;
  canAny: (codes: string[]) => boolean;
  canAll: (codes: string[]) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<ClientAuthSession | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Failed to load session");
  const body = (await res.json()) as { ok: boolean; data?: { user: ClientAuthSession } };
  return body.data?.user ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setSession = useAuthStore((s) => s.setSession);
  const setLoading = useAuthStore((s) => s.setLoading);

  const refresh = useCallback(async () => {
    const hadSession = useAuthStore.getState().session != null;
    // Keep chrome interactive while refreshing an existing session.
    if (!hadSession) setLoading(true);
    try {
      const user = await fetchSession();
      setSession(user);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [setSession, setLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const can = useCallback((code: string) => hasPermission(session, code), [session]);
  const canAny = useCallback((codes: string[]) => hasAnyPermission(session, codes), [session]);
  const canAll = useCallback((codes: string[]) => hasAllPermissions(session, codes), [session]);

  const value = useMemo(
    () => ({ user: session, isLoading, can, canAny, canAll, refresh }),
    [session, isLoading, can, canAny, canAll, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function usePermission(code: string): boolean {
  const { can, isLoading } = useAuth();
  if (isLoading) return false;
  return can(code);
}
