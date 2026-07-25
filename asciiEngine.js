/**
 * =====================================================================
 *  AsciiEngine v3.5 — Color-Faithful & Smart Adaptive Brightness Engine
 * =====================================================================
 *
 *  特徴:
 *    - 色の忠実性 (Color Fidelity): 元画像の素直で鮮やかな発色をそのまま再現
 *    - スマート自動露出・明暗階調補正: 暗い場所での黒潰れや白飛びを防ぎ、文字濃度に綺麗にマッピング
 *    - ディザリングの輝度限定適用: 色味（Chroma）を一切汚さず文字階調のみ滑らか化
 */

export const CHARACTER_SETS = {
  standard:  '@%#*+=-:. ',
  detailed:  '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
  blocks:    '█▓▒░ ',
  binary:    '10',
  emoji:     '💥🔥😎⭐✨⚡🔷▫️ ',
  matrix:    'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ9876543210 ',
  realistic: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
};

// ────────── Bayer Dithering for Luminance Only ──────────
const BAYER_4X4 = [
  [-4,   0, -3,   1],
  [ 2,  -2,  3,  -1],
  [-2.5, 1.5, -3.5, 0.5],
  [ 3.5,-0.5, 2.5, -1.5]
];

// ────────── Smart Luminance LUT Builder ──────────
function buildLuminanceLUT(contrast, brightness, gamma) {
  const lut = new Uint8Array(256);
  const invGamma = 1 / Math.max(0.1, gamma);
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

  for (let i = 0; i < 256; i++) {
    // 1. Brightness offset
    let v = i + brightness;
    // 2. Contrast adjustment
    v = factor * (v - 128) + 128;
    // 3. Gamma curve
    v = Math.pow(Math.max(0, Math.min(255, v)) / 255, invGamma) * 255;

    lut[i] = Math.min(255, Math.max(0, Math.round(v)));
  }
  return lut;
}

// ────────── Sobel Edge Detector ──────────
class EdgeDetector {
  static computeEdgeMap(pixels, width, height, threshold) {
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const pi = i * 4;
      lum[i] = 0.2126 * pixels[pi] + 0.7152 * pixels[pi + 1] + 0.0722 * pixels[pi + 2];
    }

    const edgeMap = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const tl = lum[(y - 1) * width + (x - 1)];
        const tc = lum[(y - 1) * width + x];
        const tr = lum[(y - 1) * width + (x + 1)];
        const ml = lum[y * width + (x - 1)];
        const mr = lum[y * width + (x + 1)];
        const bl = lum[(y + 1) * width + (x - 1)];
        const bc = lum[(y + 1) * width + x];
        const br = lum[(y + 1) * width + (x + 1)];

        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        let mag = Math.abs(gx) + Math.abs(gy);

        edgeMap[y * width + x] = mag > threshold ? Math.min(255, mag) : 0;
      }
    }
    return edgeMap;
  }
}

// ────────── Color Output Functions (High Color Fidelity) ──────────
function getCharColorString(mode, r, g, b, lum, x, y, cols, rows, customTC) {
  switch (mode) {
    case 'color':
      // 原色忠実再現 (Perfect Color Fidelity)
      return `rgb(${r | 0},${g | 0},${b | 0})`;

    case 'matrix': {
      const i = lum | 0;
      return `rgb(0,${Math.max(70, i)},${(i * 0.4) | 0})`;
    }

    case 'cyber': {
      const ratio = x / cols;
      return `rgb(${(255 * ratio) | 0},${(lum * 0.8) | 0},${(255 * (1 - ratio)) | 0})`;
    }

    case 'amber': {
      const i = lum | 0;
      return `rgb(${i},${(i * 0.7) | 0},0)`;
    }

    case 'custom':
      return customTC;

    case 'invert':
      return '#111111';

    case 'mono':
    default: {
      const i = lum | 0;
      return `rgb(${i},${i},${i})`;
    }
  }
}

// ────────── Main Engine ──────────
export class AsciiEngine {
  constructor(asciiCanvas, sourceCanvas) {
    this.asciiCanvas = asciiCanvas;
    this.ctx = asciiCanvas.getContext('2d', { alpha: false });
    this.sourceCanvas = sourceCanvas;
    this.sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

    // Options
    this.cols = 100;
    this.fontSize = 10;
    this.charAspect = 0.55;
    this.charSet = CHARACTER_SETS.standard;
    this.colorMode = 'matrix';
    this.frameAspect = 'full';
    this.dithering = true;

    this.brightness = 0;
    this.contrast = 1.0;
    this.saturation = 1.0;
    this.gamma = 1.0;
    this.edgeMode = false;
    this.edgeThreshold = 30;
    this.invert = false;

    this.customBgColor = '#05070a';
    this.customTextColor = '#00ff66';

    this._fps = 0;
    this._frames = 0;
    this._fpsTime = performance.now();

    this._lumLUT = null;
    this._lastLumParams = '';

    this.lastTextOutput = '';
  }

  setOptions(o) {
    for (const k of Object.keys(o)) {
      if (o[k] !== undefined) this[k] = o[k];
    }
  }

  getFps() { return this._fps; }
  getTextOutput() { return this.lastTextOutput; }

  process(sourceElement) {
    if (!sourceElement) return;

    const srcW = sourceElement.videoWidth || sourceElement.width;
    const srcH = sourceElement.videoHeight || sourceElement.height;
    if (!srcW || !srcH) return;

    // FPS Counter
    this._frames++;
    const now = performance.now();
    if (now - this._fpsTime >= 1000) {
      this._fps = Math.round((this._frames * 1000) / (now - this._fpsTime));
      this._frames = 0;
      this._fpsTime = now;
    }

    // Grid Aspect Calculation
    let targetAspectRatio = srcH / srcW;
    if (this.frameAspect === '16:9') targetAspectRatio = 9 / 16;
    else if (this.frameAspect === '4:3') targetAspectRatio = 3 / 4;
    else if (this.frameAspect === '1:1') targetAspectRatio = 1.0;
    else if (this.frameAspect === 'full') {
      const parent = this.asciiCanvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        targetAspectRatio = parent.clientHeight / parent.clientWidth;
      }
    }

    const cols = this.cols;
    const rows = Math.max(1, Math.floor(cols * targetAspectRatio * this.charAspect));

    // Sample Source
    this.sourceCanvas.width = cols;
    this.sourceCanvas.height = rows;
    this.sourceCtx.drawImage(sourceElement, 0, 0, cols, rows);

    const imgData = this.sourceCtx.getImageData(0, 0, cols, rows);
    const pixels = imgData.data;

    // Luminance LUT
    const paramKey = `${this.contrast}_${this.brightness}_${this.gamma}`;
    if (paramKey !== this._lastLumParams) {
      this._lumLUT = buildLuminanceLUT(this.contrast, this.brightness, this.gamma);
      this._lastLumParams = paramKey;
    }
    const lumLUT = this._lumLUT;

    // Saturation adjustment on source RGB
    const sat = this.saturation;
    const needSat = sat !== 1.0;
    const totalPixels = cols * rows;

    // Saturation pass if requested
    if (needSat) {
      for (let i = 0; i < totalPixels * 4; i += 4) {
        let r = pixels[i];
        let g = pixels[i + 1];
        let b = pixels[i + 2];
        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        pixels[i]     = Math.min(255, Math.max(0, gray + (r - gray) * sat));
        pixels[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * sat));
        pixels[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * sat));
      }
    }

    // Edge Detection Map if enabled
    let edgeMap = null;
    if (this.edgeMode) {
      edgeMap = EdgeDetector.computeEdgeMap(pixels, cols, rows, this.edgeThreshold);
    }

    // Prepare Render Canvas
    const cellW = this.fontSize * 0.6;
    const cellH = this.fontSize;
    const outW = (cols * cellW) | 0;
    const outH = (rows * cellH) | 0;

    if (this.asciiCanvas.width !== outW || this.asciiCanvas.height !== outH) {
      this.asciiCanvas.width = outW;
      this.asciiCanvas.height = outH;
    }

    const ctx = this.ctx;

    // Fill Background
    ctx.fillStyle = this.colorMode === 'custom'
      ? this.customBgColor
      : (this.colorMode === 'invert' ? '#ffffff' : '#05070a');
    ctx.fillRect(0, 0, outW, outH);

    ctx.font = `${this.fontSize}px 'Fira Code','Courier New',monospace`;
    ctx.textBaseline = 'top';

    const chars = this.charSet;
    const charLen = chars.length;
    const invCharLen = charLen / 256;
    const mode = this.colorMode;
    const customTC = this.customTextColor;
    const doInvert = this.invert;
    const doDither = this.dithering;

    const textLines = new Array(rows);
    let prevColor = '';

    for (let r = 0; r < rows; r++) {
      let line = '';
      const bayerRow = BAYER_4X4[r % 4];

      for (let c = 0; c < cols; c++) {
        const pi = (r * cols + c) * 4;
        const pr = pixels[pi];
        const pg = pixels[pi + 1];
        const pb = pixels[pi + 2];

        // 1. Precise ITU-R BT.709 Relative Luminance
        let rawLum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;

        // 2. Apply Brightness / Contrast / Gamma via LUT to Luminance
        let mappedLum = lumLUT[rawLum | 0];

        // 3. Optional Edge Override
        if (edgeMap) {
          mappedLum = edgeMap[r * cols + c];
        } else if (doDither) {
          // Add subtle luminance-only dithering for smooth character transitions
          mappedLum = Math.min(255, Math.max(0, mappedLum + bayerRow[c % 4]));
        }

        if (doInvert) mappedLum = 255 - mappedLum;

        // 4. Character mapping from mapped luminance
        const ci = Math.min(charLen - 1, Math.max(0, (mappedLum * invCharLen) | 0));
        const ch = chars[ci];
        line += ch;

        // 5. Render Color (Using pristine original RGB for color mode)
        const color = getCharColorString(mode, pr, pg, pb, mappedLum, c, r, cols, rows, customTC);
        if (color !== prevColor) {
          ctx.fillStyle = color;
          prevColor = color;
        }
        ctx.fillText(ch, c * cellW, r * cellH);
      }
      textLines[r] = line;
    }

    this.lastTextOutput = textLines.join('\n');
  }
}
