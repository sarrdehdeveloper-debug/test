import { describe, expect, it } from "vitest";
import type { BusinessSettings } from "@/lib/admin/types";
import {
  changedSettings,
  dirtySettingKeys,
  formatSettingValue,
  invalidSettingMessage,
  parseSettingsDraft,
  parseSettingValue,
  SETTING_FIELD_BY_KEY,
  SETTING_FIELDS,
  settingKeyFromMessage,
  settingsToDraft,
} from "./schema";

const DEFAULTS: BusinessSettings = {
  paid_price_cents: 2900,
  currency: "USD",
  gemini_model: "gemini-2.5-flash",
  gemini_temperature: 0.9,
  gemini_max_output_tokens: 8192,
  gemini_timeout_seconds: 60,
  prompt_delay_min_seconds: 1.0,
  prompt_delay_max_seconds: 2.0,
  min_words: 25,
  max_attempts_per_prompt: 3,
  report_access_hours: 24,
  email_attach_pdf: false,
  chinese_year_boundary: "lichun",
  chinese_day_boundary: "midnight",
  personal_data_retention_days: 30,
  abandoned_order_hours: 48,
  free_reading_rate_limit_per_hour: 30,
  order_rate_limit_per_hour: 20,
};

describe("settings schema", () => {
  it("has a field for every backend setting, each once", () => {
    const keys = SETTING_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(DEFAULTS).sort());
    for (const field of SETTING_FIELDS) expect(field.help.length).toBeGreaterThan(10);
  });

  it("round-trips the saved values without changes", () => {
    const draft = settingsToDraft(DEFAULTS);
    expect(draft.paid_price_cents).toBe(2900);
    expect(draft.gemini_temperature).toBe("0.9");
    expect(draft.email_attach_pdf).toBe(false);
    const { values, errors } = parseSettingsDraft(draft);
    expect(errors).toEqual({});
    expect(values).toEqual(DEFAULTS);
    expect(changedSettings(values, DEFAULTS)).toEqual({});
    expect(dirtySettingKeys(draft, DEFAULTS)).toEqual([]);
  });

  it("returns only the changed values", () => {
    const draft = {
      ...settingsToDraft(DEFAULTS),
      min_words: "300",
      currency: " eur ",
      email_attach_pdf: true,
    };
    const { values, errors } = parseSettingsDraft(draft);
    expect(errors).toEqual({});
    expect(changedSettings(values, DEFAULTS)).toEqual({
      min_words: 300,
      currency: "EUR",
      email_attach_pdf: true,
    });
    expect(dirtySettingKeys(draft, DEFAULTS).sort()).toEqual(
      ["currency", "email_attach_pdf", "min_words"].sort(),
    );
  });

  it("treats 2 and 2.0 as the same decimal", () => {
    const draft = { ...settingsToDraft(DEFAULTS), prompt_delay_max_seconds: "2.0" };
    expect(dirtySettingKeys(draft, DEFAULTS)).toEqual([]);
  });

  it("validates ranges and formats like the backend", () => {
    const field = SETTING_FIELD_BY_KEY;
    expect(parseSettingValue(field.min_words, "5001")).toHaveProperty("error");
    expect(parseSettingValue(field.min_words, "12.5")).toHaveProperty("error");
    expect(parseSettingValue(field.min_words, "-1")).toHaveProperty("error");
    expect(parseSettingValue(field.min_words, "0")).toEqual({ value: 0 });
    expect(parseSettingValue(field.gemini_temperature, "2.5")).toHaveProperty("error");
    expect(parseSettingValue(field.gemini_temperature, ".5")).toEqual({ value: 0.5 });
    expect(parseSettingValue(field.gemini_timeout_seconds, "4")).toHaveProperty("error");
    expect(parseSettingValue(field.paid_price_cents, 49)).toHaveProperty("error");
    expect(parseSettingValue(field.paid_price_cents, null)).toHaveProperty("error");
    expect(parseSettingValue(field.paid_price_cents, 50)).toEqual({ value: 50 });
    expect(parseSettingValue(field.currency, "US")).toHaveProperty("error");
    expect(parseSettingValue(field.currency, "U5D")).toHaveProperty("error");
    expect(parseSettingValue(field.gemini_model, "  ")).toHaveProperty("error");
    expect(parseSettingValue(field.chinese_year_boundary, "solstice")).toHaveProperty("error");
    expect(parseSettingValue(field.chinese_day_boundary, "zi_23")).toEqual({ value: "zi_23" });
  });

  it("checks that the minimum pause is not above the maximum", () => {
    const draft = {
      ...settingsToDraft(DEFAULTS),
      prompt_delay_min_seconds: "5",
      prompt_delay_max_seconds: "3",
    };
    expect(parseSettingsDraft(draft).errors).toEqual({
      prompt_delay_max_seconds: "Must be at least the minimum pause.",
    });
  });

  it("finds the key named in invalid_setting messages", () => {
    expect(settingKeyFromMessage("Invalid value for min_words")).toBe("min_words");
    expect(
      settingKeyFromMessage("prompt_delay_min_seconds must be <= prompt_delay_max_seconds"),
    ).toBe("prompt_delay_min_seconds");
    expect(settingKeyFromMessage("Unknown setting: foo")).toBeNull();
    expect(invalidSettingMessage("Invalid value for min_words")).toContain(
      "Minimum words per section",
    );
    expect(
      invalidSettingMessage("prompt_delay_min_seconds must be <= prompt_delay_max_seconds"),
    ).toMatch(/minimum pause/);
  });

  it("formats values for the 'Default:' hints", () => {
    const field = SETTING_FIELD_BY_KEY;
    expect(formatSettingValue(field.paid_price_cents, 2900, "USD")).toBe("$29.00");
    expect(formatSettingValue(field.email_attach_pdf, false)).toBe("Off");
    expect(formatSettingValue(field.chinese_year_boundary, "lichun")).toBe("Lichun");
    expect(formatSettingValue(field.report_access_hours, 24)).toBe("24 hours");
    expect(formatSettingValue(field.report_access_hours, 1)).toBe("1 hour");
    expect(formatSettingValue(field.order_rate_limit_per_hour, 1)).toBe("1 per hour");
    expect(formatSettingValue(field.gemini_temperature, 0.9)).toBe("0.9");
    expect(formatSettingValue(field.gemini_model, "")).toBe("—");
  });
});
