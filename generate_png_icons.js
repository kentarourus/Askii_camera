import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

function createBasicPNG(width, height, r = 5, g = 7, b = 10) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  const scanlineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineSize);

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineSize;
    rawData[offset] = 0;

    for (let x = 0; x < width; x++) {
      const pxOffset = offset + 1 + x * 4;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxR = width * 0.4;
      const innerR = width * 0.25;

      if (dist < maxR && dist > innerR) {
        rawData[pxOffset] = 0;     // R
        rawData[pxOffset + 1] = 242; // G (Cyan)
        rawData[pxOffset + 2] = 254; // B
        rawData[pxOffset + 3] = 255; // A
      } else if (dist <= innerR) {
        rawData[pxOffset] = 0;     // R
        rawData[pxOffset + 1] = 255; // G (Matrix Green)
        rawData[pxOffset + 2] = 102; // B
        rawData[pxOffset + 3] = 255; // A
      } else {
        rawData[pxOffset] = r;     // R
        rawData[pxOffset + 1] = g; // G
        rawData[pxOffset + 2] = b; // B
        rawData[pxOffset + 3] = 255; // A
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(4 + 4 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + length));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    for (let j = 0; j < 8; j++) {
      const bit = (crc ^ byte) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
    }
  }
  return crc ^ -1;
}

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createBasicPNG(192, 192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createBasicPNG(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createBasicPNG(180, 180));

console.log('PNG PWA icons (192x192, 512x512, apple-touch-icon) generated successfully.');
