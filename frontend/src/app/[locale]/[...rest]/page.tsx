import { notFound } from "next/navigation";

/** Unknown paths below a locale render the localized not-found page inside the site layout. */
export default function CatchAllPage() {
  notFound();
}
