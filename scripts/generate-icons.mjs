import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/web/public");
mkdirSync(dir, { recursive: true });

async function icon(size, file) {
  const bowlY = size * 0.58;
  const svg = `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a5f4a"/>
        <stop offset="100%" stop-color="#0f766e"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" rx="${size * 0.22}" fill="url(#g)"/>
    <ellipse cx="${size / 2}" cy="${bowlY}" rx="${size * 0.28}" ry="${size * 0.12}" fill="#ecfdf5"/>
    <path d="M ${size * 0.28} ${bowlY}
             Q ${size / 2} ${size * 0.82} ${size * 0.72} ${bowlY}
             L ${size * 0.68} ${bowlY + size * 0.02}
             Q ${size / 2} ${size * 0.78} ${size * 0.32} ${bowlY + size * 0.02} Z"
          fill="#bbf7d0"/>
    <circle cx="${size * 0.38}" cy="${size * 0.38}" r="${size * 0.06}" fill="#fde68a"/>
    <circle cx="${size * 0.52}" cy="${size * 0.32}" r="${size * 0.045}" fill="#fca5a5"/>
    <circle cx="${size * 0.62}" cy="${size * 0.4}" r="${size * 0.05}" fill="#93c5fd"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(join(dir, file));
  console.log("wrote", file);
}

await icon(192, "icon-192.png");
await icon(512, "icon-512.png");
