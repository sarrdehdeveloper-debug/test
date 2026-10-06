import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./types";

/* ------------------------------------------------------------------ password change */

export interface PasswordChangeForm {
  current: string;
  next: string;
  confirm: string;
}

export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeForm, string>>;

/** Client-side checks mirroring the backend (`PasswordChangeIn`), plus the confirmation field. */
export function validatePasswordChange(form: PasswordChangeForm): PasswordChangeErrors {
  const errors: PasswordChangeErrors = {};
  if (!form.current) errors.current = "Enter your current password.";
  if (!form.next.trim()) errors.next = "Enter a new password.";
  else if (form.next.length < PASSWORD_MIN_LENGTH)
    errors.next = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  else if (form.next.length > PASSWORD_MAX_LENGTH)
    errors.next = `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  else if (form.current && form.next === form.current)
    errors.next = "The new password must differ from the current one.";
  if (!errors.next && form.confirm !== form.next) errors.confirm = "The passwords do not match.";
  return errors;
}

/** Rough guidance for the new-password hint (not a policy: the backend only enforces length). */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    const left = PASSWORD_MIN_LENGTH - password.length;
    return {
      score: 0,
      label: password ? `${left} more character${left === 1 ? "" : "s"} needed` : "",
    };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 20 || (password.length >= 14 && classes >= 3))
    return { score: 3, label: "Strong" };
  if (classes >= 2) return { score: 2, label: "Good" };
  return { score: 1, label: "Fair — longer is better" };
}

/* ------------------------------------------------------------------ two-factor (TOTP) */

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP" (easier to type into an authenticator). */
export function formatTotpSecret(secret: string): string {
  return secret.replace(/\s+/g, "").replace(/(.{4})(?=.)/g, "$1 ");
}

export type MfaFlowState =
  { step: "idle" } | { step: "setup"; secret: string; otpauthUrl: string } | { step: "disable" };

export type MfaFlowAction =
  | { type: "setupStarted"; secret: string; otpauthUrl: string }
  | { type: "openDisable" }
  | { type: "cancel" }
  | { type: "completed" };

/**
 * Account page two-factor flow:
 *   idle --setupStarted--> setup --completed (enable ok)--> idle
 *   idle --openDisable--> disable --completed (disable ok)--> idle
 *   any --cancel--> idle
 */
export function mfaFlowReducer(state: MfaFlowState, action: MfaFlowAction): MfaFlowState {
  switch (action.type) {
    case "setupStarted":
      return state.step === "disable"
        ? state
        : { step: "setup", secret: action.secret, otpauthUrl: action.otpauthUrl };
    case "openDisable":
      return state.step === "idle" ? { step: "disable" } : state;
    case "cancel":
    case "completed":
      return { step: "idle" };
    default:
      return state;
  }
}
