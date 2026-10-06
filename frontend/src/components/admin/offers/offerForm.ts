/**
 * Offer editor form model: API row ⇄ form values ⇄ create/PATCH bodies, client validation and
 * the list's status (live / scheduled / ended / inactive).
 */
import type {
  Locale,
  OfferAdmin,
  OfferCreate,
  OfferTranslation,
  OfferUpdate,
  Translations,
} from "@/lib/admin/types";
import {
  cleanTranslations,
  diffFields,
  emptyToNull,
  fillTranslations,
  LIMITS,
  parseSortOrder,
  validateLink,
  validateSlug,
  validateTranslations,
  windowError,
} from "../content/forms";

export const OFFER_FIELDS = ["title", "subtitle", "body", "cta_label"] as const;

export interface OfferFormValues {
  slug: string;
  translations: Translations<OfferTranslation>;
  image_url: string | null;
  cta_url: string;
  discount_code_id: number | null;
  show_banner: boolean;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** Text of the number input. */
  sort_order: string;
}

/** Form values for an existing offer, or the defaults of a new one. */
export function offerToForm(offer: OfferAdmin | null, locales: Locale[]): OfferFormValues {
  return {
    slug: offer?.slug ?? "",
    translations: fillTranslations<OfferTranslation>(offer?.translations, locales, OFFER_FIELDS),
    image_url: offer?.image_url ?? null,
    cta_url: offer?.cta_url ?? "",
    discount_code_id: offer?.discount_code_id ?? null,
    // A new offer is active but not a site-wide banner until the editor opts in.
    show_banner: offer?.show_banner ?? false,
    is_active: offer?.is_active ?? true,
    starts_at: offer?.starts_at ?? null,
    ends_at: offer?.ends_at ?? null,
    sort_order: String(offer?.sort_order ?? 0),
  };
}

/** Body of `POST /offers` (also the base of the PATCH diff). */
export function offerPayload(values: OfferFormValues): OfferCreate {
  return {
    slug: values.slug.trim().toLowerCase(),
    translations: cleanTranslations(values.translations),
    image_url: emptyToNull(values.image_url),
    cta_url: emptyToNull(values.cta_url),
    discount_code_id: values.discount_code_id,
    show_banner: values.show_banner,
    is_active: values.is_active,
    starts_at: values.starts_at,
    ends_at: values.ends_at,
    sort_order: parseSortOrder(values.sort_order) ?? 0,
  };
}

/** Changed fields only (`PATCH /offers/{id}`); empty object = nothing to save. */
export function offerPatch(initial: OfferFormValues, values: OfferFormValues): OfferUpdate {
  return diffFields(offerPayload(initial), offerPayload(values));
}

export function validateOffer(
  values: OfferFormValues,
  defaultLocale: Locale,
): Record<string, string> {
  const errors: Record<string, string> = {
    ...validateTranslations<OfferTranslation>(values.translations, {
      defaultLocale,
      maxLengths: {
        title: LIMITS.title,
        subtitle: LIMITS.shortText,
        body: LIMITS.markdown,
        cta_label: LIMITS.label,
      },
    }),
  };
  const slug = validateSlug(values.slug);
  if (slug) errors.slug = slug;
  const cta = validateLink(values.cta_url);
  if (cta) errors.cta_url = cta;
  const window = windowError(values.starts_at, values.ends_at);
  if (window) errors.ends_at = window;
  if (parseSortOrder(values.sort_order) === undefined) {
    errors.sort_order = "Enter a whole number between -1,000,000 and 1,000,000.";
  }
  return errors;
}

export type OfferStatus = "live" | "scheduled" | "ended" | "inactive";

/** Visibility right now: inactive, before its start, after its end, or live. */
export function offerStatus(
  offer: Pick<OfferAdmin, "is_active" | "starts_at" | "ends_at">,
  now: number = Date.now(),
): OfferStatus {
  if (!offer.is_active) return "inactive";
  if (offer.starts_at && Date.parse(offer.starts_at) > now) return "scheduled";
  if (offer.ends_at && Date.parse(offer.ends_at) <= now) return "ended";
  return "live";
}

export const OFFER_STATUS_STYLE: Record<
  OfferStatus,
  { label: string; tone: "success" | "gold" | "neutral" | "warning"; description: string }
> = {
  live: { label: "Live", tone: "success", description: "Visible on the site now." },
  scheduled: { label: "Scheduled", tone: "gold", description: "Goes live at its start date." },
  ended: { label: "Ended", tone: "warning", description: "Its end date has passed." },
  inactive: { label: "Inactive", tone: "neutral", description: "Hidden: switched off." },
};

/** Default-locale title, falling back to any title and then the slug. */
export function offerTitle(
  offer: Pick<OfferAdmin, "translations" | "slug">,
  defaultLocale: Locale,
): string {
  const translations = offer.translations as Record<string, { title?: string } | undefined>;
  const own = translations[defaultLocale]?.title?.trim();
  if (own) return own;
  const any = Object.values(translations)
    .find((entry) => entry?.title?.trim())
    ?.title?.trim();
  return any || offer.slug;
}
