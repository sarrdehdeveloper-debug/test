"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Sparkle } from "@/components/decor/Ornament";
import { Alert } from "@/components/ui/Alert";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox, DateInput, Field, Input, Select } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/useApiErrorMessage";
import { mapFreeReadingError, retryAfterMinutes } from "@/lib/flows/errors";
import {
  firstIssueField,
  localToday,
  validateFreeForm,
  type FieldIssues,
  type FreeField,
} from "@/lib/flows/validation";
import type { FreeReadingRequest, FreeReadingResult } from "@/lib/types";
import { useHydrated } from "../hooks";
import { useIssueMessage } from "../useIssueMessage";
import { BlendResult } from "./BlendResult";

export interface LocaleOption {
  code: string;
  label: string;
}

const FIELD_ORDER: readonly FreeField[] = ["birthDate", "email", "language"];

export interface FreeReadingFlowProps {
  locales: LocaleOption[];
  /** `YYYY-MM-DD` (public-config `min_birth_date`). */
  minDate: string;
  /** Formatted price of the full report, for the upsell card. */
  priceLabel: string;
}

/**
 * Free reading: birth date + email + language -> sun sign & year animal with two readings.
 * The result replaces the form on the same page (nothing personal ever goes into the URL).
 */
export function FreeReadingFlow({ locales, minDate, priceLabel }: FreeReadingFlowProps) {
  const t = useTranslations("free");
  const tForm = useTranslations("form");
  const locale = useLocale();
  const hydrated = useHydrated();
  const issueMessage = useIssueMessage();
  const apiErrorMessage = useApiErrorMessage();
  const tFlows = useTranslations("flows");

  const defaultLanguage = locales.some((l) => l.code === locale)
    ? locale
    : (locales[0]?.code ?? locale);
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState(defaultLanguage);
  const [marketing, setMarketing] = useState(false);
  const [issues, setIssues] = useState<FieldIssues<FreeField>>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FreeReadingResult | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const restartedRef = useRef(false);

  // Move focus (and the viewport) to the new view's heading.
  useEffect(() => {
    const target = result
      ? resultHeadingRef.current
      : restartedRef.current
        ? formHeadingRef.current
        : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [result]);

  const today = hydrated ? localToday() : undefined;
  const codes = locales.map((l) => l.code);

  const focusField = (field: FreeField) => {
    const el = formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    el?.focus();
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const bounds = { min: minDate, max: localToday() };
    const found = validateFreeForm({ birthDate, email, language }, bounds, codes);
    setIssues(found);
    setFormError(null);
    const first = firstIssueField(found, FIELD_ORDER);
    if (first) {
      focusField(first);
      return;
    }
    setSubmitting(true);
    try {
      const body: FreeReadingRequest = {
        birth_date: birthDate,
        email: email.trim(),
        locale: language,
        marketing_opt_in: marketing,
      };
      const data = await api.post<FreeReadingResult>("/free-reading", body);
      setResult(data);
    } catch (err) {
      const mapped = mapFreeReadingError(err, bounds);
      if (mapped.kind === "fields") {
        setIssues(mapped.issues);
        const firstApi = firstIssueField(mapped.issues, FIELD_ORDER);
        if (firstApi) focusField(firstApi);
      } else {
        setFormError(mapped.error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    restartedRef.current = true;
    setResult(null);
    setBirthDate("");
    setIssues({});
    setFormError(null);
  }

  if (result) {
    return (
      <BlendResult
        result={result}
        headingRef={resultHeadingRef}
        priceLabel={priceLabel}
        onRestart={restart}
      />
    );
  }

  const waitMinutes = retryAfterMinutes(formError);
  const errorText = formError
    ? waitMinutes
      ? tFlows("rateLimitedWait", { minutes: waitMinutes })
      : apiErrorMessage(formError)
    : null;

  return (
    <Card padding="none" className="mx-auto max-w-2xl overflow-hidden shadow-lift">
      <div className="border-b border-line bg-parchment/60 px-6 py-6 text-center sm:px-10 sm:py-7">
        <h2
          ref={formHeadingRef}
          tabIndex={-1}
          id="free-form-title"
          className="font-serif text-3xl font-semibold text-fg focus:outline-none"
        >
          {t("form.title")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-muted">{t("form.lead")}</p>
      </div>
      <form
        ref={formRef}
        method="post"
        noValidate
        aria-labelledby="free-form-title"
        onSubmit={onSubmit}
        className="space-y-6 px-6 py-7 sm:px-10 sm:py-9"
      >
        <Field
          label={tForm("labels.birthDate")}
          hint={tForm("hints.birthDate")}
          error={issueMessage(issues.birthDate)}
          required
        >
          <DateInput
            name="birthDate"
            value={birthDate}
            min={minDate}
            max={today}
            autoComplete="bday"
            onChange={(e) => {
              setBirthDate(e.target.value);
              if (issues.birthDate) setIssues((prev) => ({ ...prev, birthDate: undefined }));
            }}
          />
        </Field>
        <Field
          label={tForm("labels.email")}
          hint={t("form.emailHint")}
          error={issueMessage(issues.email)}
          required
        >
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            className="text-start rtl:text-end"
            placeholder={tForm("placeholders.email")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (issues.email) setIssues((prev) => ({ ...prev, email: undefined }));
            }}
          />
        </Field>
        <Field
          label={tForm("labels.language")}
          hint={t("form.languageHint")}
          error={issueMessage(issues.language)}
          required
        >
          <Select name="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {locales.map((option) => (
              <option key={option.code} value={option.code} lang={option.code}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          name="marketing"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
          label={tForm("labels.marketingOptIn")}
        />

        {errorText ? <Alert tone="error">{errorText}</Alert> : null}

        <div className="pt-1">
          <Button type="submit" size="lg" fullWidth loading={submitting} icon={<ArrowIcon />}>
            {submitting ? t("form.submitting") : t("form.submit")}
          </Button>
          <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted">
            <Sparkle className="mt-1 size-2.5 shrink-0 text-ornament" />
            <span className="[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2">
              {t.rich("form.privacy", {
                privacy: (chunks) => <Link href="/privacy">{chunks}</Link>,
              })}
            </span>
          </p>
        </div>
      </form>
      <div aria-live="polite" className="sr-only">
        {submitting ? t("form.submitting") : ""}
      </div>
    </Card>
  );
}
