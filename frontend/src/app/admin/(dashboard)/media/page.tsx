import type { Metadata } from "next";
import { MediaView } from "./MediaView";

export const metadata: Metadata = { title: "Media" };

/** /admin/media — uploaded images (editors and up). */
export default function MediaPage() {
  return <MediaView />;
}
