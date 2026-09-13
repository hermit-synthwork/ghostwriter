import Image from "next/image";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { STYLES } from "@/lib/styles";

export const metadata = buildMetadata({
  title: "About",
  description:
    "What Ghostwriter is, how it makes and posts original comic stories, and why a steady rhythm of entertaining posts matters.",
  path: "/about",
});

const STEPS = [
  {
    title: "You set the direction",
    body: "Pick a house art style, describe what your account is about, choose a genre, and decide how often to post.",
  },
  {
    title: "Ghostwriter makes each episode",
    body: "On every scheduled day it writes a fresh 6–8 panel story, draws it in your chosen style with a consistent cast, and letters it.",
  },
  {
    title: "It posts on your schedule",
    body: "The finished carousel goes to your Instagram with a caption and hashtags. No drafting, no design files, no approval step.",
  },
];

const RHYTHM = [
  {
    title: "More chances to be seen",
    body: "Every post is another moment when someone scrolling might come across your account. An account that posts once a month offers that chance once a month.",
  },
  {
    title: "People learn when to expect you",
    body: "A steady rhythm gives followers a reason to check back — the same way people used to look forward to the next strip in the Sunday paper.",
  },
  {
    title: "Consistency is the hard part",
    body: "Writing and drawing a new story every few days is exhausting, which is why most accounts go quiet. Ghostwriter does the making, so your rhythm doesn't depend on your free time.",
  },
];

const ENTERTAIN = [
  {
    title: "Attention is earned post by post",
    body: "Viewers decide in a second whether to stop or keep scrolling. Past success doesn't buy the next swipe — each post has to be worth someone's time on its own.",
  },
  {
    title: "A story gives people a reason to swipe",
    body: "Every episode opens with a hook in the first panel and lands a twist, a punchline, or a decisive turn in the last. The question in panel one is what carries people to the end.",
  },
  {
    title: "Entertainment is what people come back for",
    body: "Audiences return to accounts that make them laugh, feel a chill, or wonder what happens next. Posts that only ask for something tend to get scrolled past.",
  },
];

export default function AboutPage() {
  return (
    <article className="space-y-14 pb-10">
      <header className="space-y-4 pt-4">
        <p className="text-sm font-medium text-amber-400">About Ghostwriter</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Original comic stories for your feed, written and drawn for you
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-300">
          Ghostwriter turns an Instagram account into a place people visit for stories. It writes short, original
          comics — funny, horror, or wuxia — illustrates them in one consistent house style, and posts them as
          swipeable carousels on the schedule you choose.
        </p>
        <Link
          href="/sign-up"
          className="inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Start your comic feed
        </Link>
      </header>

      <Section title="How it works">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs font-semibold text-amber-400">Step {i + 1}</p>
              <h3 className="mt-1 font-semibold text-zinc-100">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="Why posting regularly helps"
        intro="Showing up often isn't a trick — it's how an account stays present in people's feeds and in their habits."
      >
        <Points items={RHYTHM} />
      </Section>

      <Section
        title="Why keeping viewers entertained matters"
        intro="Posting often only helps if each post is worth watching. That's why every Ghostwriter episode is built as a story, not an advert."
      >
        <Points items={ENTERTAIN} />
      </Section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="font-semibold text-zinc-100">What we don&apos;t promise</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-300">
          Ghostwriter doesn&apos;t guarantee followers, views, likes, or growth of any kind. How an account performs
          depends on its niche, its audience, and how each platform decides to show posts — which changes often and is
          outside anyone&apos;s control. What Ghostwriter does is keep your account posting original, entertaining
          stories on a regular schedule.
        </p>
      </section>

      <Section title="Five house styles" intro="Each account picks one, so every episode looks like it belongs to the same series.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {STYLES.map((s) => (
            <li key={s.key}>
              <Image
                src={s.previewSrc}
                alt={`${s.label} house style sample`}
                width={600}
                height={600}
                className="aspect-square w-full rounded-md object-cover ring-1 ring-zinc-800"
              />
              <p className="mt-1.5 text-sm font-medium text-zinc-200">{s.label}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Our content standards">
        <ul className="space-y-2 text-sm leading-relaxed text-zinc-300">
          <li>Original characters and stories only — never adaptations of existing comics, films, novels, or creators.</li>
          <li>PG-13 and platform-safe: horror works through dread and implication, never gore; action is stylized and bloodless.</li>
          <li>No real named people or brands, no hate speech, and no sexual content.</li>
        </ul>
      </Section>

      <section className="space-y-3 border-t border-zinc-800 pt-8">
        <h2 className="text-xl font-semibold text-zinc-100">Ready to give your followers something to look forward to?</h2>
        <Link
          href="/sign-up"
          className="inline-block rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Start your comic feed
        </Link>
      </section>
    </article>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
        {intro && <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="space-y-4">
      {items.map((p) => (
        <li key={p.title} className="border-l-2 border-amber-500/60 pl-4">
          <h3 className="font-semibold text-zinc-100">{p.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}
