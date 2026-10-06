import { centsToInput, formatMoney, formatNumber } from "@/lib/admin/format";
import type { BusinessSettings } from "@/lib/admin/types";

/**
 * Business settings form: field definitions (grouped, with help text) and the parse / validate /
 * diff logic. Ranges mirror backend/app/settings_store.py `_VALIDATORS`.
 */

export type SettingKey = keyof BusinessSettings;

export type SettingKind =
  "money" | "currency" | "text" | "integer" | "decimal" | "boolean" | "choice";

export interface SettingOption {
  value: string;
  label: string;
  /** Plain-language explanation shown under the option. */
  description: string;
}

export interface SettingField {
  key: SettingKey;
  label: string;
  /** One or two sentences under the field. */
  help: string;
  kind: SettingKind;
  min?: number;
  max?: number;
  /** Input step for numbers (decimal fields). */
  step?: number;
  /** Unit after the input ("hours", "words"). */
  unit?: string;
  options?: SettingOption[];
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  fields: SettingField[];
}

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "pricing",
    title: "Pricing",
    description:
      "What customers pay for the full report. Applies to new checkouts at once; discount codes are taken off this price.",
    fields: [
      {
        key: "paid_price_cents",
        label: "Report price",
        help: "Full price of the paid report, before any discount code.",
        kind: "money",
        min: 50,
        max: 1_000_000,
      },
      {
        key: "currency",
        label: "Currency",
        help: "Three-letter ISO code (USD, EUR, AED…). Changing it does not convert the price: set both together.",
        kind: "currency",
      },
    ],
  },
  {
    id: "ai",
    title: "AI generation",
    description:
      "How the six report sections are written by the AI model. Changes apply to the next section generated.",
    fields: [
      {
        key: "gemini_model",
        label: "Gemini model",
        help: "Model id sent to the AI provider, e.g. gemini-2.5-flash.",
        kind: "text",
      },
      {
        key: "gemini_temperature",
        label: "Temperature",
        help: "Creativity of the writing: lower is more predictable, higher is more varied (0–2).",
        kind: "decimal",
        min: 0,
        max: 2,
        step: 0.1,
      },
      {
        key: "gemini_max_output_tokens",
        label: "Max output tokens",
        help: "Upper limit of the reply length, including the model's thinking. Too low cuts sections short.",
        kind: "integer",
        min: 64,
        max: 65_536,
        unit: "tokens",
      },
      {
        key: "gemini_timeout_seconds",
        label: "Request timeout",
        help: "How long to wait for one AI reply before retrying. Keep it well below the job lease (5 minutes).",
        kind: "integer",
        min: 5,
        max: 240,
        unit: "seconds",
      },
      {
        key: "prompt_delay_min_seconds",
        label: "Pause between prompts (min)",
        help: "Shortest random pause between two sections of the same report.",
        kind: "decimal",
        min: 0,
        max: 30,
        step: 0.1,
        unit: "seconds",
      },
      {
        key: "prompt_delay_max_seconds",
        label: "Pause between prompts (max)",
        help: "Longest random pause. Must be at least the minimum pause.",
        kind: "decimal",
        min: 0,
        max: 30,
        step: 0.1,
        unit: "seconds",
      },
      {
        key: "min_words",
        label: "Minimum words per section",
        help: "A shorter reply is requested again. A prompt version can override this.",
        kind: "integer",
        min: 0,
        max: 5_000,
        unit: "words",
      },
      {
        key: "max_attempts_per_prompt",
        label: "Attempts per section",
        help: "How often one section is tried before the order is marked as failed.",
        kind: "integer",
        min: 1,
        max: 10,
        unit: "attempts",
      },
    ],
  },
  {
    id: "delivery",
    title: "Report delivery",
    description: "How long customers can download their report and how it is emailed.",
    fields: [
      {
        key: "report_access_hours",
        label: "Download window",
        help: "Hours the download link works, counted from when the report is ready (up to 30 days).",
        kind: "integer",
        min: 1,
        max: 720,
        unit: "hours",
      },
      {
        key: "email_attach_pdf",
        label: "Attach the PDF to the email",
        help: "Off: the email only links to the download page, which expires. On: the PDF is also attached, so the customer keeps a copy that never expires.",
        kind: "boolean",
      },
    ],
  },
  {
    id: "calculation",
    title: "Calculation method",
    description:
      "Conventions of the Chinese zodiac calculation. Each order stores the convention it was calculated with, so changes only affect new readings and orders.",
    fields: [
      {
        key: "chinese_year_boundary",
        label: "When does the Chinese year begin?",
        help: "Only matters for birthdays between late January and mid-February.",
        kind: "choice",
        options: [
          {
            value: "lichun",
            label: "Lichun (Start of Spring, about 4 February)",
            description:
              "The BaZi / Four Pillars convention used by professional astrologers: the year animal changes at the solar term Lichun. Example: born 7 Feb 2024 → Dragon.",
          },
          {
            value: "lunar_new_year",
            label: "Chinese New Year (between 21 January and 20 February)",
            description:
              "The popular zodiac convention of most calendars and horoscope sites: the animal changes on Chinese New Year's Day. Example: born 7 Feb 2024 → Rabbit (New Year was 10 Feb).",
          },
        ],
      },
      {
        key: "chinese_day_boundary",
        label: "When does the day begin?",
        help: "Only matters for births between 23:00 and midnight (local time).",
        kind: "choice",
        options: [
          {
            value: "midnight",
            label: "Midnight (00:00)",
            description:
              "The modern civil convention: the day pillar changes at midnight. A birth at 23:30 keeps that day's pillar.",
          },
          {
            value: "zi_23",
            label: "Rat hour (23:00)",
            description:
              "The traditional convention: the day starts with the Rat (子) hour at 23:00, so a birth at 23:30 already takes the next day's pillar.",
          },
        ],
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy & retention",
    description: "How long personal data is kept (the privacy policy should match these numbers).",
    fields: [
      {
        key: "personal_data_retention_days",
        label: "Keep birth data for",
        help: "After this, birth date, time and place are deleted from orders and free-reading leads.",
        kind: "integer",
        min: 1,
        max: 3650,
        unit: "days",
      },
      {
        key: "abandoned_order_hours",
        label: "Abandon unpaid orders after",
        help: "Orders still waiting for payment after this are marked as abandoned.",
        kind: "integer",
        min: 1,
        max: 720,
        unit: "hours",
      },
    ],
  },
  {
    id: "abuse",
    title: "Abuse protection",
    description: "Rate limits per visitor (IP address). Raise them if real customers are blocked.",
    fields: [
      {
        key: "free_reading_rate_limit_per_hour",
        label: "Free readings per hour",
        help: "Free readings one visitor can request per hour.",
        kind: "integer",
        min: 1,
        max: 100_000,
        unit: "per hour",
      },
      {
        key: "order_rate_limit_per_hour",
        label: "Orders per hour",
        help: "Paid orders one visitor can start per hour.",
        kind: "integer",
        min: 1,
        max: 100_000,
        unit: "per hour",
      },
    ],
  },
];

export const SETTING_FIELDS: SettingField[] = SETTING_GROUPS.flatMap((group) => group.fields);
export const SETTING_FIELD_BY_KEY = Object.fromEntries(
  SETTING_FIELDS.map((field) => [field.key, field]),
) as Record<SettingKey, SettingField>;

/* ------------------------------------------------------------------ form state */

/**
 * Editable state: text for typed numbers/strings (so partial input like "0." is kept), cents
 * (`number | null`) for money, booleans and choice values as is.
 */
export type SettingsDraft = Record<SettingKey, string | number | boolean | null>;

export function settingsToDraft(values: BusinessSettings): SettingsDraft {
  const draft = {} as SettingsDraft;
  for (const field of SETTING_FIELDS) {
    const value = values[field.key];
    if (field.kind === "money") draft[field.key] = typeof value === "number" ? value : null;
    else if (field.kind === "boolean") draft[field.key] = Boolean(value);
    else draft[field.key] = value === null || value === undefined ? "" : String(value);
  }
  return draft;
}

export type SettingErrors = Partial<Record<SettingKey, string>>;

function rangeText(field: SettingField): string {
  const { min, max } = field;
  if (min === undefined || max === undefined) return "";
  return `from ${formatNumber(min)} to ${formatNumber(max)}`;
}

/** Parse + validate one field. Returns `{value}` or `{error}`. */
export function parseSettingValue(
  field: SettingField,
  raw: SettingsDraft[SettingKey],
): { value: BusinessSettings[SettingKey] } | { error: string } {
  switch (field.kind) {
    case "money": {
      if (typeof raw !== "number" || !Number.isInteger(raw)) return { error: "Enter a price." };
      if (raw < (field.min ?? 0) || raw > (field.max ?? Infinity)) {
        return {
          error: `Enter a price from ${centsToInput(field.min ?? 0)} to ${centsToInput(field.max ?? 0)}.`,
        };
      }
      return { value: raw };
    }
    case "currency": {
      const text = String(raw ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{3}$/.test(text))
        return { error: "Enter a three-letter currency code, e.g. USD." };
      return { value: text };
    }
    case "text": {
      const text = String(raw ?? "").trim();
      if (!text) return { error: "This field is required." };
      if (text.length > 100) return { error: "Use at most 100 characters." };
      return { value: text };
    }
    case "integer":
    case "decimal": {
      const text = String(raw ?? "").trim();
      const pattern = field.kind === "integer" ? /^\d+$/ : /^\d+(\.\d+)?$|^\.\d+$/;
      if (!text || !pattern.test(text)) {
        return {
          error:
            field.kind === "integer"
              ? `Enter a whole number ${rangeText(field)}.`
              : `Enter a number ${rangeText(field)}.`,
        };
      }
      const value = Number(text);
      if (
        !Number.isFinite(value) ||
        value < (field.min ?? -Infinity) ||
        value > (field.max ?? Infinity)
      ) {
        return { error: `Enter a value ${rangeText(field)}.` };
      }
      return { value };
    }
    case "boolean":
      return { value: Boolean(raw) };
    case "choice": {
      const text = String(raw ?? "");
      if (!field.options?.some((option) => option.value === text))
        return { error: "Choose an option." };
      return { value: text as BusinessSettings[SettingKey] };
    }
  }
}

/** Parse the whole draft: valid values plus per-field errors (including cross-field rules). */
export function parseSettingsDraft(draft: SettingsDraft): {
  values: Partial<BusinessSettings>;
  errors: SettingErrors;
} {
  const values: Partial<Record<SettingKey, unknown>> = {};
  const errors: SettingErrors = {};
  for (const field of SETTING_FIELDS) {
    const result = parseSettingValue(field, draft[field.key]);
    if ("error" in result) errors[field.key] = result.error;
    else values[field.key] = result.value;
  }
  const min = values.prompt_delay_min_seconds;
  const max = values.prompt_delay_max_seconds;
  if (typeof min === "number" && typeof max === "number" && min > max) {
    errors.prompt_delay_max_seconds = "Must be at least the minimum pause.";
  }
  return { values: values as Partial<BusinessSettings>, errors };
}

/** Values that differ from the saved ones (sent as `PUT /settings {values}`). */
export function changedSettings(
  values: Partial<BusinessSettings>,
  saved: BusinessSettings,
): Partial<BusinessSettings> {
  const out: Partial<Record<SettingKey, unknown>> = {};
  for (const key of Object.keys(values) as SettingKey[]) {
    if (!Object.is(values[key], saved[key])) out[key] = values[key];
  }
  return out as Partial<BusinessSettings>;
}

/** Keys whose draft differs from the saved value (an invalid draft counts as changed). */
export function dirtySettingKeys(draft: SettingsDraft, saved: BusinessSettings): SettingKey[] {
  const savedDraft = settingsToDraft(saved);
  return SETTING_FIELDS.filter((field) => {
    const result = parseSettingValue(field, draft[field.key]);
    if ("error" in result) return draft[field.key] !== savedDraft[field.key];
    return !Object.is(result.value, saved[field.key]);
  }).map((field) => field.key);
}

/** Setting key named in a 422 `invalid_setting` message ("Invalid value for min_words"). */
export function settingKeyFromMessage(message: string | null | undefined): SettingKey | null {
  if (!message) return null;
  // Longest keys first so `prompt_delay_min_seconds` is not matched by a shorter key.
  const keys = SETTING_FIELDS.map((f) => f.key).sort((a, b) => b.length - a.length);
  return keys.find((key) => message.includes(key)) ?? null;
}

/** Human message for an `invalid_setting` error, naming the field by its label. */
export function invalidSettingMessage(message: string): string {
  const key = settingKeyFromMessage(message);
  if (!key) return message;
  const field = SETTING_FIELD_BY_KEY[key];
  if (/must be <=/.test(message))
    return "The minimum pause must not be longer than the maximum pause.";
  return `${field.label}: the server rejected this value. ${field.min !== undefined && field.max !== undefined ? `Allowed: ${rangeText(field)}.` : ""}`.trim();
}

/** A value for display ("$29.00", "0.9", "On", "Lichun (…)", "24 hours"). */
export function formatSettingValue(field: SettingField, value: unknown, currency = "USD"): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.kind) {
    case "money":
      return typeof value === "number" ? formatMoney(value, currency) : String(value);
    case "boolean":
      return value ? "On" : "Off";
    case "choice":
      return field.options?.find((o) => o.value === value)?.label.split(" (")[0] ?? String(value);
    case "integer":
    case "decimal": {
      const text = typeof value === "number" ? formatNumber(value) : String(value);
      if (!field.unit) return text;
      // "1 hours" → "1 hour" ("per hour" units stay as they are).
      const unit =
        value === 1 && field.unit.endsWith("s") && !field.unit.startsWith("per ")
          ? field.unit.slice(0, -1)
          : field.unit;
      return `${text} ${unit}`;
    }
    default:
      return String(value);
  }
}
