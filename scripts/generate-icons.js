#!/usr/bin/env node
'use strict';

// Procedurally generates every app icon referenced by app.json.
// No image libraries: hand-rolled PNG encoder (8-bit RGBA, zlib deflate)
// plus a scanline renderer with 4x supersampling for smooth edges.
// Run with: node scripts/generate-icons.js  (or: npm run icons)

const fs = require('node:fs');
const zlib = require('node:zlib');
const { Buffer } = require('node:buffer');

const OUTPUT_DIR = `${__dirname}/../assets/images`;
const SUPERSAMPLE = 4;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

// Brand colors, matching Colors.primary and Colors.dark.accent in src/constants/theme.ts.
const GRADIENT_TOP = hexToRgb('#0D7A6C');
const GRADIENT_BOTTOM = hexToRgb('#0A5D53');
const PAGE_WHITE = hexToRgb('#FFFFFF');
const CRESCENT_AMBER = hexToRgb('#E9A23B');

// Glyph geometry in unit coordinates within the glyph's bounding square.
const SPINE_HALF_GAP = 0.022;
const BOOK_OUTER_MARGIN = 0.07;
const BOOK_TOP_AT_SPINE = 0.4;
const BOOK_TOP_AT_EDGE = 0.48;
const BOOK_BOTTOM = 0.9;
const MOON_CX = 0.5;
const MOON_CY = 0.175;
const MOON_R = 0.115;
const MOON_CUT_CX = 0.545;
const MOON_CUT_CY = 0.145;
const MOON_CUT_R = 0.105;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba, compressionLevel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with filter byte 0 (None).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: compressionLevel })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Glyph shape tests (unit coordinates, 0..1 within the glyph square)
// ---------------------------------------------------------------------------

function inBook(u, v) {
  const fromSpine = Math.abs(u - 0.5);
  if (fromSpine < SPINE_HALF_GAP) {
    return false;
  }
  if (u < BOOK_OUTER_MARGIN || u > 1 - BOOK_OUTER_MARGIN) {
    return false;
  }
  const pageWidth = 0.5 - SPINE_HALF_GAP - BOOK_OUTER_MARGIN;
  const t = (fromSpine - SPINE_HALF_GAP) / pageWidth;
  // Pages lift toward the spine: the top edge falls away quadratically outward.
  const topY = BOOK_TOP_AT_SPINE + (BOOK_TOP_AT_EDGE - BOOK_TOP_AT_SPINE) * t * t;
  return v >= topY && v <= BOOK_BOTTOM;
}

function inCrescent(u, v) {
  const dOuter = (u - MOON_CX) ** 2 + (v - MOON_CY) ** 2;
  if (dOuter > MOON_R * MOON_R) {
    return false;
  }
  const dCut = (u - MOON_CUT_CX) ** 2 + (v - MOON_CUT_CY) ** 2;
  return dCut >= MOON_CUT_R * MOON_CUT_R;
}

// ---------------------------------------------------------------------------
// Scene rendering: supersample 4x per axis, box-downsample row blocks so the
// full-resolution buffer never has to exist in memory.
// ---------------------------------------------------------------------------

function renderScene(size, options) {
  const { gradient, glyphScale, glyphStyle } = options;
  const superSize = size * SUPERSAMPLE;
  const samplesPerPixel = SUPERSAMPLE * SUPERSAMPLE;
  const out = Buffer.alloc(size * size * 4);

  const glyphSide = glyphScale > 0 ? superSize * glyphScale : 0;
  const glyphOrigin = (superSize - glyphSide) / 2;
  const crescentColor = glyphStyle === 'white' ? PAGE_WHITE : CRESCENT_AMBER;

  const sumA = new Float64Array(size);
  const sumR = new Float64Array(size);
  const sumG = new Float64Array(size);
  const sumB = new Float64Array(size);

  for (let yOut = 0; yOut < size; yOut++) {
    sumA.fill(0);
    sumR.fill(0);
    sumG.fill(0);
    sumB.fill(0);

    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      const ySuper = yOut * SUPERSAMPLE + sy;
      const gradT = ySuper / (superSize - 1);
      const bgR = GRADIENT_TOP.r + (GRADIENT_BOTTOM.r - GRADIENT_TOP.r) * gradT;
      const bgG = GRADIENT_TOP.g + (GRADIENT_BOTTOM.g - GRADIENT_TOP.g) * gradT;
      const bgB = GRADIENT_TOP.b + (GRADIENT_BOTTOM.b - GRADIENT_TOP.b) * gradT;
      const v = glyphSide > 0 ? (ySuper + 0.5 - glyphOrigin) / glyphSide : -1;
      const rowInGlyph = v >= 0 && v <= 1;

      for (let xSuper = 0; xSuper < superSize; xSuper++) {
        const xOut = (xSuper / SUPERSAMPLE) | 0;
        let color = null;
        if (rowInGlyph) {
          const u = (xSuper + 0.5 - glyphOrigin) / glyphSide;
          if (u >= 0 && u <= 1) {
            if (inCrescent(u, v)) {
              color = crescentColor;
            } else if (inBook(u, v)) {
              color = PAGE_WHITE;
            }
          }
        }
        if (color !== null) {
          sumA[xOut] += 1;
          sumR[xOut] += color.r;
          sumG[xOut] += color.g;
          sumB[xOut] += color.b;
        } else if (gradient) {
          sumA[xOut] += 1;
          sumR[xOut] += bgR;
          sumG[xOut] += bgG;
          sumB[xOut] += bgB;
        }
      }
    }

    for (let xOut = 0; xOut < size; xOut++) {
      const offset = (yOut * size + xOut) * 4;
      const coverage = sumA[xOut];
      if (coverage > 0) {
        // Alpha-weighted average avoids dark fringes on transparent backgrounds.
        out[offset] = Math.round(sumR[xOut] / coverage);
        out[offset + 1] = Math.round(sumG[xOut] / coverage);
        out[offset + 2] = Math.round(sumB[xOut] / coverage);
        out[offset + 3] = Math.round((coverage / samplesPerPixel) * 255);
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

const OUTPUTS = [
  {
    file: 'icon.png',
    size: 1024,
    options: { gradient: true, glyphScale: 0.62, glyphStyle: 'color' },
  },
  {
    file: 'android-icon-background.png',
    size: 1024,
    options: { gradient: true, glyphScale: 0, glyphStyle: 'color' },
  },
  {
    // Adaptive icons crop to a central circle; 55% keeps the glyph in the safe zone.
    file: 'android-icon-foreground.png',
    size: 1024,
    options: { gradient: false, glyphScale: 0.55, glyphStyle: 'color' },
  },
  {
    file: 'android-icon-monochrome.png',
    size: 1024,
    options: { gradient: false, glyphScale: 0.55, glyphStyle: 'white' },
  },
  {
    file: 'splash-icon.png',
    size: 512,
    options: { gradient: false, glyphScale: 0.84, glyphStyle: 'white' },
  },
  {
    // 48px flat art deflates below the 1KB sanity floor, so store it uncompressed.
    file: 'favicon.png',
    size: 48,
    compressionLevel: 0,
    options: { gradient: true, glyphScale: 0.62, glyphStyle: 'color' },
  },
];

function verifyPng(filePath, expectedSize) {
  const data = fs.readFileSync(filePath);
  const signatureOk =
    data.length > 24 && PNG_SIGNATURE.every((byte, index) => data[index] === byte);
  if (!signatureOk) {
    return { ok: false, reason: 'bad PNG signature', bytes: data.length };
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    return { ok: false, reason: `IHDR ${width}x${height}, expected ${expectedSize}`, bytes: data.length };
  }
  if (data.length <= 1024) {
    return { ok: false, reason: `only ${data.length} bytes`, bytes: data.length };
  }
  return { ok: true, width, height, bytes: data.length };
}

function main() {
  let failed = false;
  for (const output of OUTPUTS) {
    const rgba = renderScene(output.size, output.options);
    const png = encodePng(output.size, output.size, rgba, output.compressionLevel ?? 9);
    const filePath = `${OUTPUT_DIR}/${output.file}`;
    fs.writeFileSync(filePath, png);

    const result = verifyPng(filePath, output.size);
    if (result.ok) {
      console.log(`ok    ${output.file}  ${result.width}x${result.height}  ${result.bytes} bytes`);
    } else {
      failed = true;
      console.error(`FAIL  ${output.file}  ${result.reason}`);
    }
  }
  if (failed) {
    process.exitCode = 1;
  }
}

main();
