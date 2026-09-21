import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function createPng(width, height, getPixel) {
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const pxOffset = rowOffset + 1 + x * 4;
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const typeBuf = Buffer.from(type, "ascii");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeAndData = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    const crcVal = zlib.crc32(typeAndData);
    crc.writeUInt32BE(crcVal >>> 0, 0);

    return Buffer.concat([length, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressedData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function renderTrounceIcon(size, isMaskable = false) {
  // Waveform heights (normalized -1 to 1 or bar heights 0 to 1)
  const barHeights = [0.28, 0.52, 0.85, 1.0, 0.72, 0.45, 0.22];
  const numBars = barHeights.length;
  const barWidth = size * 0.055;
  const barGap = size * 0.035;
  const totalWaveWidth = numBars * barWidth + (numBars - 1) * barGap;
  const startX = (size - totalWaveWidth) / 2;
  const centerY = size * 0.55;
  const maxBarHalfHeight = size * 0.26;

  // Signal dot position
  const dotX = size * 0.5;
  const dotY = size * 0.22;
  const dotRadius = size * 0.055;

  return createPng(size, size, (x, y) => {
    // Background: #100E0C (R:16, G:14, B:12)
    let r = 16;
    let g = 14;
    let b = 12;
    let a = 255;

    if (!isMaskable) {
      // Rounded corner squircle for standard icons
      const cornerRadius = size * 0.22;
      const dx = Math.max(0, Math.abs(x - size / 2) - (size / 2 - cornerRadius));
      const dy = Math.max(0, Math.abs(y - size / 2) - (size / 2 - cornerRadius));
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > cornerRadius) {
        return [0, 0, 0, 0];
      }
      if (dist > cornerRadius - 1) {
        const edgeAlpha = Math.max(0, Math.min(1, cornerRadius - dist));
        a = Math.round(255 * edgeAlpha);
      }
    }

    // Glowing signal dot
    const distToDot = Math.hypot(x - dotX, y - dotY);
    if (distToDot < dotRadius) {
      // Main dot (#3FB8AF -> 63, 184, 175)
      const edge = Math.max(0, Math.min(1, dotRadius - distToDot));
      return [
        Math.round(r + (63 - r) * edge),
        Math.round(g + (184 - g) * edge),
        Math.round(b + (175 - b) * edge),
        a,
      ];
    } else if (distToDot < dotRadius * 2.2) {
      // Soft glow around dot
      const glowFactor = (1 - (distToDot - dotRadius) / (dotRadius * 1.2)) * 0.35;
      return [
        Math.round(r + (63 - r) * glowFactor),
        Math.round(g + (184 - g) * glowFactor),
        Math.round(b + (175 - b) * glowFactor),
        a,
      ];
    }

    // Check waveform bars
    for (let i = 0; i < numBars; i++) {
      const bx = startX + i * (barWidth + barGap);
      const bHeight = barHeights[i] * maxBarHalfHeight;
      const byMin = centerY - bHeight;
      const byMax = centerY + bHeight;

      if (x >= bx && x <= bx + barWidth && y >= byMin && y <= byMax) {
        // Rounded caps for bars
        const capRadius = barWidth / 2;
        const centerXBar = bx + capRadius;
        let inside = true;

        if (y < byMin + capRadius) {
          const d = Math.hypot(x - centerXBar, y - (byMin + capRadius));
          if (d > capRadius) inside = false;
        } else if (y > byMax - capRadius) {
          const d = Math.hypot(x - centerXBar, y - (byMax - capRadius));
          if (d > capRadius) inside = false;
        }

        if (inside) {
          // #3FB8AF with subtle gradient
          const intensity = 0.85 + 0.15 * barHeights[i];
          return [
            Math.round(63 * intensity),
            Math.round(184 * intensity),
            Math.round(175 * intensity),
            a,
          ];
        }
      }
    }

    return [r, g, b, a];
  });
}

function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#3FB8AF" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#3FB8AF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#55D8CF"/>
      <stop offset="100%" stop-color="#3FB8AF"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="#100E0C"/>
  <circle cx="256" cy="112" r="56" fill="url(#dotGlow)"/>
  <circle cx="256" cy="112" r="28" fill="#3FB8AF"/>
  <g fill="url(#barGrad)">
    <rect x="110" y="246" width="28" height="72" rx="14"/>
    <rect x="154" y="214" width="28" height="136" rx="14"/>
    <rect x="198" y="172" width="28" height="220" rx="14"/>
    <rect x="242" y="152" width="28" height="260" rx="14"/>
    <rect x="286" y="188" width="28" height="188" rx="14"/>
    <rect x="330" y="224" width="28" height="116" rx="14"/>
    <rect x="374" y="254" width="28" height="56" rx="14"/>
  </g>
</svg>`;
}

const iconsDir = path.resolve(process.cwd(), "public", "icons");
fs.mkdirSync(iconsDir, { recursive: true });

console.log("Generating PWA icons...");

fs.writeFileSync(path.join(iconsDir, "icon.svg"), generateSvg(), "utf8");
console.log("✓ Created public/icons/icon.svg");

fs.writeFileSync(path.join(iconsDir, "icon-192x192.png"), renderTrounceIcon(192, false));
console.log("✓ Created public/icons/icon-192x192.png");

fs.writeFileSync(path.join(iconsDir, "icon-512x512.png"), renderTrounceIcon(512, false));
console.log("✓ Created public/icons/icon-512x512.png");

fs.writeFileSync(path.join(iconsDir, "maskable-icon-512x512.png"), renderTrounceIcon(512, true));
console.log("✓ Created public/icons/maskable-icon-512x512.png");

fs.writeFileSync(path.join(iconsDir, "apple-touch-icon.png"), renderTrounceIcon(180, false));
console.log("✓ Created public/icons/apple-touch-icon.png");

console.log("All PWA icons generated successfully!");
