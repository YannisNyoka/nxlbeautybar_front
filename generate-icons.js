/**
 * generate-icons.js
 * Run once: node generate-icons.js
 * Requires: npm install sharp
 *
 * Place this file in your project root.
 * It reads public/Logo.jpeg and generates all PWA icon sizes
 * into public/icons/
 */

const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');

const INPUT  = path.join(__dirname, 'public', 'Logo.jpeg');
const OUTDIR = path.join(__dirname, 'public', 'icons');

if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

async function generate() {
  console.log('Generating PWA icons from', INPUT);

  for (const size of SIZES) {
    const outFile = path.join(OUTDIR, `icon-${size}.png`);
    await sharp(INPUT)
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(outFile);
    console.log(`  ✓ icon-${size}.png`);
  }

  // Maskable icons (with safe-zone padding — 20% on each side)
  for (const size of [192, 512]) {
    const padded = Math.round(size * 0.6); // inner icon fills 60% of canvas
    const outFile = path.join(OUTDIR, `icon-maskable-${size}.png`);
    await sharp(INPUT)
      .resize(padded, padded, { fit: 'cover', position: 'centre' })
      .extend({
        top:    Math.round(size * 0.2),
        bottom: Math.round(size * 0.2),
        left:   Math.round(size * 0.2),
        right:  Math.round(size * 0.2),
        background: { r: 61, g: 31, b: 21, alpha: 1 }, // #3d1f15 brand dark
      })
      .png()
      .toFile(outFile);
    console.log(`  ✓ icon-maskable-${size}.png`);
  }

  console.log('\n✅ All icons generated in public/icons/');
  console.log('   Commit the public/icons/ folder and redeploy.');
}

generate().catch(err => { console.error('Error:', err.message); process.exit(1); });