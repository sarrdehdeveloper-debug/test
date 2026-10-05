import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zodiac Blend",
    short_name: "Zodiac Blend",
    description: "Western astrology and the Chinese zodiac, blended into one reading.",
    start_url: "/",
    display: "standalone",
    background_color: "#0E1726",
    theme_color: "#0E1726",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
