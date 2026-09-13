import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Only pages a signed-out visitor can actually read; everything else redirects
// to sign-in, which robots.ts disallows.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/sign-up`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
