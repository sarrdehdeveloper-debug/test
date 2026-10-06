import { notFound } from "next/navigation";

/**
 * Unknown paths below a locale render the localized not-found page inside the site layout.
 * Keep this route OUTSIDE the (site) group: a loading.tsx above it would stream the response and
 * turn the 404 status into 200.
 */
export default function CatchAllPage() {
  notFound();
}
