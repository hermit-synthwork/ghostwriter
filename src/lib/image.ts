import sharp from "sharp";

export const W = 1080;
export const H_916 = 1920;
export const H_45 = 1350;

/** Resize any raw panel to exactly 1080x1920, cover-cropping as needed. */
export async function normalize916(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(W, H_916, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
}

/**
 * Center-crop a 1080x1920 buffer to 1080x1350 (4:5).
 * The art brief keeps key action in the central 80%, so a vertical
 * center crop is safe.
 */
export async function crop45(buf916: Buffer): Promise<Buffer> {
  const top = Math.round((H_916 - H_45) / 2); // 285
  return sharp(buf916)
    .extract({ left: 0, top, width: W, height: H_45 })
    .png()
    .toBuffer();
}

/** Composite an SVG overlay (same pixel size as the base) onto a base PNG. */
export async function overlay(base: Buffer, svg: string): Promise<Buffer> {
  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/** Flat-color PNG — used for offline placeholder panels in tests/dev. */
export async function solid(
  w: number,
  h: number,
  rgb: { r: number; g: number; b: number },
): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: rgb },
  })
    .png()
    .toBuffer();
}
