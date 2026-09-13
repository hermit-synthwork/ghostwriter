import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Named explicitly so they're allowed even if a future "*" rule tightens —
// being cited by AI assistants is the point (same reason llms.txt exists).
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Bytespider",
];

// Auth screens and everything behind sign-in.
const DISALLOW = ["/sign-in", "/onboarding", "/episode", "/api"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
