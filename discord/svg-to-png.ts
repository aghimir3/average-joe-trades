/**
 * Converts all SVGs in discord/assets/ to PNGs
 * Usage: npx tsx discord/svg-to-png.ts
 */
import sharp from 'sharp';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

async function main() {
  const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'assets');
  const svgFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.svg'));

  if (svgFiles.length === 0) {
    console.log('No SVG files found in discord/assets/');
    return;
  }

  for (const svgFile of svgFiles) {
    const svgPath = resolve(assetsDir, svgFile);
    const pngFile = svgFile.replace(/\.svg$/, '.png');
    const pngPath = resolve(assetsDir, pngFile);
    const svgBuffer = readFileSync(svgPath);

    // Use 512x512 for avatars/logos, 960x540 for banners
    const isBanner = svgFile.includes('banner');
    const width = isBanner ? 960 : 512;
    const height = isBanner ? 540 : 512;

    await sharp(svgBuffer).resize(width, height).png().toFile(pngPath);
    console.log(`${svgFile} → ${pngFile} (${width}x${height})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
