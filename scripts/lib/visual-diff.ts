/**
 * scripts/lib/visual-diff.ts
 * UMBAUPLAN v2.0 Phase 9.2 — Auto-Visual-Diff.
 */

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

export interface PngImage {
  width: number;
  height: number;
  channels: number;
  pixels: Uint8Array;
}

export interface PixelDiffResult {
  score: number;
  diffPixels: number;
  totalPixels: number;
  width: number;
  height: number;
  passed: boolean;
}

export interface CompareResult extends PixelDiffResult {
  threshold: number;
  passScore: number;
}

export function decodePng(buf: Buffer): PngImage {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('decodePng: Buffer required');
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (!buf.subarray(0, 8).equals(sig)) {
    throw new Error('decodePng: invalid PNG signature');
  }

  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos); pos += 4;
    const type = buf.subarray(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.subarray(pos, pos + length); pos += length;
    pos += 4;

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
  let channels: number;
  if (colorType === 2) channels = 3;
  else if (colorType === 6) channels = 4;
  else if (colorType === 0) channels = 1;
  else if (colorType === 4) channels = 2;
  else throw new Error(`decodePng: unsupported color type ${colorType}`);

  const compressed = Buffer.concat(idatChunks);
  const raw = inflateSync(compressed);

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
      let val: number;
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
          let pr: number;
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

export function computePixelDiff({ framer, wp, threshold = 0.1 }: {
  framer: PngImage;
  wp: PngImage;
  threshold?: number;
}): PixelDiffResult {
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
  return { score, diffPixels, totalPixels, width, height, passed: score >= 85 };
}

export function compareImages({ framer, wp, threshold = 0.1, passScore = 85 }: {
  framer: Buffer | PngImage;
  wp: Buffer | PngImage;
  threshold?: number;
  passScore?: number;
}): CompareResult {
  const framerImg = Buffer.isBuffer(framer) ? decodePng(framer) : framer;
  const wpImg = Buffer.isBuffer(wp) ? decodePng(wp) : wp;

  const diff = computePixelDiff({ framer: framerImg, wp: wpImg, threshold });
  const passed = diff.score >= passScore;
  return { ...diff, passed, threshold, passScore };
}

export function hashImage(image: Buffer | PngImage): string {
  const pixels = Buffer.isBuffer(image) ? decodePng(image).pixels : image.pixels;
  return createHash('sha256').update(pixels).digest('hex').slice(0, 16);
}
