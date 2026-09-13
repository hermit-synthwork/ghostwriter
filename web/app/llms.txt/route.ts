import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/lib/seo";
import { STYLES, GENRES, CADENCE_PRESETS } from "@/lib/styles";

export const dynamic = "force-static";

// llmstxt.org format. The site has only two public pages (sign-up, about), so
// the substance lives in the content sections. Pricing is deliberately not written here — it
// comes from Stripe and changes (founding promo), so point at the page instead.
export function GET() {
  const list = (items: readonly { label: string }[]) => items.map((i) => i.label).join(", ");

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} is a self-serve service for growing an Instagram account with serialized comics. A subscriber picks a house art style, describes their account's niche, chooses a genre and a posting cadence, and connects their Instagram. From then on ${SITE_NAME} writes a fresh, original 6–8 panel story on each scheduled day, illustrates it in the chosen style, letters it, and publishes it as an Instagram carousel with a caption and hashtags — no drafting or approval needed from the subscriber.

## Pages

- [Sign up](${SITE_URL}/sign-up): create an account, set up a comic feed, and see current pricing
- [About](${SITE_URL}/about): what Ghostwriter does, why a regular posting rhythm and entertaining stories matter, and what it does not promise

## Examples

- [@bennysynthwork on Instagram](https://www.instagram.com/bennysynthwork/): everyday Singapore comedy told in Singlish, plus anime school-life stories
- [@manhuajianghuart on Instagram](https://www.instagram.com/manhuajianghuart/): wuxia tales of wandering swordsmen and rival sects, told in Chinese

## How it works

- Story: each episode is an original short story with a hook in panel 1 and a twist, punchline, or decisive turn in the last panel. Fresh cast every episode.
- Art: every panel is drawn in one consistent house style, with a per-episode character sheet so the cast stays on-model across panels.
- Publishing: carousels post to an Instagram Business or Creator account linked to a Facebook Page, on the subscriber's schedule.

## Options

- House styles: ${list(STYLES)}
- Genres: ${list(GENRES)}
- Posting cadence: ${list(CADENCE_PRESETS)}

## Content standards

- Original characters and stories only — no adaptations of existing comics, films, novels, or creators.
- PG-13 and platform-safe: horror relies on dread and implication, never gore; martial arts is stylized and bloodless.
- No real named people or brands, hate speech, or sexual content.
`;

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
