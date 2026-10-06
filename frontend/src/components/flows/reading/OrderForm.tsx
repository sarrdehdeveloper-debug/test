"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Alert } from "@/components/ui/Alert";
import { ArrowIcon, Button } from "@/components/ui/Button";
import { Checkbox, DateInput, Field, Input, TimeInput } from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useApiErrorMessage } from "@/lib/api/useApiErrorMessage";
import { DISCOUNT_IDLE, discountReducer, priceBreakdown } from "@/lib/flows/discount";
import { mapOrderError, retryAfterMinutes } from "@/lib/flows/errors";
import { resolveCheckoutUrl } from "@/lib/flows/report";
import { saveOrderToken } from "@/lib/flows/storage";
import {
  cleanDisplayName,
  firstIssueField,
  localToday,
  normalizeDiscountCode,
  normalizeTime,
  validateOrderForm,
  type FieldIssues,
  type OrderField,
} from "@/lib/flows/validation";
import type { City, OrderCreate, OrderCreated, Quote } from "@/lib/types";
import { useHydrated } from "../hooks";
import { useIssueMessage } from "../useIssueMessage";
import type { CountryOption } from "@/lib/flows/geo";
import { BirthplaceFields } from "./BirthplaceFields";
import { DiscountField } from "./DiscountField";
import { FormSection } from "./FormSection";
import { PriceSummary } from "./PriceSummary";
import { TimeResolution, type TimeProblem } from "./TimeResolution";

const FIELD_ORDER: readonly OrderField[] = [
  "displayName",
  "email",
  "emailConfirm",
  "birthDate",
  "birthTime",
  "country",
  "city",
  "discountCode",
  "acceptTerms",
];

export interface OrderFormProps {
  minDate: string;
  listPriceCents: number;
  currency: string;
  countries: CountryOption[] | null;
}

type Phase = "idle" | "submitting" | "redirecting";

/** Paid report form: birth data + birthplace + email + discount -> POST /orders -> checkout. */
export function OrderForm({ minDate, listPriceCents, currency, countries }: OrderFormProps) {
  const t = useTranslations("reading");
  const tForm = useTranslations("form");
  const tFlows = useTranslations("flows");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const hydrated = useHydrated();
  const issueMessage = useIssueMessage();
  const apiErrorMessage = useApiErrorMessage();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const [issues, setIssues] = useState<FieldIssues<OrderField>>({});
  const [placeError, setPlaceError] = useState(false);
  const [formError, setFormError] = useState<unknown>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [timeProblem, setTimeProblem] = useState<TimeProblem | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [discount, dispatchDiscount] = useReducer(discountReducer, DISCOUNT_IDLE);
  const [fromLink, setFromLink] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // Prefill the code of an offer link (/reading?code=SAVE10), once per distinct code.
  const seededCodeRef = useRef<string | null>(null);
  const seedCode = useCallback((raw: string | null) => {
    const code = normalizeDiscountCode(raw ?? "");
    if (!code || code.length > 64 || seededCodeRef.current === code) return;
    seededCodeRef.current = code;
    setCodeInput(code);
    setShowDiscount(true);
    setFromLink(code);
    dispatchDiscount({ type: "apply", code });
  }, []);

  // Ask the API for a quote whenever a code enters the "checking" state.
  const checkingCode = discount.status === "checking" ? discount.code : null;
  useEffect(() => {
    if (!checkingCode) return;
    const controller = new AbortController();
    api
      .post<Quote>("/orders/quote", { discount_code: checkingCode }, { signal: controller.signal })
      .then((quote) => dispatchDiscount({ type: "quoted", code: checkingCode, quote }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        dispatchDiscount({ type: "failed", code: checkingCode, error });
      });
    return () => controller.abort();
  }, [checkingCode]);

  const price = priceBreakdown(discount, { cents: listPriceCents, currency });
  const busy = phase !== "idle";
  const bounds = () => ({ min: minDate, max: localToday() });

  const clearIssue = (field: OrderField) => {
    if (issues[field]) setIssues((prev) => ({ ...prev, [field]: undefined }));
  };
  /** Birth data changed: a pending daylight-saving question no longer applies. */
  const birthChanged = () => setTimeProblem(null);

  const focusField = (field: OrderField) => {
    // Controls are found by their `name`; the city combobox input has none (hidden input has it).
    const selector = field === "city" ? '[role="combobox"]' : `[name="${field}"]`;
    const el = formRef.current?.querySelector<HTMLElement>(selector);
    el?.focus();
  };

  async function submit(overrides: { fold?: 0 | 1; time?: string } = {}) {
    if (busy) return;
    const time = overrides.time ?? birthTime;
    const range = bounds();
    const found = validateOrderForm(
      {
        displayName,
        email,
        emailConfirm,
        birthDate,
        birthTime: time,
        country,
        cityId: city?.id ?? null,
        discountCode: codeInput,
        acceptTerms,
      },
      range,
    );
    setIssues(found);
    setFormError(null);
    setPlaceError(false);
    const first = firstIssueField(found, FIELD_ORDER);
    setShowSummary(Boolean(first));
    if (first || !city) {
      if (first) focusField(first);
      return;
    }

    const code = discount.status === "applied" ? discount.code : normalizeDiscountCode(codeInput);
    const body: OrderCreate = {
      email: email.trim(),
      locale,
      display_name: cleanDisplayName(displayName) || null,
      birth_date: birthDate,
      birth_time: normalizeTime(time),
      city_id: city.id,
      time_fold: overrides.fold ?? null,
      discount_code: code,
      marketing_opt_in: marketing,
      accept_terms: acceptTerms,
    };

    setPhase("submitting");
    try {
      const created = await api.post<OrderCreated>("/orders", body);
      // If storage is blocked the visitor still gets the emailed link; the checkout works anyway.
      saveOrderToken(created.order_id, created.access_token);
      setPhase("redirecting");
      window.location.assign(resolveCheckoutUrl(created.checkout_url, window.location.origin));
    } catch (err) {
      setPhase("idle");
      const mapped = mapOrderError(err, range);
      switch (mapped.kind) {
        case "ambiguousTime":
          setTimeProblem({ kind: "ambiguous", time: body.birth_time, options: mapped.options });
          break;
        case "nonexistentTime":
          setTimeProblem({
            kind: "nonexistent",
            time: body.birth_time,
            suggested: mapped.suggestedTime,
          });
          break;
        case "fields": {
          setIssues(mapped.issues);
          setShowSummary(true);
          const firstApi = firstIssueField(mapped.issues, FIELD_ORDER);
          if (firstApi) focusField(firstApi);
          break;
        }
        case "discount":
          setShowDiscount(true);
          dispatchDiscount({ type: "rejected", code: code ?? "", reason: mapped.reason });
          requestAnimationFrame(() => focusField("discountCode"));
          break;
        case "invalidPlace":
          setPlaceError(true);
          focusField("city");
          break;
        default:
          setFormError(mapped.error);
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  const waitMinutes = retryAfterMinutes(formError);
  const formErrorText = formError
    ? waitMinutes
      ? tFlows("rateLimitedWait", { minutes: waitMinutes })
      : isApiError(formError) &&
          (formError.code === "payment_unavailable" || formError.code === "payment_provider_error")
        ? t("errors.payment")
        : apiErrorMessage(formError)
    : null;

  const cityError =
    issueMessage(issues.city) ?? (placeError ? t("errors.invalidPlace") : undefined);
  const isFree = price.totalCents === 0;
  const submitLabel =
    phase === "redirecting"
      ? t("redirecting")
      : phase === "submitting"
        ? t("submitting")
        : isFree
          ? t("submitFree")
          : t("submit");

  return (
    <form
      ref={formRef}
      method="post"
      noValidate
      aria-labelledby="order-form-title"
      onSubmit={onSubmit}
      className="space-y-10"
    >
      <Suspense fallback={null}>
        <UrlCodeReader onCode={seedCode} />
      </Suspense>
      <header>
        <h2 id="order-form-title" className="font-serif text-3xl font-semibold text-fg">
          {t("formTitle")}
        </h2>
        <p className="mt-1.5 text-muted">{t("formLead")}</p>
      </header>

      <FormSection id="order-you" index={1} title={t("sections.you")}>
        <Field
          label={t("fields.firstName")}
          hint={t("fields.firstNameHint")}
          optionalLabel={tForm("optional")}
          error={issueMessage(issues.displayName)}
        >
          <Input
            name="displayName"
            autoComplete="given-name"
            placeholder={t("fields.firstNamePlaceholder")}
            value={displayName}
            disabled={busy}
            onChange={(e) => {
              setDisplayName(e.target.value);
              clearIssue("displayName");
            }}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={tForm("labels.email")}
            hint={t("fields.emailHint")}
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
              disabled={busy}
              onChange={(e) => {
                setEmail(e.target.value);
                clearIssue("email");
              }}
            />
          </Field>
          <Field
            label={t("fields.emailConfirm")}
            error={issueMessage(issues.emailConfirm)}
            required
          >
            <Input
              name="emailConfirm"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              className="text-start rtl:text-end"
              placeholder={tForm("placeholders.email")}
              value={emailConfirm}
              disabled={busy}
              onChange={(e) => {
                setEmailConfirm(e.target.value);
                clearIssue("emailConfirm");
              }}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection id="order-birth" index={2} title={t("sections.birth")}>
        <div className="grid items-start gap-5 sm:grid-cols-2">
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
              max={hydrated ? localToday() : undefined}
              autoComplete="bday"
              disabled={busy}
              onChange={(e) => {
                setBirthDate(e.target.value);
                clearIssue("birthDate");
                birthChanged();
              }}
            />
          </Field>
          <Field
            label={tForm("labels.birthTime")}
            hint={t("fields.birthTimeHint")}
            error={issueMessage(issues.birthTime)}
            required
          >
            <TimeInput
              name="birthTime"
              value={birthTime}
              disabled={busy}
              onChange={(e) => {
                setBirthTime(e.target.value);
                clearIssue("birthTime");
                birthChanged();
              }}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection id="order-place" index={3} title={t("sections.place")}>
        <BirthplaceFields
          initialCountries={countries}
          country={country}
          city={city}
          disabled={busy}
          onCountryChange={(code) => {
            setCountry(code);
            clearIssue("country");
            setPlaceError(false);
            birthChanged();
          }}
          onCityChange={(next) => {
            setCity(next);
            if (next) clearIssue("city");
            setPlaceError(false);
            birthChanged();
          }}
          countryError={issueMessage(issues.country)}
          cityError={cityError}
        />
      </FormSection>

      <FormSection id="order-checkout" index={4} title={t("sections.checkout")}>
        <DiscountField
          open={showDiscount}
          onOpen={() => setShowDiscount(true)}
          value={codeInput}
          state={discount}
          fromLink={fromLink}
          disabled={busy}
          issue={issueMessage(issues.discountCode)}
          onChange={(value) => {
            setCodeInput(value);
            setFromLink(null);
            clearIssue("discountCode");
            dispatchDiscount({ type: "edit" });
          }}
          onApply={() =>
            dispatchDiscount({ type: "apply", code: normalizeDiscountCode(codeInput) })
          }
          onRemove={() => {
            setCodeInput("");
            setFromLink(null);
            dispatchDiscount({ type: "remove" });
          }}
        />

        <PriceSummary price={price} pending={discount.status === "checking"} />

        <div className="space-y-4">
          <Checkbox
            name="acceptTerms"
            checked={acceptTerms}
            disabled={busy}
            required
            onChange={(e) => {
              setAcceptTerms(e.target.checked);
              clearIssue("acceptTerms");
            }}
            error={issueMessage(issues.acceptTerms)}
            label={tForm.rich("labels.acceptTerms", {
              // New tab: the visitor keeps what they typed in the form.
              terms: (chunks) => (
                <Link href="/terms" target="_blank" rel="noopener">
                  {chunks}
                  <span className="sr-only"> {tCommon("opensInNewTab")}</span>
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" target="_blank" rel="noopener">
                  {chunks}
                  <span className="sr-only"> {tCommon("opensInNewTab")}</span>
                </Link>
              ),
            })}
          />
          <Checkbox
            name="marketing"
            checked={marketing}
            disabled={busy}
            onChange={(e) => setMarketing(e.target.checked)}
            label={tForm("labels.marketingOptIn")}
          />
        </div>

        {timeProblem ? (
          <TimeResolution
            problem={timeProblem}
            busy={phase === "submitting"}
            onChooseFold={(fold) => void submit({ fold })}
            onUseTime={(time) => {
              setBirthTime(time);
              void submit({ time });
            }}
          />
        ) : null}

        {showSummary && Object.values(issues).some(Boolean) ? (
          <Alert tone="error">{t("errorSummary")}</Alert>
        ) : null}
        {formErrorText ? <Alert tone="error">{formErrorText}</Alert> : null}

        <div>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={busy}
            icon={<ArrowIcon />}
            className="whitespace-normal"
          >
            {submitLabel}
          </Button>
          <p className="mt-4 flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted">
            <LockIcon />
            <span>{isFree ? t("freeNote") : t("secureNote")}</span>
          </p>
        </div>
        <div aria-live="polite" className="sr-only">
          {phase === "idle" ? "" : submitLabel}
        </div>
      </FormSection>
    </form>
  );
}

/**
 * Reads `?code=` with useSearchParams inside its own Suspense boundary: the form itself stays
 * prerendered, and the code is also picked up after client-side navigations (offer links).
 */
function UrlCodeReader({ onCode }: { onCode: (code: string | null) => void }) {
  const code = useSearchParams().get("code");
  useEffect(() => {
    onCode(code);
  }, [code, onCode]);
  return null;
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="mt-px size-3.5 shrink-0 text-gold-deep"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
