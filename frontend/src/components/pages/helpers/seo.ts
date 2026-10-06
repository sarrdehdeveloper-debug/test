/**
 * Structured data and sharing helpers (pure; the site origin is passed in).
 */

/**
 * JSON for an inline `<script type="application/ld+json">`. JSON.stringify alone is not safe in
 * HTML: a CMS value containing `</script>` would end the script element. `<`, `>` and `&` are
 * written as \u escapes (still valid JSON), as are U+2028/U+2029 (line terminators in old JS).
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Absolute URL for a site path or API media URL; absolute http(s) URLs are returned unchanged. */
export function absoluteUrl(pathOrUrl: string, origin: string): string {
  try {
    return new URL(pathOrUrl, `${origin.replace(/\/+$/, "")}/`).href;
  } catch {
    return pathOrUrl;
  }
}

export interface ArticleJsonLdInput {
  url: string;
  headline: string;
  description?: string;
  image?: string;
  datePublished?: string | null;
  authorName?: string;
  /** Organisation publishing the site (brand name) and its logo URL. */
  publisherName: string;
  publisherLogo: string;
  inLanguage: string;
}

/** schema.org Article for a blog post. The author is the brand (Organization) when names match. */
export function articleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const author = input.authorName?.trim();
  const publisher = {
    "@type": "Organization",
    name: input.publisherName,
    logo: { "@type": "ImageObject", url: input.publisherLogo },
  };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    url: input.url,
    headline: input.headline.slice(0, 110),
    ...(input.description ? { description: input.description } : {}),
    ...(input.image ? { image: [input.image] } : {}),
    ...(input.datePublished
      ? { datePublished: input.datePublished, dateModified: input.datePublished }
      : {}),
    author: author
      ? author === input.publisherName
        ? { "@type": "Organization", name: author }
        : { "@type": "Person", name: author }
      : { "@type": "Organization", name: input.publisherName },
    publisher,
    inLanguage: input.inLanguage,
  };
}

export type ShareNetwork = "x" | "facebook" | "whatsapp" | "linkedin" | "email";

export interface ShareLink {
  network: ShareNetwork;
  href: string;
}

/** Plain share links (no third-party scripts, so the CSP stays strict). */
export function shareLinks(url: string, title: string): ShareLink[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { network: "x", href: `https://x.com/intent/post?url=${u}&text=${t}` },
    { network: "facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { network: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}` },
    { network: "linkedin", href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { network: "email", href: `mailto:?subject=${t}&body=${u}` },
  ];
}

/** Slugs the API can return (backend: lower-case letters, digits and '-', 2–160 chars). */
export function isValidSlug(value: string): boolean {
  return /^[a-z0-9-]{2,160}$/.test(value);
}
