import { join } from "node:path";
import sharp from "sharp";
import { config, type Slot } from "./config.js";
import { nowLabel } from "./dates.js";

export async function processAndSavePhoto(
  input: Buffer,
  feedDate: string,
  slot: Slot,
): Promise<{ relativePath: string; absolutePath: string; jpeg: Buffer }> {
  const label = nowLabel();
  const svg = Buffer.from(
    `<svg width="640" height="56" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.55)"/>
      <text x="16" y="36" font-family="Arial, sans-serif" font-size="24" fill="#fff">${escapeXml(label)} · ${slot}</text>
    </svg>`,
  );

  const jpeg = await sharp(input)
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .composite([{ input: svg, gravity: "southeast" }])
    .jpeg({ quality: 85 })
    .toBuffer();

  const fileName = `${feedDate}-${slot}.jpg`;
  const absolutePath = join(config.photosDir, fileName);
  await sharp(jpeg).toFile(absolutePath);

  return {
    relativePath: fileName,
    absolutePath,
    jpeg,
  };
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
