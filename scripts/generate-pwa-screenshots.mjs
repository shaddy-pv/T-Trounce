import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function createPng(width, height, getPixel) {
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0;
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

const outDir = path.resolve("public/screenshots");
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Mobile Screenshot (540x960)
console.log("Generating mobile screenshot (540x960)...");
const mobilePng = createPng(540, 960, (x, y) => {
  // Background
  let r = 16, g = 14, b = 12, a = 255;

  // Header area (y < 70)
  if (y < 70) {
    r = 27; g = 24; b = 21;
    // Brand dot at (40, 35)
    if (Math.hypot(x - 40, y - 35) < 7) {
      return [63, 184, 175, 255]; // Teal #3FB8AF
    }
  }

  // Card 1: Daily Speaking Prompt (y between 100 and 320, x between 30 and 510)
  if (x >= 30 && x <= 510 && y >= 100 && y <= 320) {
    r = 27; g = 24; b = 21;
    // Accent border top
    if (y <= 104) {
      r = 63; g = 184; b = 175;
    }
    // Waveform visualization inside card (y around 220)
    if (y >= 180 && y <= 260) {
      const barIdx = Math.floor((x - 60) / 30);
      if (barIdx >= 0 && barIdx < 14) {
        const heights = [20, 35, 55, 70, 45, 60, 30, 65, 75, 50, 40, 60, 35, 25];
        const barH = heights[barIdx];
        const barX = 60 + barIdx * 30;
        if (x >= barX && x <= barX + 16 && Math.abs(y - 220) <= barH / 2) {
          return [63, 184, 175, 255]; // Teal wave
        }
      }
    }
  }

  // Card 2: Fluency Score Card (y between 350 and 550, x between 30 and 510)
  if (x >= 30 && x <= 510 && y >= 350 && y <= 550) {
    r = 27; g = 24; b = 21;
    // Circular score badge at (120, 450)
    const distScore = Math.hypot(x - 120, y - 450);
    if (distScore <= 45 && distScore >= 38) {
      return [63, 184, 175, 255];
    }
  }

  // Floating Microphone Action Button at (270, 750), radius 42
  const distMic = Math.hypot(x - 270, y - 750);
  if (distMic <= 42) {
    return [63, 184, 175, 255]; // Teal mic
  }
  if (distMic <= 52 && distMic > 42) {
    // Pulse ring
    return [63, 184, 175, 80];
  }

  // Bottom Navigation Bar (y > 880)
  if (y > 880) {
    r = 27; g = 24; b = 21;
    if (y === 881) {
      r = 56; g = 52; b = 47; // Border hairline
    }
  }

  return [r, g, b, a];
});

fs.writeFileSync(path.join(outDir, "mobile-practice.png"), mobilePng);

// 2. Desktop Screenshot (1280x720)
console.log("Generating desktop screenshot (1280x720)...");
const desktopPng = createPng(1280, 720, (x, y) => {
  let r = 16, g = 14, b = 12, a = 255;

  // Top header bar (y < 56)
  if (y < 56) {
    r = 27; g = 24; b = 21;
    // Brand dot
    if (Math.hypot(x - 40, y - 28) < 6) {
      return [63, 184, 175, 255];
    }
  }

  // Metric cards row (y between 80 and 190)
  for (let c = 0; c < 4; c++) {
    const cardX = 40 + c * 305;
    if (x >= cardX && x <= cardX + 285 && y >= 80 && y <= 190) {
      r = 27; g = 24; b = 21;
      if (y <= 83 && c === 0) {
        return [63, 184, 175, 255];
      }
    }
  }

  // Table card (y between 220 and 680, x between 40 and 1240)
  if (x >= 40 && x <= 1240 && y >= 220 && y <= 680) {
    r = 27; g = 24; b = 21;
    // Table header row
    if (y <= 265) {
      r = 20; g = 18; b = 15;
    }
    // Table row dividing lines
    if (y % 65 === 0) {
      r = 56; g = 52; b = 47;
    }
  }

  return [r, g, b, a];
});

fs.writeFileSync(path.join(outDir, "desktop-dashboard.png"), desktopPng);
console.log("PWA screenshots generated successfully!");
