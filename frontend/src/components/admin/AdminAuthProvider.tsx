"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  adminApi,
  setUnauthorizedHandler,
  toAdminApiError,
  type AdminApiError,
} from "@/lib/admin/api";
import { ADMIN_LOGIN, loginHref } from "@/lib/admin/redirect";
import { hasRole, type AccessLevel } from "@/lib/admin/roles";
import { clearToasts, toast } from "@/lib/admin/toast";
import type { AdminUser, UserEnvelope } from "@/lib/admin/types";
import { ForbiddenState } from "./QueryState";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AdminAuthContextValue {
  /** The signed-in admin (null until loaded / when signed out). */
  user: AdminUser | null;
  status: AdminAuthStatus;
  /** Why `/auth/me` failed when `status === "error"` (network, 5xx). */
  error: AdminApiError | null;
  /** Reload `/auth/me` (e.g. after an account change). */
  refresh: () => Promise<AdminUser | null>;
  /** Replace the user locally with a fresh `AdminUser` returned by the API (MFA enable/disable). */
  setUser: (user: AdminUser) => void;
  /** `POST /auth/logout`, then go to the login page. */
  logout: () => Promise<void>;
  /** Role check: `can("manager")`, `can("owner")`, `can("editor")`. */
  can: (required: AccessLevel) => boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

interface AuthState {
  status: AdminAuthStatus;
  user: AdminUser | null;
  error: AdminApiError | null;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Loads `GET /api/v1/admin/auth/me` once for the dashboard and provides the user, a role check and
 * logout. A 401 (on load or from any later admin request) redirects to `/admin/login?next=<path>`.
 * Mounted by `src/app/admin/(dashboard)/layout.tsx`; read it with `useAdminAuth()`.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, error: null });

  const redirectToLogin = useCallback(() => {
    router.replace(loginHref(currentPath()));
  }, [router]);

  const onMeError = useCallback(
    (err: unknown) => {
      const error = toAdminApiError(err);
      if (error.isUnauthorized) {
        setState({ status: "unauthenticated", user: null, error: null });
        redirectToLogin();
      } else {
        setState((prev) => ({ status: prev.user ? prev.status : "error", user: prev.user, error }));
      }
    },
    [redirectToLogin],
  );

  const fetchMe = useCallback(
    (signal?: AbortSignal): Promise<AdminUser | null> =>
      adminApi.get<UserEnvelope>("/auth/me", { signal, redirectOn401: false }).then(
        ({ user }) => {
          setState({ status: "authenticated", user, error: null });
          return user;
        },
        (err: unknown) => {
          if (!signal?.aborted) onMeError(err);
          return null;
        },
      ),
    [onMeError],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal);
    return () => controller.abort();
  }, [fetchMe]);

  // Session expired while working: any admin request answering 401 sends the user to the login page.
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        setState({ status: "unauthenticated", user: null, error: null });
        toast.info("Your session has expired. Please sign in again.");
        redirectToLogin();
      }),
    [redirectToLogin],
  );

  const refresh = useCallback(() => fetchMe(), [fetchMe]);
  const setUser = useCallback(
    (user: AdminUser) => setState({ status: "authenticated", user, error: null }),
    [],
  );

  const logout = useCallback(async () => {
    try {
      await adminApi.post("/auth/logout", undefined, { redirectOn401: false });
      clearToasts();
      toast.success("You have been signed out.");
    } catch {
      // Already signed out or the server is unreachable: the login page is still the right place.
    }
    setState({ status: "unauthenticated", user: null, error: null });
    router.replace(ADMIN_LOGIN);
  }, [router]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      user: state.user,
      status: state.status,
      error: state.error,
      refresh,
      setUser,
      logout,
      can: (required) => hasRole(state.user?.role, required),
    }),
    [state, refresh, setUser, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/** The auth context of the dashboard (throws outside AdminAuthProvider). */
export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used inside <AdminAuthProvider>");
  return context;
}

/**
 * Render `children` only for users with at least `role`; others see the "no permission" state (or
 * `fallback`). Pages listed in the nav are already guarded by AdminShell; use this for parts of a
 * page (e.g. an owner-only button: `fallback={null}`).
 */
export function RequireRole({
  role,
  children,
  fallback,
}: {
  role: AccessLevel;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = useAdminAuth();
  if (!can(role)) return fallback === undefined ? <ForbiddenState /> : <>{fallback}</>;
  return <>{children}</>;
}
