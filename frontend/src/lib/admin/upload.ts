import { formatBytes } from "./format";
import { MEDIA_ACCEPT, MEDIA_MAX_BYTES } from "./types";

/** Client-side checks before `POST /admin/media` (the backend re-validates everything). */
export function validateImageFile(
  file: { type: string; size: number; name?: string },
  maxBytes = MEDIA_MAX_BYTES,
): string | null {
  if (!(MEDIA_ACCEPT as readonly string[]).includes(file.type)) {
    return "Choose a JPEG, PNG, WEBP or GIF image.";
  }
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxBytes) {
    return `The file is ${formatBytes(file.size)}; the maximum is ${formatBytes(maxBytes)}.`;
  }
  return null;
}

/**
 * Accept a pasted image URL the way the API does (`LinkUrl`): a site-relative path (`/api/v1/...`)
 * or an absolute http(s) URL, without spaces/backslashes; max 500 characters.
 */
export function validateImageUrl(value: string): string | null {
  const url = value.trim();
  if (!url) return "Enter a URL.";
  if (url.length > 500) return "The URL is too long (maximum 500 characters).";
  if (/[\s\\\u0000-\u001f\u007f]/.test(url))
    return "The URL must not contain spaces or backslashes.";
  if (url.startsWith("/")) {
    return url.startsWith("//") ? "Use a site path (/…) or an https:// URL." : null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Use a site path (/…) or an https:// URL.";
    }
    return null;
  } catch {
    return "Use a site path (/…) or an https:// URL.";
  }
}
