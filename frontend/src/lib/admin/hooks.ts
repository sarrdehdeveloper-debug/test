"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Query } from "@/lib/api/shared";
import { adminApi, adminPath, isAbortError, toAdminApiError, type AdminApiError } from "./api";
import { adminErrorMessage, adminFieldErrors } from "./errors";
import { toast } from "./toast";
import type { Locale } from "./types";

/* ================================================================== useAdminQuery */

export interface AdminQueryOptions {
  /** Query string; changing it refetches (the previous data stays visible meanwhile). */
  query?: Query;
  /** Default true. `false` (or a `null` path) pauses the query. */
  enabled?: boolean;
  /** Poll every N ms while the tab is visible (0 = off). */
  refreshInterval?: number;
  /** Keep showing the previous data while a new path/query loads (default true: no layout shift). */
  keepPreviousData?: boolean;
  /** Default true: a 401 redirects to the login page. */
  redirectOn401?: boolean;
}

export interface AdminQueryResult<T> {
  /** Latest data (possibly from the previous path/query while `isPlaceholder`). */
  data: T | undefined;
  /** Error of the latest request (null while a new request is in flight). */
  error: AdminApiError | null;
  /** First load: no data yet and a request in flight → show a skeleton. */
  loading: boolean;
  /** Any request in flight (first load, refetch, new query, polling). */
  fetching: boolean;
  /** `data` belongs to a previous path/query (a new one is loading). */
  isPlaceholder: boolean;
  /** Refetch; resolves when the new response (or error) has been stored. */
  refetch: () => Promise<void>;
  /** Epoch ms of the last successful response (for "Updated 14:05"). */
  updatedAt: number | null;
  /** Replace the cached data locally (e.g. after a mutation returned the updated row). */
  setData: (updater: T | ((previous: T | undefined) => T | undefined)) => void;
}

interface QueryState<T> {
  key: string | null;
  url: string | null;
  data: T | undefined;
  error: AdminApiError | null;
  updatedAt: number | null;
}

/**
 * GET an admin endpoint with loading / error / refetch (no external library).
 *
 *   const { data, loading, error, refetch } = useAdminQuery<AdminPage<AdminOrderItem>>("/orders", {
 *     query: { page, status: status || undefined },
 *   });
 *   if (loading) return <DataTable loading … />;
 *   if (error) return <QueryError error={error} onRetry={refetch} />;
 */
export function useAdminQuery<T>(
  path: string | null,
  options: AdminQueryOptions = {},
): AdminQueryResult<T> {
  const {
    query,
    enabled = true,
    refreshInterval = 0,
    keepPreviousData = true,
    redirectOn401,
  } = options;
  const url = enabled && path ? adminPath(path, query) : null;
  const [nonce, setNonce] = useState(0);
  const requestKey = url ? `${url}#${nonce}` : null;
  const [state, setState] = useState<QueryState<T>>({
    key: null,
    url: null,
    data: undefined,
    error: null,
    updatedAt: null,
  });
  const waiters = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!requestKey || !url) return;
    const controller = new AbortController();
    const settle = () => {
      const pending = waiters.current;
      waiters.current = [];
      pending.forEach((resolve) => resolve());
    };
    adminApi.get<T>(url, { signal: controller.signal, redirectOn401 }).then(
      (data) => {
        setState({ key: requestKey, url, data, error: null, updatedAt: Date.now() });
        settle();
      },
      (err: unknown) => {
        if (isAbortError(err)) return;
        setState((prev) => ({
          key: requestKey,
          url,
          data: prev.url === url ? prev.data : undefined,
          error: toAdminApiError(err),
          updatedAt: prev.url === url ? prev.updatedAt : null,
        }));
        settle();
      },
    );
    return () => controller.abort();
  }, [requestKey, url, redirectOn401]);

  useEffect(() => {
    if (!url || refreshInterval <= 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNonce((n) => n + 1);
    }, refreshInterval);
    return () => window.clearInterval(id);
  }, [url, refreshInterval]);

  const refetch = useCallback(() => {
    if (!url) return Promise.resolve();
    return new Promise<void>((resolve) => {
      waiters.current.push(resolve);
      setNonce((n) => n + 1);
    });
  }, [url]);

  const setData = useCallback((updater: T | ((previous: T | undefined) => T | undefined)) => {
    setState((prev) => ({
      ...prev,
      data:
        typeof updater === "function"
          ? (updater as (previous: T | undefined) => T | undefined)(prev.data)
          : updater,
    }));
  }, []);

  const sameUrl = url !== null && state.url === url;
  const data = url === null ? undefined : sameUrl || keepPreviousData ? state.data : undefined;
  const fetching = requestKey !== null && state.key !== requestKey;
  return {
    data,
    error: requestKey !== null && state.key === requestKey ? state.error : null,
    loading: fetching && data === undefined,
    fetching,
    isPlaceholder: !sameUrl && data !== undefined,
    updatedAt: sameUrl ? state.updatedAt : null,
    refetch,
    setData,
  };
}

/* ================================================================== useAdminMutation */

export interface AdminMutationOptions<TData, TVars> {
  /** Toast on success (string or builder; return null for no toast). */
  successMessage?: string | ((data: TData, vars: TVars) => string | null);
  /**
   * Toast on error: default = `adminErrorMessage(error)`; `false` = never toast (show errors inline).
   * A function may return a string, `null` (no toast for this error) or `undefined` (default text).
   */
  errorMessage?:
    string | false | ((error: AdminApiError, vars: TVars) => string | null | undefined);
  onSuccess?: (data: TData, vars: TVars) => void | Promise<void>;
  onError?: (error: AdminApiError, vars: TVars) => void;
}

export interface AdminMutationResult<TData, TVars> {
  /** Runs the mutation; resolves with the data, or `undefined` on error (never throws). */
  mutate: (vars: TVars) => Promise<TData | undefined>;
  /** Like `mutate` but rejects with the AdminApiError. */
  mutateAsync: (vars: TVars) => Promise<TData>;
  pending: boolean;
  error: AdminApiError | null;
  /** `{field: message}` of a 422 (dotted paths as sent by the API). */
  fieldErrors: Record<string, string>;
  data: TData | undefined;
  reset: () => void;
}

/**
 * Wrap a write call with pending/error state and toasts.
 *
 *   const save = useAdminMutation(
 *     (body: OfferUpdate) => adminApi.patch<OfferAdmin>(`/offers/${id}`, body),
 *     { successMessage: "Offer saved", onSuccess: (offer) => query.setData(offer) },
 *   );
 *   <AdminButton loading={save.pending} onClick={() => save.mutate(changes)}>Save</AdminButton>
 *
 * A 401 never toasts (the session redirect takes over).
 */
export function useAdminMutation<TData, TVars = void>(
  mutationFn: (vars: TVars) => Promise<TData>,
  options: AdminMutationOptions<TData, TVars> = {},
): AdminMutationResult<TData, TVars> {
  const [state, setState] = useState<{
    pending: boolean;
    error: AdminApiError | null;
    data: TData | undefined;
  }>({ pending: false, error: null, data: undefined });
  const fnRef = useRef(mutationFn);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    fnRef.current = mutationFn;
    optionsRef.current = options;
  });

  const mutateAsync = useCallback(async (vars: TVars): Promise<TData> => {
    setState((s) => ({ ...s, pending: true, error: null }));
    try {
      const data = await fnRef.current(vars);
      setState({ pending: false, error: null, data });
      const { successMessage, onSuccess } = optionsRef.current;
      const message =
        typeof successMessage === "function" ? successMessage(data, vars) : successMessage;
      if (message) toast.success(message);
      await onSuccess?.(data, vars);
      return data;
    } catch (err) {
      if (isAbortError(err)) {
        setState((s) => ({ ...s, pending: false }));
        throw err;
      }
      const error = toAdminApiError(err);
      setState({ pending: false, error, data: undefined });
      const { errorMessage, onError } = optionsRef.current;
      if (!error.isUnauthorized && errorMessage !== false) {
        const custom =
          typeof errorMessage === "function" ? errorMessage(error, vars) : errorMessage;
        const message = custom === undefined ? adminErrorMessage(error) : custom;
        if (message) toast.error(message);
      }
      onError?.(error, vars);
      throw error;
    }
  }, []);

  const mutate = useCallback(
    (vars: TVars) => mutateAsync(vars).catch(() => undefined),
    [mutateAsync],
  );
  const reset = useCallback(() => setState({ pending: false, error: null, data: undefined }), []);
  const fieldErrors = useMemo(
    () => (state.error ? adminFieldErrors(state.error) : {}),
    [state.error],
  );

  return { mutate, mutateAsync, reset, fieldErrors, ...state };
}

/* ================================================================== small utilities */

/** `value`, updated only after it stopped changing for `delay` ms (search inputs, previews). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Read/write URL query parameters (filters, page) of the current dashboard page:
 *
 *   const [params, setParams] = useUrlParams();
 *   const page = Number(params.get("page") ?? 1);
 *   setParams({ status: "ready", page: null }); // null/"" removes a key; history entry replaced
 *
 * Uses `useSearchParams`: AdminShell wraps every page in <Suspense>, so no extra boundary is needed.
 */
export function useUrlParams(): [
  URLSearchParams,
  (changes: Record<string, string | number | null | undefined>) => void,
] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const setParams = useCallback(
    (changes: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  return [params, setParams];
}

/* ================================================================== public config (locales) */

interface LocalesInfo {
  locales: Locale[];
  defaultLocale: Locale;
}

const FALLBACK_LOCALES: LocalesInfo = { locales: ["en", "ar"], defaultLocale: "en" };
let localesCache: LocalesInfo | null = null;
let localesPromise: Promise<LocalesInfo> | null = null;

function loadLocales(): Promise<LocalesInfo> {
  localesPromise ??= adminApi
    .get<{ locales?: string[]; default_locale?: string }>("/api/v1/public-config")
    .then((config) => {
      const locales = config.locales?.length ? config.locales : FALLBACK_LOCALES.locales;
      const defaultLocale =
        config.default_locale && locales.includes(config.default_locale)
          ? config.default_locale
          : locales[0];
      localesCache = { locales, defaultLocale };
      return localesCache;
    })
    .catch(() => {
      localesPromise = null; // retry on the next mount
      return FALLBACK_LOCALES;
    });
  return localesPromise;
}

/**
 * Content locales from `GET /public-config` (`["en","ar"]`, default `en`), loaded once per page
 * load. Returns the fallback immediately, so tabs render without layout shift.
 */
export function useAdminLocales(): LocalesInfo {
  const [info, setInfo] = useState<LocalesInfo>(localesCache ?? FALLBACK_LOCALES);
  useEffect(() => {
    if (localesCache) return;
    let active = true;
    loadLocales().then((loaded) => {
      if (active) setInfo(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  return info;
}
