import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { loadEnv, requireEnv, REPO_ROOT } from "./lib/env.ts";

/**
 * Current Gemini image model ("Nano Banana"). Override with GEMINI_IMAGE_MODEL.
 * Confirm the id against https://ai.google.dev/gemini-api/docs/image-generation
 * if generation 404s.
 */
export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

const KEY_HINT =
  "Get a key at https://aistudio.google.com/apikey (free tier works). Var: GEMINI_API_KEY";

export interface RefImage {
  data: Buffer;
  mimeType: string; // e.g. "image/png"
}

export interface GenResult {
  png: Buffer;
  model: string;
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (client) return client;
  loadEnv();
  const apiKey = requireEnv("GEMINI_API_KEY", KEY_HINT);
  client = new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Generate one image. `refs` are passed as inline image parts before the
 * text prompt, which the model uses for style / character consistency.
 */
export async function generateImage(
  prompt: string,
  refs: RefImage[] = [],
  aspectRatio: "9:16" | "1:1" | "16:9" = "9:16",
): Promise<GenResult> {
  const ai = getClient();
  const parts: Record<string, unknown>[] = [
    ...refs.map((r) => ({
      inlineData: { data: r.data.toString("base64"), mimeType: r.mimeType },
    })),
    { text: prompt },
  ];

  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: [{ role: "user", parts }],
        config: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio },
        },
      });
      const outParts = res.candidates?.[0]?.content?.parts ?? [];
      for (const p of outParts) {
        const inline = (p as { inlineData?: { data?: string } }).inlineData;
        if (inline?.data) {
          return { png: Buffer.from(inline.data, "base64"), model: IMAGE_MODEL };
        }
      }
      throw new Error(
        "No image in response. " +
          (res.candidates?.[0]?.finishReason
            ? `finishReason=${res.candidates[0].finishReason}`
            : JSON.stringify(res).slice(0, 400)),
      );
    } catch (err) {
      lastErr = err;
      const wait = attempt * 4000;
      console.warn(`  gen attempt ${attempt}/3 failed: ${(err as Error).message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw new Error(`Image generation failed after 3 attempts: ${(lastErr as Error)?.message}`);
}

/* --------------------------- smoke test --------------------------- */

if (process.argv.includes("--smoke")) {
  const out = join(REPO_ROOT, "assets", "smoke.png");
  const { png, model } = await generateImage(
    "A single matte-ink test illustration of a paper lantern in fog, muted teal and bone palette, heavy black border.",
    [],
    "9:16",
  );
  writeFileSync(out, png);
  // report real dimensions
  const sharp = (await import("sharp")).default;
  const meta = await sharp(png).metadata();
  console.log(`✓ ${model} → ${out}  (${meta.width}x${meta.height}, ${png.length} bytes)`);
}
