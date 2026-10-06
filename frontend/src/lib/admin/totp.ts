/** TOTP codes are 6 digits (backend `TOTP_DIGITS`). */
export const TOTP_LENGTH = 6;

/**
 * Keep only ASCII digits (also converting Arabic-Indic / Persian digits, which some phone
 * keyboards produce), capped at TOTP_LENGTH. Pasting "123 456" gives "123456".
 */
export function normalizeTotpInput(value: string): string {
  const ascii = value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  return ascii.replace(/\D/g, "").slice(0, TOTP_LENGTH);
}
