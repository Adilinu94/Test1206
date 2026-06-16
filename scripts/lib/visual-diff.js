/**
 * scripts/lib/visual-diff.js
 * UMBAUPLAN v2.0 Phase 9.2 — Auto-Visual-Diff.
 *
 * Vergleicht zwei Screenshots (Framer-Original vs WP-Output) pixel-by-pixel.
 * Verwendet einen Pure-Node-Pixelmatch-Lookalike (ohne externe Deps), um portable
 * Tests ohne Canvas/ImageMagick zu ermöglichen. Für Production mit Playwright
 * sollten die Buffer direkt via fetch + sharp verarbeitet werden.
 *
 * Akzeptiert:
 *   - Buffer (PNG-encoded) → wird zu width/height/pixeldata dekodiert
 *   - { width, height, pixels } → bereits dekodiert
 *
 * Score-Berechnung: 0-100% (Anteil der Pixel mit akzeptabler Distanz).
 *
 * Threshold: ≥85% gilt als "pass" (UMBAUPLAN §6.2 Erfolgskriterium 11).
 *
 * API:
 *   const result = compareImages({ framer: pngBuffer, wp: pngBuffer, threshold: 0.1 });
 *   // result = { score, diffPixels, totalPixels, width, height, passed }
 */

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

// ─────────────────────────────────────────────
// PNG DECODING (Pure-Node, minimal subset)
// ─────────────────────────────────────────────

/**
 * Lightweight PNG-Decoder für unseren Visual-Diff-Use-Case.
 * Unterstützt nur 8-bit RGB/RGBA (keine 16-bit, keine Palettes).
 * Wirft für andere Formate.
 *
 * @param {Buffer} buf
 * @returns {{width: number, height: number, channels: number, pixels: Uint8Array}}
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('decodePng: Buffer required');
  }
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!buf.subarray(0, 8).equals(sig)) {
    throw new Error('decodePng: invalid PNG signature');
  }

  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos); pos += 4;
    const type = buf.subarray(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.subarray(pos, pos + length); pos += length;
    pos += 4; // skip CRC

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) {
    throw new Error(`decodePng: unsupported bit depth ${bitDepth} (only 8-bit)`);
  }
  // colorType: 2=RGB, 6=RGBA, 0=Grayscale, 4=Grayscale+Alpha
  let channels;
  if (colorType === 2) channels = 3;
  else if (colorType === 6) channels = 4;
  else if (colorType === 0) channels = 1;
  else if (colorType === 4) channels = 2;
  else throw new Error(`decodePng: unsupported color type ${colorType}`);

  // Concatenate IDAT chunks
  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

  // Reconstruct pixel data (remove filter bytes)
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let prevRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const row = raw.subarray(rowStart, rowStart + stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = row[x]; break;
        case 1: val = (row[x] + a) & 0xFF; break;
        case 2: val = (row[x] + b) & 0xFF; break;
        case 3: val = (row[x] + Math.floor((a + b) / 2)) & 0xFF; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          let pr;
          if (pa <= pb && pa <= pc) pr = a;
          else if (pb <= pc) pr = b;
          else pr = c;
          val = (row[x] + pr) & 0xFF;
          break;
        }
        default: val = row[x];
      }
      pixels[y * stride + x] = val;
    }
    prevRow = pixels.subarray(y * stride, (y + 1) * stride);
  }

  return { width, height, channels, pixels };
}

// ─────────────────────────────────────────────
// PIXEL DIFF
// ─────────────────────────────────────────────

/**
 * Berechnet einen einfachen Pixel-Diff-Score.
 *
 * @param {object} opts
 * @param {{width: number, height: number, channels: number, pixels: Uint8Array}} opts.framer
 * @param {{width: number, height: number, channels: number, pixels: Uint8Array}} opts.wp
 * @param {number} [opts.threshold=0.1] - 0=strict, 1=loose
 * @returns {{score: number, diffPixels: number, totalPixels: number, passed: boolean}}
 */
export function computePixelDiff({ framer, wp, threshold = 0.1 }) {
  if (framer.width !== wp.width || framer.height !== wp.height) {
    throw new Error(`computePixelDiff: dimension mismatch (${framer.width}x${framer.height} vs ${wp.width}x${wp.height})`);
  }

  const width = framer.width;
  const height = framer.height;
  const channels = Math.min(framer.channels, wp.channels);
  const totalPixels = width * height;
  let diffPixels = 0;
  const tol = threshold * 255;

  for (let i = 0; i < totalPixels; i++) {
    const offset = i * channels;
    for (let c = 0; c < channels; c++) {
      const a = framer.pixels[offset + c];
      const b = wp.pixels[offset + c];
      if (Math.abs(a - b) > tol) {
        diffPixels++;
        break;
      }
    }
  }

  const score = Math.round(((totalPixels - diffPixels) / totalPixels) * 10000) / 100;
  return {
    score,
    diffPixels,
    totalPixels,
    width,
    height,
    passed: score >= 85,
  };
}

// ─────────────────────────────────────────────
// CONVENIENCE API
// ─────────────────────────────────────────────

/**
 * Vergleicht zwei PNG-Buffer.
 *
 * @param {object} opts
 * @param {Buffer} opts.framer
 * @param {Buffer} opts.wp
 * @param {number} [opts.threshold=0.1]
 * @param {number} [opts.passScore=85]
 * @returns {object} comparison result
 */
export function compareImages({ framer, wp, threshold = 0.1, passScore = 85 }) {
  const framerImg = Buffer.isBuffer(framer) ? decodePng(framer) : framer;
  const wpImg = Buffer.isBuffer(wp) ? decodePng(wp) : wp;

  const diff = computePixelDiff({ framer: framerImg, wp: wpImg, threshold });
  const passed = diff.score >= passScore;
  return { ...diff, passed, threshold, passScore };
}

/**
 * Generiert einen Hash für ein Image (für Cache-Vergleiche).
 *
 * @param {{width: number, height: number, pixels: Uint8Array}|Buffer} image
 * @returns {string} SHA-256 hash (16 chars)
 */
export function hashImage(image) {
  const pixels = Buffer.isBuffer(image) ? decodePng(image).pixels : image.pixels;
  return createHash('sha256').update(pixels).digest('hex').slice(0, 16);
}
