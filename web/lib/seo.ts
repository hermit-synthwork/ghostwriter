import type { Metadata } from "next";

/** The one place the public origin lives — robots, sitemap, llms.txt and every
 *  page's metadata read it from here so they can't drift apart. */
export const SITE_URL = "https://review.synthwork.app";
export const SITE_NAME = "Ghostwriter";
export const SITE_TAGLINE = "Comic stories on autopilot";
export const SITE_DESCRIPTION =
  "Original comic stories — funny, horror, or wuxia — written, drawn, and posted to your Instagram automatically.";

const OG_IMAGE = {
  url: "/og.jpg",
  width: 1200,
  height: 630,
  alt: "Ghostwriter — original comic stories posted to your Instagram automatically",
};

/**
 * Build a page's full metadata. Next.js merges metadata shallowly: a page that
 * declares its own `openGraph` replaces the layout's object and silently drops
 * `images`. Every page goes through this helper so the share card can't fall off.
 */
export function buildMetadata({
  title,
  description = SITE_DESCRIPTION,
  path,
}: { title?: string; description?: string; path?: string } = {}): Metadata {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — ${SITE_TAGLINE}`;
  return {
    metadataBase: new URL(SITE_URL),
    title: fullTitle,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      ...(path ? { url: path } : {}),
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}
