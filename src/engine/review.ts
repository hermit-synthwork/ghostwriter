import type { Story } from "../lib/story.ts";
import type { PanelUrls } from "./compose.ts";
import { setEpisodeStatus } from "../db/episodes.ts";

/** A social hashtag is one token — strip "#", spaces, punctuation; drop empties. */
export function formatHashtags(tags: string[]): string {
  return tags
    .map((t) => t.replace(/^#/, "").replace(/[^\p{L}\p{N}]+/gu, "").trim())
    .filter(Boolean)
    .map((t) => "#" + t)
    .join(" ");
}

/**
 * Mark an episode ready for review: write its caption, tokenised hashtags,
 * canonical story JSON and composed panel URLs onto the episode row. Replaces
 * the old local `review.html` / `caption.txt` / `status.json` bundle.
 */
export async function finalizeEpisode(
  episodeId: string,
  story: Story,
  panelUrls: PanelUrls,
): Promise<void> {
  await setEpisodeStatus(episodeId, "ready", {
    caption: story.caption,
    hashtags: formatHashtags(story.hashtags).split(" ").filter(Boolean),
    storyJson: story,
    panelUrls,
  });
}
