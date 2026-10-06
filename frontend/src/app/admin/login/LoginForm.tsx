"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { Field, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { Alert } from "@/components/ui/Alert";
import { adminApi, toAdminApiError } from "@/lib/admin/api";
import { adminErrorMessage } from "@/lib/admin/errors";
import { formatDuration } from "@/lib/admin/format";
import { safeNextPath } from "@/lib/admin/redirect";
import type { LoginIn, UserEnvelope } from "@/lib/admin/types";
import { normalizeTotpInput, TOTP_LENGTH } from "@/lib/admin/totp";

type Step = "credentials" | "mfa";

interface FormError {
  message: string;
  /** Epoch ms until which submitting is blocked (429). */
  retryUntil?: number;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [now, setNow] = useState(0);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Rate limit countdown.
  const retryUntil = error?.retryUntil ?? 0;
  useEffect(() => {
    if (!retryUntil) return;
    const id = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [retryUntil]);
  const waitSeconds = retryUntil ? Math.max(0, Math.ceil((retryUntil - now) / 1000)) : 0;
  const blocked = waitSeconds > 0;

  useEffect(() => {
    if (step === "mfa") codeRef.current?.focus();
  }, [step]);

  const submit = async (totp?: string) => {
    if (pending || blocked) return;
    setPending(true);
    setError(null);
    const body: LoginIn = { email: email.trim(), password };
    if (totp) body.totp_code = totp;
    try {
      await adminApi.post<UserEnvelope>("/auth/login", body, { redirectOn401: false });
      setRedirecting(true);
      router.replace(next);
    } catch (err) {
      const apiError = toAdminApiError(err);
      setPending(false);
      if (apiError.code === "mfa_required") {
        setStep("mfa");
        setCode("");
        return;
      }
      if (apiError.isRateLimited) {
        const seconds = apiError.retryAfterSeconds ?? 60;
        const start = Date.now();
        setNow(start);
        setError({ message: "Too many sign-in attempts.", retryUntil: start + seconds * 1000 });
        return;
      }
      setError({ message: adminErrorMessage(apiError) });
      if (apiError.code === "invalid_mfa_code") {
        setCode("");
        codeRef.current?.focus();
      } else if (apiError.code === "invalid_credentials") {
        if (step === "mfa") setStep("credentials");
        setPassword("");
        passwordRef.current?.focus();
      }
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === "credentials") {
      if (!email.trim()) {
        setError({ message: "Enter your email address." });
        emailRef.current?.focus();
        return;
      }
      if (!password) {
        setError({ message: "Enter your password." });
        passwordRef.current?.focus();
        return;
      }
      void submit();
    } else {
      if (code.length !== TOTP_LENGTH) {
        setError({ message: `Enter the ${TOTP_LENGTH}-digit code from your authenticator app.` });
        codeRef.current?.focus();
        return;
      }
      void submit(code);
    }
  };

  const busy = pending || redirecting;

  return (
    <div className="w-full max-w-sm">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-card sm:p-8">
        {step === "credentials" ? (
          <>
            <p className="eyebrow">Dashboard</p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-ink-soft">Use your Zodiac Blend admin account.</p>
          </>
        ) : (
          <>
            <span className="flex size-11 items-center justify-center rounded-full bg-gold-pale/70 text-gold-deep ring-1 ring-gold/25">
              <Icon name="shield" className="size-5" />
            </span>
            <h1 className="mt-4 font-serif text-3xl font-semibold text-ink">Two-factor check</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Enter the {TOTP_LENGTH}-digit code from your authenticator app for{" "}
              <span className="font-medium text-ink" dir="ltr">
                {email}
              </span>
              .
            </p>
          </>
        )}

        {/* method="post": even if submitted before hydration, credentials never land in the URL. */}
        <form
          method="post"
          className="mt-6 space-y-4"
          onSubmit={onSubmit}
          noValidate
          aria-busy={busy || undefined}
        >
          {error ? (
            <Alert tone="error" title={error.message}>
              {error.retryUntil
                ? blocked
                  ? `Try again in ${formatDuration(waitSeconds)}.`
                  : "You can try again now."
                : null}
            </Alert>
          ) : null}

          {step === "credentials" ? (
            <>
              <Field label="Email">
                <TextInput
                  ref={emailRef}
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  autoFocus
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    // The email throttle is per address: another address may sign in.
                    if (error?.retryUntil) setError(null);
                  }}
                  disabled={busy}
                  required
                  className="h-11"
                />
              </Field>
              <Field label="Password">
                <div className="relative">
                  <TextInput
                    ref={passwordRef}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    dir="ltr"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={busy}
                    required
                    className="h-11 pe-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-pressed={showPassword}
                    className="absolute end-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-ink"
                  >
                    <Icon name={showPassword ? "lock" : "eye"} className="size-4" />
                    <span className="sr-only">
                      {showPassword ? "Hide password" : "Show password"}
                    </span>
                  </button>
                </div>
              </Field>
            </>
          ) : (
            <Field label="Authentication code" hint="Codes change every 30 seconds.">
              <TextInput
                ref={codeRef}
                name="totp_code"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={TOTP_LENGTH}
                dir="ltr"
                value={code}
                disabled={busy}
                onChange={(event) => {
                  const digits = normalizeTotpInput(event.target.value);
                  setCode(digits);
                  if (digits.length === TOTP_LENGTH && !pending && !blocked) void submit(digits);
                }}
                className="h-12 text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
                placeholder="••••••"
                required
              />
            </Field>
          )}

          <AdminButton
            type="submit"
            variant="gold"
            fullWidth
            loading={busy}
            disabled={blocked}
            className="h-11 text-[0.95rem]"
          >
            {redirecting
              ? "Opening dashboard…"
              : step === "credentials"
                ? "Sign in"
                : "Verify and sign in"}
          </AdminButton>

          {step === "mfa" ? (
            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setPassword("");
                setError(null);
              }}
              className="mx-auto flex items-center gap-1 rounded text-sm text-ink-soft hover:text-ink"
            >
              <Icon name="chevronLeft" className="size-4 rtl:-scale-x-100" />
              Use a different account
            </button>
          ) : null}
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-ink-soft">
        Lost access to your authenticator? Ask an owner to reset two-factor for your account.
      </p>
    </div>
  );
}
