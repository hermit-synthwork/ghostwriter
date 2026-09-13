"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { STYLES, GENRES, CADENCE_PRESETS, type CadencePreset } from "@/lib/styles";
import { startOnboardingAction } from "./actions";

type Genre = (typeof GENRES)[number]["key"];

const STEPS = ["style", "niche", "genre", "cadence"] as const;
type Step = (typeof STEPS)[number];

export function Wizard() {
  const [step, setStep] = useState<Step>("style");
  const [styleKey, setStyleKey] = useState<string | null>(null);
  const [niche, setNiche] = useState("");
  const [genre, setGenre] = useState<Genre | null>(null);
  const [cadence, setCadence] = useState<CadencePreset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stepIndex = STEPS.indexOf(step);

  function next() {
    setStep(STEPS[stepIndex + 1]!);
  }
  function back() {
    setStep(STEPS[stepIndex - 1]!);
  }

  function submit() {
    if (!styleKey || !genre || !cadence || !niche.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const { authUrl } = await startOnboardingAction({ styleKey, niche: niche.trim(), genre, cadence, tz });
        window.location.href = authUrl;
      } catch {
        setError("Something went wrong starting your account. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-amber-500" : "bg-zinc-800"}`} />
        ))}
      </div>

      {step === "style" && (
        <section className="space-y-4">
          <h1 className="text-lg font-semibold text-zinc-100">Pick a house style</h1>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STYLES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setStyleKey(s.key)}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  styleKey === s.key
                    ? "border-amber-500 bg-amber-500/10"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <Image
                  src={s.previewSrc}
                  alt={s.label}
                  width={600}
                  height={600}
                  className="mb-2 aspect-square w-full rounded object-cover"
                />
                <p className="text-sm font-medium text-zinc-100">{s.label}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{s.blurb}</p>
              </button>
            ))}
          </div>
          <StepNav canNext={!!styleKey} onNext={next} />
        </section>
      )}

      {step === "niche" && (
        <section className="space-y-4">
          <h1 className="text-lg font-semibold text-zinc-100">What&apos;s your account about?</h1>
          <p className="text-sm text-zinc-400">
            A niche or vibe — e.g. &quot;Singapore office life&quot; or &quot;wandering swordsmen&quot;. Every story
            will fit this.
          </p>
          <textarea
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
            placeholder="Describe your account's niche"
          />
          <StepNav canNext={niche.trim().length > 0} onNext={next} onBack={back} />
        </section>
      )}

      {step === "genre" && (
        <section className="space-y-4">
          <h1 className="text-lg font-semibold text-zinc-100">Genre</h1>
          <div className="grid grid-cols-2 gap-3">
            {GENRES.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setGenre(g.key)}
                className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                  genre === g.key
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <StepNav canNext={!!genre} onNext={next} onBack={back} />
        </section>
      )}

      {step === "cadence" && (
        <section className="space-y-4">
          <h1 className="text-lg font-semibold text-zinc-100">How often should it post?</h1>
          <div className="grid grid-cols-3 gap-3">
            {CADENCE_PRESETS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCadence(c.key)}
                className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                  cadence === c.key
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={back} className="text-sm text-zinc-400 hover:text-zinc-200">
              Back
            </button>
            <button
              type="button"
              disabled={!cadence || pending}
              onClick={submit}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
            >
              {pending ? "Setting up…" : "Continue to connect Instagram"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function StepNav({ canNext, onNext, onBack }: { canNext: boolean; onNext: () => void; onBack?: () => void }) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-200">
          Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        disabled={!canNext}
        onClick={onNext}
        className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
