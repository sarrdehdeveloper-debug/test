"use client";

import { useReducer, useRef, useState, type FormEvent, type Ref } from "react";
import { useAdminAuth } from "@/components/admin/AdminAuthProvider";
import { AdminButton, AdminButtonLink } from "@/components/admin/AdminButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { Field, TextInput } from "@/components/admin/form";
import { FormSection } from "@/components/admin/FormSection";
import { Icon } from "@/components/admin/icons";
import { KeyValueList } from "@/components/admin/KeyValueList";
import { PageHeader } from "@/components/admin/PageHeader";
import { QrCode } from "@/components/admin/QrCode";
import { Badge } from "@/components/admin/StatusBadge";
import {
  formatTotpSecret,
  mfaFlowReducer,
  passwordStrength,
  validatePasswordChange,
  type PasswordChangeErrors,
} from "@/lib/admin/account";
import { adminApi } from "@/lib/admin/api";
import { formatDateTime, formatRelative } from "@/lib/admin/format";
import { useAdminMutation } from "@/lib/admin/hooks";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/admin/roles";
import { normalizeTotpInput, TOTP_LENGTH } from "@/lib/admin/totp";
import type {
  AdminUser,
  MfaDisableIn,
  MfaSetupOut,
  OkOut,
  PasswordChangeIn,
  UserEnvelope,
} from "@/lib/admin/types";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/admin/types";
import { cn } from "@/lib/cn";

/* ================================================================== profile */

function ProfileSection({ user }: { user: AdminUser }) {
  const { can } = useAdminAuth();
  return (
    <FormSection
      title="Profile"
      description={
        can("owner")
          ? "Names and roles are managed on the Users page."
          : "Ask an owner if your name or role should change."
      }
      footer={
        can("owner") ? (
          <AdminButtonLink href="/admin/users" size="sm" iconEnd="arrowRight">
            Manage users
          </AdminButtonLink>
        ) : undefined
      }
    >
      <KeyValueList
        items={[
          { label: "Name", value: user.name },
          { label: "Email", value: <span dir="ltr">{user.email}</span> },
          {
            label: "Role",
            value: (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone="gold">{ROLE_LABELS[user.role]}</Badge>
                <span className="text-[0.8125rem] text-ink-soft">
                  {ROLE_DESCRIPTIONS[user.role]}
                </span>
              </span>
            ),
          },
          {
            label: "Two-factor",
            value: (
              <Badge tone={user.mfa_enabled ? "success" : "warning"} dot>
                {user.mfa_enabled ? "Enabled" : "Not enabled"}
              </Badge>
            ),
          },
          {
            label: "Last sign-in",
            value: user.last_login_at ? (
              <time dateTime={user.last_login_at}>
                {formatDateTime(user.last_login_at)}{" "}
                <span className="text-ink-soft">({formatRelative(user.last_login_at)})</span>
              </time>
            ) : null,
          },
        ]}
      />
    </FormSection>
  );
}

/* ================================================================== password */

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);

  const change = useAdminMutation(
    (body: PasswordChangeIn) => adminApi.post<OkOut>("/auth/password", body),
    {
      successMessage: "Password changed",
      // Field errors are shown inline; everything else (rate limit, network…) as a toast.
      errorMessage: (error) => (error.isValidation ? null : undefined),
      onSuccess: () => {
        setCurrent("");
        setNext("");
        setConfirm("");
        setErrors({});
      },
      onError: (error) => {
        if (error.code === "invalid_password") {
          setErrors({ current: "The current password is incorrect." });
          currentRef.current?.focus();
        } else if (error.isValidation) {
          const fields = error.fields;
          setErrors({
            current: fields.current_password?.replace(/^Value error,\s*/i, ""),
            next: fields.new_password?.replace(/^Value error,\s*/i, ""),
          });
          nextRef.current?.focus();
        }
      },
    },
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validatePasswordChange({ current, next, confirm });
    setErrors(found);
    if (Object.keys(found).length) {
      if (found.current) currentRef.current?.focus();
      else nextRef.current?.focus();
      return;
    }
    void change.mutate({ current_password: current, new_password: next });
  };

  const strength = passwordStrength(next);
  return (
    <form onSubmit={onSubmit} noValidate>
      <FormSection
        title="Password"
        description={
          <>
            At least {PASSWORD_MIN_LENGTH} characters. A passphrase of a few unrelated words is both
            strong and easy to remember. Changing it signs out your other sessions.
          </>
        }
        footer={
          <AdminButton type="submit" variant="primary" loading={change.pending}>
            Change password
          </AdminButton>
        }
      >
        {/* Lets password managers associate the new password with this account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly value="" />
        <Field label="Current password" error={errors.current} required>
          <TextInput
            ref={currentRef}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            dir="ltr"
            maxLength={1024}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="New password"
            error={errors.next}
            required
            hint={
              <span className="flex items-center gap-2" aria-live="polite">
                <span aria-hidden="true" className="flex gap-1">
                  {[1, 2, 3].map((level) => (
                    <span
                      key={level}
                      className={cn(
                        "h-1 w-6 rounded-full",
                        strength.score >= level
                          ? strength.score === 3
                            ? "bg-success"
                            : strength.score === 2
                              ? "bg-gold-bright"
                              : "bg-warning"
                          : "bg-stone-200",
                      )}
                    />
                  ))}
                </span>
                <span>
                  {strength.label || `${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters`}
                </span>
              </span>
            }
          >
            <TextInput
              ref={nextRef}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              dir="ltr"
              maxLength={PASSWORD_MAX_LENGTH}
            />
          </Field>
          <Field label="Confirm new password" error={errors.confirm} required>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              dir="ltr"
              maxLength={PASSWORD_MAX_LENGTH}
            />
          </Field>
        </div>
      </FormSection>
    </form>
  );
}

/* ================================================================== two-factor */

function CodeInput({
  value,
  onChange,
  error,
  label = "6-digit code",
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <Field label={label} error={error} required>
      <TextInput
        ref={inputRef}
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={TOTP_LENGTH}
        dir="ltr"
        value={value}
        onChange={(event) => onChange(normalizeTotpInput(event.target.value))}
        placeholder="123456"
        className="max-w-40 text-center font-mono text-lg tracking-[0.35em] tabular-nums"
      />
    </Field>
  );
}

function TwoFactorSection({ user }: { user: AdminUser }) {
  const { setUser, refresh } = useAdminAuth();
  const [flow, dispatch] = useReducer(mfaFlowReducer, { step: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ code?: string; password?: string }>({});
  const codeRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCode("");
    setPassword("");
    setErrors({});
  };

  const setup = useAdminMutation(() => adminApi.post<MfaSetupOut>("/auth/mfa/setup"), {
    onSuccess: (result) => {
      reset();
      dispatch({ type: "setupStarted", secret: result.secret, otpauthUrl: result.otpauth_url });
    },
    onError: (error) => {
      if (error.code === "mfa_already_enabled") void refresh();
    },
  });

  const enable = useAdminMutation(
    (totp: string) => adminApi.post<UserEnvelope>("/auth/mfa/enable", { code: totp }),
    {
      successMessage: "Two-factor authentication is on",
      errorMessage: (error) => (error.code === "invalid_mfa_code" ? null : undefined),
      onSuccess: ({ user: updated }) => {
        setUser(updated);
        reset();
        dispatch({ type: "completed" });
      },
      onError: (error) => {
        if (error.code === "invalid_mfa_code") {
          setErrors({ code: "That code is not valid. Check the code in your app and try again." });
          setCode("");
          codeRef.current?.focus();
        } else if (error.code === "mfa_setup_required") {
          dispatch({ type: "cancel" });
        } else if (error.code === "mfa_already_enabled") {
          dispatch({ type: "cancel" });
          void refresh();
        }
      },
    },
  );

  const disable = useAdminMutation(
    (body: MfaDisableIn) => adminApi.post<UserEnvelope>("/auth/mfa/disable", body),
    {
      successMessage: "Two-factor authentication is off",
      errorMessage: (error) =>
        error.code === "invalid_mfa_code" || error.code === "invalid_password" ? null : undefined,
      onSuccess: ({ user: updated }) => {
        setUser(updated);
        reset();
        dispatch({ type: "completed" });
      },
      onError: (error) => {
        if (error.code === "invalid_password")
          setErrors({ password: "The password is incorrect." });
        else if (error.code === "invalid_mfa_code") {
          setErrors({ code: "That code is not valid." });
          setCode("");
        } else if (error.code === "mfa_not_enabled") {
          dispatch({ type: "cancel" });
          void refresh();
        }
      },
    },
  );

  const submitEnable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.length !== TOTP_LENGTH) {
      setErrors({ code: `Enter the ${TOTP_LENGTH}-digit code shown in your app.` });
      codeRef.current?.focus();
      return;
    }
    setErrors({});
    void enable.mutate(code);
  };

  const submitDisable = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!password) found.password = "Enter your password.";
    if (code.length !== TOTP_LENGTH)
      found.code = `Enter the ${TOTP_LENGTH}-digit code from your app.`;
    setErrors(found);
    if (Object.keys(found).length) return;
    void disable.mutate({ password, code });
  };

  const description = (
    <>
      A second step at sign-in: after your password, a 6-digit code from an authenticator app
      (Google Authenticator, 1Password, Microsoft Authenticator…). Strongly recommended for owners
      and admins.
    </>
  );

  /* ---- enabled */
  if (user.mfa_enabled) {
    if (flow.step === "disable") {
      return (
        <form onSubmit={submitDisable} noValidate>
          <FormSection
            title="Two-factor authentication"
            description={description}
            footer={
              <>
                <AdminButton
                  onClick={() => {
                    reset();
                    dispatch({ type: "cancel" });
                  }}
                  disabled={disable.pending}
                >
                  Cancel
                </AdminButton>
                <AdminButton type="submit" variant="danger" loading={disable.pending}>
                  Turn off two-factor
                </AdminButton>
              </>
            }
          >
            <p className="text-sm text-ink-soft">
              Confirm with your password and a current code. Your account will then be protected by
              the password only.
            </p>
            <input
              type="text"
              name="username"
              autoComplete="username"
              hidden
              readOnly
              value={user.email}
            />
            <Field label="Password" error={errors.password} required>
              <TextInput
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                dir="ltr"
                className="max-w-sm"
              />
            </Field>
            <CodeInput value={code} onChange={setCode} error={errors.code} inputRef={codeRef} />
          </FormSection>
        </form>
      );
    }
    return (
      <FormSection
        title="Two-factor authentication"
        description={description}
        footer={
          <AdminButton
            variant="dangerGhost"
            icon="lock"
            onClick={() => {
              reset();
              dispatch({ type: "openDisable" });
            }}
          >
            Turn off
          </AdminButton>
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
            <Icon name="shield" className="size-5" />
          </span>
          <div>
            <p className="font-medium text-ink">Two-factor authentication is on</p>
            <p className="mt-0.5 text-sm text-ink-soft">
              You&apos;ll be asked for a code from your authenticator app every time you sign in.
            </p>
          </div>
        </div>
      </FormSection>
    );
  }

  /* ---- setup in progress */
  if (flow.step === "setup") {
    return (
      <form onSubmit={submitEnable} noValidate>
        <FormSection
          title="Two-factor authentication"
          description={description}
          footer={
            <>
              <AdminButton
                onClick={() => {
                  reset();
                  dispatch({ type: "cancel" });
                }}
                disabled={enable.pending}
              >
                Cancel
              </AdminButton>
              <AdminButton type="submit" variant="primary" loading={enable.pending}>
                Turn on two-factor
              </AdminButton>
            </>
          }
        >
          <ol className="space-y-5">
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-night text-xs font-semibold text-gold-light">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  Scan this QR code with your authenticator app
                </p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
                  <div className="w-fit rounded-xl border border-stone-200 bg-white p-2 shadow-xs">
                    <QrCode
                      value={flow.otpauthUrl}
                      label="QR code to add Zodiac Blend to your authenticator app"
                      size={176}
                    />
                  </div>
                  <div className="min-w-0 space-y-2 text-sm">
                    <p className="text-ink-soft">
                      Can&apos;t scan it? Enter this key manually (time-based, 6 digits):
                    </p>
                    <p className="flex flex-wrap items-center gap-1.5">
                      <code
                        dir="ltr"
                        className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[0.8125rem] tracking-wide break-all text-ink"
                      >
                        {formatTotpSecret(flow.secret)}
                      </code>
                      <CopyButton value={flow.secret} label="Copy setup key" />
                    </p>
                    <a
                      href={flow.otpauthUrl}
                      className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-gold-deep hover:underline sm:hidden"
                    >
                      Open in an authenticator app on this device
                      <Icon name="external" className="size-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-night text-xs font-semibold text-gold-light">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-3 text-sm font-medium text-ink">
                  Enter the code the app shows to confirm
                </p>
                <CodeInput value={code} onChange={setCode} error={errors.code} inputRef={codeRef} />
              </div>
            </li>
          </ol>
        </FormSection>
      </form>
    );
  }

  /* ---- not enabled */
  return (
    <FormSection
      title="Two-factor authentication"
      description={description}
      footer={
        <AdminButton
          variant="primary"
          icon="shield"
          loading={setup.pending}
          onClick={() => void setup.mutate()}
        >
          Set up two-factor
        </AdminButton>
      }
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Icon name="alert" className="size-5" />
        </span>
        <div>
          <p className="font-medium text-ink">Two-factor authentication is off</p>
          <p className="mt-0.5 text-sm text-ink-soft">
            Anyone who learns your password can sign in. Setting it up takes about a minute.
          </p>
        </div>
      </div>
    </FormSection>
  );
}

/* ================================================================== page */

export function AccountView() {
  const { user } = useAdminAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader
        title="Account & security"
        description="Your profile, password and two-factor authentication."
      />
      <div className="space-y-8">
        <ProfileSection user={user} />
        <PasswordSection />
        <TwoFactorSection user={user} />
      </div>
    </>
  );
}
