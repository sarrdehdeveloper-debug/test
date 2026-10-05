import Image, { type ImageProps } from "next/image";

/**
 * Image coming from the API/CMS (`/api/v1/media/...` or an absolute URL). The API already serves
 * these with long cache headers, so they bypass the Next.js optimizer (`unoptimized`), which also
 * means no remotePatterns configuration is needed.
 */
export function MediaImage(props: ImageProps) {
  // eslint-disable-next-line jsx-a11y/alt-text -- alt is passed through by the caller
  return <Image unoptimized {...props} />;
}
