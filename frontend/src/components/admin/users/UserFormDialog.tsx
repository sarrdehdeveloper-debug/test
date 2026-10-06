"use client";

import { useId, useState, type FormEvent } from "react";
import { AdminButton } from "@/components/admin/AdminButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { Field, Switch, TextInput } from "@/components/admin/form";
import { Icon } from "@/components/admin/icons";
import { Modal } from "@/components/admin/Modal";
import { passwordStrength } from "@/lib/admin/account";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/admin/roles";
import {
  ADMIN_ROLES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AdminRole,
  type ManagedUser,
  type UserCreateIn,
  type UserUpdateIn,
} from "@/lib/admin/types";
import { cn } from "@/lib/cn";
import {
  generatePassword,
  toUserCreate,
  userActionErrorMessage,
  userChanges,
  userEditForm,
  userFieldErrorFromApi,
  validateUserCreate,
  validateUserEdit,
  type UserCreateForm,
  type UserEditForm,
  type UserFormErrors,
} from "./userForm";

function RolePicker({
  value,
  onChange,
  disabled,
  error,
  hint,
}: {
  value: AdminRole | "";
  onChange: (role: AdminRole) => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
}) {
  const name = useId();
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0"
      aria-describedby={hint ? `${name}-hint` : undefined}
    >
      <legend className="mb-1.5 text-sm font-semibold text-ink">
        Role
        <span aria-hidden="true" className="ms-0.5 text-gold-deep">
          *
        </span>
      </legend>
      <div className="grid gap-2">
        {ADMIN_ROLES.map((role) => {
          const checked = value === role;
          return (
            <label
              key={role}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                checked
                  ? "border-gold-bright bg-gold-pale/30"
                  : "border-stone-200 hover:border-stone-300",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name}
                value={role}
                checked={checked}
                onChange={() => onChange(role)}
                className="mt-0.5 size-4 shrink-0 accent-gold-bright"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{ROLE_LABELS[role]}</span>
                <span className="block text-xs text-ink-soft">{ROLE_DESCRIPTIONS[role]}</span>
              </span>
            </label>
          );
        })}
      </div>
      {hint ? (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
      {error ? <p className="mt-1.5 text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(true);
  const strength = passwordStrength(value);
  return (
    <Field
      label={label}
      error={error}
      required={required}
      hint={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-live="polite">
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
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            value={value}
            maxLength={PASSWORD_MAX_LENGTH}
            onChange={(event) => onChange(event.target.value)}
            dir="ltr"
            className="font-mono"
          />
        </div>
        <AdminButton
          icon="eye"
          iconOnly
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
        >
          {visible ? "Hide password" : "Show password"}
        </AdminButton>
        <AdminButton icon="refresh" onClick={() => onChange(generatePassword())}>
          Generate
        </AdminButton>
        {value ? <CopyButton value={value} label="Copy password" className="size-10" /> : null}
      </div>
    </Field>
  );
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

/* ================================================================== create */

export interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  /** POST /users; resolves with the new user. */
  onSubmit: (body: UserCreateIn) => Promise<ManagedUser>;
}

const EMPTY_CREATE: UserCreateForm = { email: "", name: "", role: "editor", password: "" };

/** "Add user" modal: name, email, role (with descriptions) and an initial password. */
export function CreateUserDialog({ open, onClose, onSubmit }: CreateUserDialogProps) {
  const formId = useId();
  const [form, setForm] = useState<UserCreateForm>(EMPTY_CREATE);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof UserCreateForm>(key: K, value: UserCreateForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) setErrors(validateUserCreate(next));
    else if (errors[key as keyof UserFormErrors]) setErrors({ ...errors, [key]: undefined });
  };

  const close = () => {
    if (pending) return;
    setForm(EMPTY_CREATE);
    setErrors({});
    setSubmitted(false);
    setAlert(null);
    onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validateUserCreate(form);
    setErrors(found);
    if (Object.keys(found).length || pending) return;
    setPending(true);
    setAlert(null);
    try {
      await onSubmit(toUserCreate(form));
      setPending(false);
      setForm(EMPTY_CREATE);
      setSubmitted(false);
      onClose();
    } catch (err) {
      setPending(false);
      const fields = userFieldErrorFromApi(err);
      if (fields) setErrors(fields);
      else setAlert(userActionErrorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!pending}
      size="md"
      title="Add an admin user"
      description="They sign in at /admin/login with this email and the initial password."
      footer={
        <>
          <AdminButton onClick={close} disabled={pending}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form={formId} variant="primary" loading={pending} icon="plus">
            Add user
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <FormAlert message={alert} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} required>
            <TextInput
              value={form.name}
              autoComplete="off"
              maxLength={200}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
          <Field label="Email" error={errors.email} required>
            <TextInput
              type="email"
              value={form.email}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              onChange={(event) => set("email", event.target.value)}
            />
          </Field>
        </div>
        <RolePicker value={form.role} onChange={(role) => set("role", role)} error={errors.role} />
        <PasswordField
          label="Initial password"
          value={form.password}
          onChange={(value) => set("password", value)}
          error={errors.password}
          required
        />
        <p className="flex items-start gap-2 rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
          <Icon name="shield" className="mt-px size-4 shrink-0 text-gold-deep" />
          Share the password privately (not by plain email). Ask them to change it on their Account
          page and turn on two-factor authentication.
        </p>
      </form>
    </Modal>
  );
}

/* ================================================================== edit */

export interface EditUserDialogProps {
  open: boolean;
  /** The user being edited. */
  user: ManagedUser;
  /** The signed-in owner is editing themself. */
  isSelf: boolean;
  /** This user is the only active owner (role/status locked). */
  lastOwner: boolean;
  onClose: () => void;
  /** PATCH /users/{id}; resolves with the updated user. */
  onSubmit: (user: ManagedUser, body: UserUpdateIn) => Promise<ManagedUser>;
}

/**
 * "Edit user" modal: name, role, active, optional new password. Give it a new `key` each time it
 * opens (the form starts from `user`).
 */
export function EditUserDialog({
  open,
  user,
  isSelf,
  lastOwner,
  onClose,
  onSubmit,
}: EditUserDialogProps) {
  const formId = useId();
  const [form, setForm] = useState<UserEditForm>(() => userEditForm(user));
  const [setPassword, setSetPassword] = useState(false);
  const [errors, setErrors] = useState<UserFormErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const locked = isSelf || lastOwner;
  const lockReason = isSelf
    ? "You can't change your own role or deactivate yourself."
    : lastOwner
      ? "This is the only active owner: make someone else an owner first."
      : undefined;
  const effective = setPassword ? form : { ...form, password: "" };
  const changes = userChanges(user, effective, isSelf);
  const unchanged = Object.keys(changes).length === 0;

  const set = <K extends keyof UserEditForm>(key: K, value: UserEditForm[K]) => {
    setForm({ ...form, [key]: value });
    if (errors[key as keyof UserFormErrors]) setErrors({ ...errors, [key]: undefined });
  };

  const close = () => {
    if (!pending) onClose();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateUserEdit(effective);
    if (setPassword && !form.password)
      found.password = "Enter the new password or untick the option.";
    setErrors(found);
    if (Object.keys(found).length || pending || unchanged) return;
    setPending(true);
    setAlert(null);
    try {
      await onSubmit(user, changes);
      setPending(false);
      onClose();
    } catch (err) {
      setPending(false);
      const fields = userFieldErrorFromApi(err);
      if (fields) setErrors(fields);
      else setAlert(userActionErrorMessage(err));
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!pending}
      size="md"
      title={isSelf ? "Edit your profile" : `Edit ${user.name}`}
      description={<span dir="ltr">{user.email}</span>}
      footer={
        <>
          <AdminButton onClick={close} disabled={pending}>
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            form={formId}
            variant="primary"
            loading={pending}
            disabled={unchanged}
          >
            Save changes
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <FormAlert message={alert} />
        <Field label="Name" error={errors.name} required>
          <TextInput
            value={form.name}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <RolePicker
          value={form.role}
          onChange={(role) => set("role", role)}
          disabled={locked}
          hint={lockReason}
          error={errors.role}
        />
        <div className="rounded-lg border border-stone-200 p-3.5">
          <Switch
            checked={form.is_active}
            onChange={(checked) => set("is_active", checked)}
            disabled={locked}
            label="Active"
            description={
              locked
                ? lockReason
                : "Inactive users cannot sign in; their open sessions end immediately."
            }
          />
        </div>
        {isSelf ? (
          <p className="text-xs text-ink-soft">
            Change your own password and two-factor settings on your Account page.
          </p>
        ) : (
          <div className="space-y-3 rounded-lg border border-stone-200 p-3.5">
            <Switch
              checked={setPassword}
              onChange={setSetPassword}
              label="Set a new password"
              description="For a forgotten password. Their other sessions are signed out."
            />
            {setPassword ? (
              <PasswordField
                label="New password"
                value={form.password}
                onChange={(value) => set("password", value)}
                error={errors.password}
                required
              />
            ) : null}
          </div>
        )}
      </form>
    </Modal>
  );
}
